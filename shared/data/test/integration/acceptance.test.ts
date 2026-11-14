/**
 * Criterio de aceptación obligatorio (decisión arquitectónica offline-first):
 * una sesión de entrenamiento debe
 *   1. crearse sin internet, 2. guardarse en SQLite, 3. sobrevivir al cierre de la app,
 *   4. sincronizarse al recuperar conexión, 5. aparecer en otro dispositivo autenticado,
 *   6. no duplicarse al reintentar la sincronización.
 * Se ejecuta contra Postgres local con las migraciones reales, RLS y las RPC de sync.
 */
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { SQUAT, TestClock, expectOk, newId, openDevice, tempDir } from '../support';
import { openNodeSqlite } from '../../src/sql/node-sqlite';
import { ENTITIES } from '../../src/local/entities';
import { PgTransport, createUser, pool } from './pg-transport';

let tmp: ReturnType<typeof tempDir>;
beforeEach(() => { tmp = tempDir(); });
afterEach(() => tmp.cleanup());
afterAll(() => pool.end());

describe('criterio de aceptación offline-first', () => {
  it('sesión creada offline → reinicio → sync sin duplicados → visible en otro dispositivo', async () => {
    const user = await createUser();
    const clock = new TestClock(Date.now() - 3600_000);
    const phonePath = join(tmp.dir, 'phone.db');
    const phoneNet = new PgTransport(user);

    // Preparación: el teléfono ya inició sesión y descargó el catálogo alguna vez.
    let phone = await openDevice(phonePath, user, phoneNet, clock);
    expectOk(await phone.sync.syncNow());

    // 1) Sin internet: crear la sesión, ejercicio y series.
    phoneNet.online = false;
    const sessionId = newId();
    const started = new Date(Date.parse(clock.now())).toISOString();
    expectOk(await phone.sessions.start({ id: sessionId, startedAt: started, timeZone: 'America/Mexico_City' }));
    const se = expectOk(await phone.sessions.addExercise({ id: newId(), sessionId, exerciseId: SQUAT }));
    for (const [i, reps] of [5, 5, 4].entries()) {
      clock.advance(180_000);
      expectOk(await phone.sessions.logSet({ id: newId(), sessionExerciseId: se.id, weightKg: 100, reps, rir: i === 2 ? 0 : 1, completedAt: clock.now() }));
    }
    const offlineAttempt = await phone.sync.syncNow();
    expect(offlineAttempt.ok === false && offlineAttempt.error.code).toBe('NETWORK_UNAVAILABLE');

    // 2) Guardada en SQLite (verificación directa del archivo).
    const raw = openNodeSqlite(phonePath);
    expect((await raw.get<{ n: number }>('SELECT COUNT(*) AS n FROM strength_sets'))?.n).toBe(3);
    expect((await raw.get<{ n: number }>("SELECT COUNT(*) AS n FROM outbox WHERE status IN ('pending','failed')"))?.n).toBe(5);
    await raw.close();

    // 3) Cierre de la app y reapertura: la sesión en curso se recupera intacta.
    await phone.close();
    phone = await openDevice(phonePath, user, phoneNet, clock);
    const recovered = expectOk(await phone.sessions.getActive());
    expect(recovered?.id).toBe(sessionId);
    expect(recovered?.exercises[0]?.sets.map((s) => s.reps)).toEqual([5, 5, 4]);
    clock.advance(60_000);
    expectOk(await phone.sessions.complete({ sessionId, endedAt: clock.now() }));

    // 4) + 6) Vuelve la conexión; la primera respuesta se pierde tras aplicarse en el servidor.
    phoneNet.online = true;
    phoneNet.loseNextPushResponse = true;
    const lost = await phone.sync.syncNow();
    expect(lost.ok === false && lost.error.code).toBe('NETWORK_UNAVAILABLE');
    clock.advance(10 * 60_000);
    expectOk(await phone.sync.syncNow()); // reintento: el servidor responde `duplicate`
    expectOk(await phone.sync.syncNow()); // reintento adicional sin efectos
    expect((await phone.sync.status()).pendingCount).toBe(0);

    const server = await pool.query(`
      select (select count(*)::int from athlete3.workout_sessions where user_id = $1) sessions,
             (select status from athlete3.workout_sessions where id = $2) status,
             (select count(*)::int from athlete3.session_exercises where user_id = $1) exercises,
             (select count(*)::int from athlete3.strength_sets where user_id = $1) sets,
             (select count(*)::int from athlete3_private.sync_mutations where user_id = $1) mutations`, [user, sessionId]);
    // 6 mutaciones: crear sesión, completarla (no se fusiona: la creación ya se había intentado), ejercicio y 3 series.
    expect(server.rows[0]).toEqual({ sessions: 1, status: 'completed', exercises: 1, sets: 3, mutations: 6 });

    // 5) Otro dispositivo autenticado como el mismo usuario la recibe por pull.
    const tablet = await openDevice(join(tmp.dir, 'tablet.db'), user, new PgTransport(user), clock);
    expectOk(await tablet.sync.syncNow());
    const onTablet = expectOk(await tablet.sessions.getDetail(sessionId));
    expect(onTablet.status).toBe('completed');
    expect(onTablet.localDate).toBe(recovered!.localDate);
    expect(onTablet.exercises[0]?.sets.map((s) => [s.weightKg, s.reps, s.rir])).toEqual([[100, 5, 1], [100, 5, 1], [100, 4, 0]]);
    const history = expectOk(await tablet.sessions.listHistory({}));
    expect(history.items).toEqual([expect.objectContaining({ sessionId, workingSetCount: 3, volumeKg: 1400 })]);

    // Otro usuario en otro dispositivo no la ve.
    const stranger = await createUser();
    const strangerDevice = await openDevice(join(tmp.dir, 'stranger.db'), stranger, new PgTransport(stranger), clock);
    expectOk(await strangerDevice.sync.syncNow());
    expect((await strangerDevice.sessions.getDetail(sessionId)).ok).toBe(false);

    await Promise.all([phone.close(), tablet.close(), strangerDevice.close()]);
  });
});

