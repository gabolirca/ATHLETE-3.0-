/**
 * Contratos 0.3.0 contra Postgres local (migraciones reales, RLS y RPC de sync):
 *  - el catálogo incluido en la app es idéntico al del servidor;
 *  - un dispositivo sin cuenta trabaja offline y, al iniciar sesión, adopta sus datos y los sincroniza sin rechazos.
 */
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BUNDLED_CATALOG, CATALOG_EXERCISE_ID } from '../../src/catalog/bundled';
import { openAthleteData } from '../../src/open';
import { MemorySecureStore, TestClock, cipherOpener, expectOk, newId, randomBytesSync, tempDir } from '../support';
import { PgTransport, createUser, pool } from './pg-transport';

let tmp: ReturnType<typeof tempDir>;
beforeEach(() => { tmp = tempDir(); });
afterEach(() => tmp.cleanup());
afterAll(() => pool.end());

const SQUAT = CATALOG_EXERCISE_ID['back-squat']!;

function device(secure: MemorySecureStore, account: PgTransport | undefined, clock: TestClock) {
  return openAthleteData({ openDatabase: cipherOpener(tmp.dir).open, secureStore: secure, randomBytes: randomBytesSync, clock, ...(account ? { accountTransport: account } : {}) });
}

describe('contratos 0.3.0 contra el servidor', () => {
  it('el catálogo incluido coincide con athlete3.catalog_snapshot()', async () => {
    const user = await createUser();
    const server = expectOk(await new PgTransport(user).pullCatalog());
    const pick = (e: Record<string, unknown>) => ({
      id: e.id, slug: e.slug, name: e.name, modality: e.modality, load_type: e.load_type, user_id: e.user_id ?? null,
      primary: [...(e.primary_muscle_group_ids as string[])].sort(), secondary: [...(e.secondary_muscle_group_ids as string[])].sort(),
      equipment: [...(e.equipment_ids as string[])].sort(), instructions: e.instructions ?? null, archived_at: e.archived_at ?? null,
      movement_pattern: e.movement_pattern, mechanics: e.mechanics, is_unilateral: e.is_unilateral, access_tier: e.access_tier,
    });
    const byId = <T extends { id: unknown }>(xs: T[]) => [...xs].sort((a, b) => String(a.id).localeCompare(String(b.id)));
    expect(byId(server.exercises.filter((e) => e.user_id == null).map(pick))).toEqual(byId(BUNDLED_CATALOG.exercises.map(pick)));
    expect(byId(server.muscleGroups)).toEqual(byId(BUNDLED_CATALOG.muscleGroups));
    expect(byId(server.equipment)).toEqual(byId(BUNDLED_CATALOG.equipment));
    expect(BUNDLED_CATALOG.exercises).toHaveLength(105);
  });

  it('sin cuenta → ciclo offline → iniciar sesión → adoptar → sincronizar: 0 rechazos y datos del usuario correcto', async () => {
    const clock = new TestClock(Date.now() - 3600_000);
    const secure = new MemorySecureStore();
    const local = await device(secure, undefined, clock);
    expectOk(await local.profile.initialize('America/Mexico_City'));
    expectOk(await local.profile.update({ sports: ['strength', 'swimming'], displayName: 'Atleta' }));
    const planId = newId();
    const dayId = newId();
    expectOk(await local.plans.createPlan({ id: planId, name: 'Rutina', description: null, status: 'active', startsOn: null, endsOn: null }));
    expectOk(await local.plans.addDay({ id: dayId, planId, position: 0, name: 'A', kind: 'training', notes: null }));
    expectOk(await local.plans.addDayExercise({ id: newId(), trainingDayId: dayId, exerciseId: SQUAT, position: 0, targetSets: 3, targetRepsMin: 5,
      targetRepsMax: 5, targetWeightKg: null, targetRir: 1.5, targetRestSeconds: 180, targetDurationSeconds: null, targetDistanceMeters: null, notes: null }));
    const s = expectOk(await local.sessions.startFromTrainingDay({ id: newId(), trainingDayId: dayId, startedAt: clock.now(), timeZone: 'America/Mexico_City' }));
    for (const rir of [2, 0.5, 0]) {
      clock.advance(120_000);
      expectOk(await local.sessions.logSet({ id: newId(), sessionExerciseId: s.exercises[0]!.id, weightKg: 100, reps: 5, rir, completedAt: clock.now() }));
    }
    expectOk(await local.sessions.complete({ sessionId: s.id, endedAt: clock.now() }));

    const user = await createUser();
    const account = new PgTransport(user);
    const adopted = await (await device(secure, account, clock)).adoptLocalData(user);
    await local.close().catch(() => undefined);
    const status = expectOk(await adopted.sync.syncNow());
    expect([status.pendingCount, status.rejectedCount, status.conflictCount]).toEqual([0, 0, 0]);

    const rirs = await pool.query(`select st.rir::float8 as rir from athlete3.strength_sets st
      join athlete3.session_exercises e on e.id = st.session_exercise_id where e.session_id = $1 and st.user_id = $2 order by st.position`, [s.id, user]);
    expect(rirs.rows.map((r) => r.rir)).toEqual([2, 0.5, 0]);
    const profile = await pool.query('select id, sports, display_name from athlete3.profiles where id = $1', [user]);
    expect(profile.rows[0]).toEqual({ id: user, sports: ['strength', 'swimming'], display_name: 'Atleta' });
    const foreign = await pool.query('select count(*)::int as n from athlete3.workout_sessions where id = $1 and user_id <> $2', [s.id, user]);
    expect(foreign.rows[0].n).toBe(0);
    await adopted.close();
  });
});