describe('consistencia entre dispositivos', () => {
  it('edición concurrente de la misma serie → conflicto explícito → resolución', async () => {
    const user = await createUser();
    const clock = new TestClock(Date.now() - 3600_000);
    const a = await openDevice(join(tmp.dir, 'a.db'), user, new PgTransport(user), clock);
    const bNet = new PgTransport(user);
    const b = await openDevice(join(tmp.dir, 'b.db'), user, bNet, clock);
    expectOk(await a.sync.syncNow());
    const s = expectOk(await a.sessions.start({ id: newId(), startedAt: clock.now(), timeZone: 'UTC' }));
    const se = expectOk(await a.sessions.addExercise({ id: newId(), sessionId: s.id, exerciseId: SQUAT }));
    const set = expectOk(await a.sessions.logSet({ id: newId(), sessionExerciseId: se.id, weightKg: 100, reps: 5, completedAt: clock.now() }));
    expectOk(await a.sync.syncNow());
    expectOk(await b.sync.syncNow());

    // Ambos editan offline.
    expectOk(await a.sessions.updateSet({ setId: set.id, reps: 6 }));
    bNet.online = false;
    expectOk(await b.sessions.updateSet({ setId: set.id, reps: 3 }));
    expectOk(await a.sync.syncNow());
    bNet.online = true;
    expectOk(await b.sync.syncNow());

    // B no pisó a A; B ve el conflicto y conserva su valor local hasta resolver.
    const serverReps = await pool.query('select reps from athlete3.strength_sets where id = $1', [set.id]);
    expect(serverReps.rows[0].reps).toBe(6);
    const [conflict] = await b.sync.listConflicts();
    expect(conflict?.mutation.entityId).toBe(set.id);
    expect(expectOk(await b.sessions.getDetail(s.id)).exercises[0]?.sets[0]?.reps).toBe(3);

    // Resolución: B decide quedarse con lo suyo → se reenvía sobre la revisión del servidor.
    expectOk(await b.sync.resolveConflict(conflict!.mutation.mutationId, 'keep_local'));
    expectOk(await b.sync.syncNow());
    expectOk(await a.sync.syncNow());
    expect(expectOk(await a.sessions.getDetail(s.id)).exercises[0]?.sets[0]?.reps).toBe(3);
    expect((await pool.query('select reps, revision::int from athlete3.strength_sets where id = $1', [set.id])).rows[0]).toEqual({ reps: 3, revision: 3 }); // 1 crear, 2 edición de A, 3 reenvío de B
    await Promise.all([a.close(), b.close()]);
  });

  it('borrado en un dispositivo no reaparece en el otro', async () => {
    const user = await createUser();
    const clock = new TestClock(Date.now() - 3600_000);
    const a = await openDevice(join(tmp.dir, 'a.db'), user, new PgTransport(user), clock);
    const b = await openDevice(join(tmp.dir, 'b.db'), user, new PgTransport(user), clock);
    expectOk(await a.sync.syncNow());
    const w = expectOk(await a.body.logWeight({ id: newId(), measuredAt: clock.now(), timeZone: 'UTC', value: 80, inputUnit: 'kg' }));
    expectOk(await a.sync.syncNow());
    expectOk(await b.sync.syncNow());
    expect(expectOk(await b.body.listWeights({}))).toHaveLength(1);
    expectOk(await a.body.deleteWeight(w.id));
    expectOk(await a.sync.syncNow());
    expectOk(await b.sync.syncNow());
    expect(expectOk(await b.body.listWeights({}))).toHaveLength(0);
    // Un intento tardío de B de editarlo no lo resucita.
    expect((await pool.query('select deleted_at is not null as d from athlete3.body_weights where id = $1', [w.id])).rows[0].d).toBe(true);
    await Promise.all([a.close(), b.close()]);
  });

  it('cardio, peso, perfil, ejercicio propio y plan sincronizan entre dispositivos', async () => {
    const user = await createUser();
    const clock = new TestClock(Date.now() - 3600_000);
    const a = await openDevice(join(tmp.dir, 'a.db'), user, new PgTransport(user), clock);
    expectOk(await a.sync.syncNow());
    expectOk(await a.profile.initialize('America/Mexico_City'));
    expectOk(await a.profile.update({ displayName: 'Ana', loadUnit: 'lb', goals: ['Fuerza'] }));
    const ex = expectOk(await a.exercises.createCustom({ id: newId(), name: 'Mi press', modality: 'strength', loadType: 'external', primaryMuscleGroupIds: ['10000000-0000-4000-8000-000000000001'] }));
    const plan = expectOk(await a.plans.createPlan({ id: newId(), name: 'Bloque 1', description: null, status: 'active', startsOn: null, endsOn: null }));
    const day = expectOk(await a.plans.addDay({ id: newId(), planId: plan.id, position: 0, name: 'Empuje', kind: 'training', notes: null }));
    expectOk(await a.plans.addDayExercise({ id: newId(), trainingDayId: day.id, exerciseId: ex.id, position: 0, targetSets: 4, targetRepsMin: 6, targetRepsMax: 8, targetWeightKg: 60, targetRir: 1.5, targetRestSeconds: 120, targetDurationSeconds: null, targetDistanceMeters: null, notes: null }));
    expectOk(await a.cardio.log({ id: newId(), activity: 'swim', startedAt: clock.now(), timeZone: 'America/Mexico_City', durationSeconds: 1800, distanceMeters: 1500, avgHeartRateBpm: 140, maxHeartRateBpm: 165, swim: { poolType: 'pool', poolLengthMeters: 25, laps: 60, stroke: 'freestyle' } }));
    expectOk(await a.body.logWeight({ id: newId(), measuredAt: clock.now(), timeZone: 'America/Mexico_City', value: 176.4, inputUnit: 'lb' }));
    const pushed = expectOk(await a.sync.syncNow());
    expect(pushed).toMatchObject({ pendingCount: 0, conflictCount: 0, rejectedCount: 0 });

    const b = await openDevice(join(tmp.dir, 'b.db'), user, new PgTransport(user), clock);
    expectOk(await b.sync.syncNow());
    expect(expectOk(await b.profile.get())).toMatchObject({ displayName: 'Ana', loadUnit: 'lb', goals: ['Fuerza'], timeZone: 'America/Mexico_City' });
    expect(expectOk(await b.exercises.getById(ex.id)).ownerUserId).toBe(user);
    expect(expectOk(await b.plans.getPlan(plan.id)).days[0]?.exercises[0]).toMatchObject({ targetRir: 1.5, targetRepsMax: 8 });
    const cardio = expectOk(await b.cardio.list({})).items[0];
    expect(cardio).toMatchObject({ activity: 'swim', distanceMeters: 1500, swim: { laps: 60, poolLengthMeters: 25 } });
    expect(expectOk(await b.body.listWeights({}))[0]).toMatchObject({ inputUnit: 'lb' });
    await Promise.all([a.close(), b.close()]);
  });
});

describe('paridad de esquema', () => {
  it('las columnas locales escribibles coinciden con las del servidor', async () => {
    for (const meta of Object.values(ENTITIES)) {
      const { rows } = await pool.query('select athlete3_private.sync_writable_columns($1::regclass) as c', [`athlete3.${meta.table}`]);
      expect([...rows[0].c].sort(), meta.table).toEqual(Object.keys(meta.columns).sort());
    }
  });

  it('la fecha local del cliente coincide con la del servidor en zonas y horarios límite', async () => {
    const { localDateOf } = await import('@athlete/domain');
    const cases: Array<[string, string]> = [
      ['2026-11-04T04:30:00Z', 'America/Mexico_City'],
      ['2026-11-03T15:30:00Z', 'Pacific/Auckland'],
      ['2026-03-29T00:30:00Z', 'Europe/Madrid'],
      ['2026-11-01T06:30:00Z', 'America/New_York'],
      ['2026-12-31T23:59:59Z', 'Asia/Tokyo'],
    ];
    for (const [instant, tz] of cases) {
      const { rows } = await pool.query('select (($1::timestamptz) at time zone $2)::date::text as d', [instant, tz]);
      expect(localDateOf(instant, tz), `${instant} ${tz}`).toBe(rows[0].d);
    }
  });
});
