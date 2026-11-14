import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { FakeTransport, SQUAT, TestClock, expectOk, newId, openDevice, tempDir } from '../support';
import { openNodeSqlite } from '../../src/sql/node-sqlite';

const USER = '6f1c2d3e-4b5a-4c6d-8e7f-9a0b1c2d3e4f';
let tmp: ReturnType<typeof tempDir>;
let path: string;
let transport: FakeTransport;

beforeEach(() => {
  tmp = tempDir();
  path = join(tmp.dir, 'device.db');
  transport = new FakeTransport();
});
afterEach(() => tmp.cleanup());

async function deviceWithCatalog() {
  const d = await openDevice(path, USER, transport);
  expectOk(await d.sync.syncNow()); // descarga el catálogo
  return d;
}

describe('sesiones de fuerza (local)', () => {
  it('flujo completo: iniciar, añadir ejercicio, registrar series, completar, historial', async () => {
    const d = await deviceWithCatalog();
    const session = expectOk(await d.sessions.start({ id: newId(), startedAt: '2026-11-03T22:30:00-06:00', timeZone: 'America/Mexico_City' }));
    expect(session.localDate).toBe('2026-11-03');
    const se = expectOk(await d.sessions.addExercise({ id: newId(), sessionId: session.id, exerciseId: SQUAT }));
    expectOk(await d.sessions.logSet({ id: newId(), sessionExerciseId: se.id, setType: 'warmup', weightKg: 60, reps: 8, completedAt: '2026-11-04T04:35:00Z' }));
    const s1 = expectOk(await d.sessions.logSet({ id: newId(), sessionExerciseId: se.id, weightKg: 100, reps: 5, rir: 2, completedAt: '2026-11-04T04:40:00Z' }));
    expect(s1.position).toBe(1);
    const upd = expectOk(await d.sessions.updateSet({ setId: s1.id, reps: 6, rir: null }));
    expect([upd.reps, upd.rir, upd.weightKg]).toEqual([6, null, 100]);
    expectOk(await d.sessions.complete({ sessionId: session.id, endedAt: '2026-11-04T05:30:00Z' }));

    const history = expectOk(await d.sessions.listHistory({}));
    expect(history.items).toEqual([expect.objectContaining({ sessionId: session.id, exerciseCount: 1, workingSetCount: 1, volumeKg: 600 })]);
    const sets = expectOk(await d.sessions.listSetsForExercise(SQUAT));
    expect(sets.map((s) => s.reps)).toEqual([8, 6]);
    await d.close();
  });

  it('reglas: una sola sesión activa, no editar descartadas, transiciones', async () => {
    const d = await deviceWithCatalog();
    const a = expectOk(await d.sessions.start({ id: newId(), startedAt: '2026-11-04T10:00:00Z', timeZone: 'UTC' }));
    const second = await d.sessions.start({ id: newId(), startedAt: '2026-11-04T10:05:00Z', timeZone: 'UTC' });
    expect(second.ok === false && second.error.code).toBe('INVALID_STATE');
    expectOk(await d.sessions.discard({ sessionId: a.id }));
    const add = await d.sessions.addExercise({ id: newId(), sessionId: a.id, exerciseId: SQUAT });
    expect(add.ok === false && add.error.code).toBe('INVALID_STATE');
    const complete = await d.sessions.complete({ sessionId: a.id, endedAt: '2026-11-04T11:00:00Z' });
    expect(complete.ok === false && complete.error.code).toBe('INVALID_STATE');
    await d.close();
  });

  it('valida datos inválidos con códigos estables', async () => {
    const d = await deviceWithCatalog();
    const s = expectOk(await d.sessions.start({ id: newId(), startedAt: '2026-11-04T10:00:00Z', timeZone: 'UTC' }));
    const se = expectOk(await d.sessions.addExercise({ id: newId(), sessionId: s.id, exerciseId: SQUAT }));
    for (const bad of [{ rir: 2.3 }, { reps: -1 }, { weightKg: 2000 }, { rpe: 0 }]) {
      const r = await d.sessions.logSet({ id: newId(), sessionExerciseId: se.id, ...bad });
      expect(r.ok === false && r.error.code).toBe('VALIDATION_FAILED');
    }
    const badTimes = await d.sessions.complete({ sessionId: s.id, endedAt: '2026-11-04T09:00:00Z' });
    expect(badTimes.ok === false && badTimes.error.code).toBe('VALIDATION_FAILED');
    const unknownEx = await d.sessions.addExercise({ id: newId(), sessionId: s.id, exerciseId: newId() });
    expect(unknownEx.ok === false && unknownEx.error.code).toBe('NOT_FOUND');
    const dup = await d.sessions.addExercise({ id: se.id, sessionId: s.id, exerciseId: SQUAT });
    expect(dup.ok === false && dup.error.code).toBe('DUPLICATE');
    await d.close();
  });

  it('reordenar, eliminar ejercicio (cascada local) y paginar historial', async () => {
    const d = await deviceWithCatalog();
    const s = expectOk(await d.sessions.start({ id: newId(), startedAt: '2026-11-04T10:00:00Z', timeZone: 'UTC' }));
    const e1 = expectOk(await d.sessions.addExercise({ id: newId(), sessionId: s.id, exerciseId: SQUAT }));
    const e2 = expectOk(await d.sessions.addExercise({ id: newId(), sessionId: s.id, exerciseId: SQUAT }));
    expectOk(await d.sessions.logSet({ id: newId(), sessionExerciseId: e1.id, reps: 5 }));
    const reordered = expectOk(await d.sessions.reorderExercises({ sessionId: s.id, orderedSessionExerciseIds: [e2.id, e1.id] }));
    expect(reordered.map((e) => [e.id, e.position])).toEqual([[e2.id, 0], [e1.id, 1]]);
    expectOk(await d.sessions.removeExercise(e1.id));
    const detail = expectOk(await d.sessions.getDetail(s.id));
    expect(detail.exercises.map((e) => e.id)).toEqual([e2.id]);
    expectOk(await d.sessions.complete({ sessionId: s.id, endedAt: '2026-11-04T11:00:00Z' }));
    for (const day of ['2026-10-01', '2026-10-02']) {
      const x = expectOk(await d.sessions.start({ id: newId(), startedAt: `${day}T10:00:00Z`, timeZone: 'UTC' }));
      expectOk(await d.sessions.complete({ sessionId: x.id, endedAt: `${day}T11:00:00Z` }));
    }
    const p1 = expectOk(await d.sessions.listHistory({}, { limit: 2 }));
    const p2 = expectOk(await d.sessions.listHistory({}, { limit: 2, cursor: p1.nextCursor }));
    expect([...p1.items, ...p2.items].map((i) => i.localDate)).toEqual(['2026-11-04', '2026-10-02', '2026-10-01']);
    expect(p2.nextCursor).toBeNull();
    const bad = await d.sessions.listHistory({}, { cursor: 'basura' });
    expect(bad.ok === false && bad.error.code).toBe('VALIDATION_FAILED');
    await d.close();
  });
});

describe('cardio, cuerpo, perfil, ejercicios y programas (local)', () => {
  it('cardio con natación y validación de reglas cruzadas', async () => {
    const d = await deviceWithCatalog();
    const swim = expectOk(await d.cardio.log({ id: newId(), activity: 'swim', startedAt: '2026-11-03T07:00:00-06:00', timeZone: 'America/Mexico_City', durationSeconds: 1800, distanceMeters: 1000, swim: { poolType: 'pool', poolLengthMeters: 25, laps: 40, stroke: 'freestyle' } }));
    expect(swim.swim?.laps).toBe(40);
    const bad = await d.cardio.update(swim.id, { activity: 'run' }); // natación en carrera
    expect(bad.ok === false && bad.error.code).toBe('VALIDATION_FAILED');
    const hr = await d.cardio.log({ id: newId(), activity: 'run', startedAt: '2026-11-03T07:00:00Z', timeZone: 'UTC', durationSeconds: 600, avgHeartRateBpm: 180, maxHeartRateBpm: 170 });
    expect(hr.ok).toBe(false);
    expect(expectOk(await d.cardio.list({ from: '2026-11-01' })).items).toHaveLength(1);
    await d.close();
  });

  it('peso en libras se normaliza a kg conservando la unidad de entrada', async () => {
    const d = await deviceWithCatalog();
    const w = expectOk(await d.body.logWeight({ id: newId(), measuredAt: '2026-11-03T07:00:00Z', timeZone: 'UTC', value: 176.4, inputUnit: 'lb' }));
    expect(w.weightKg).toBeCloseTo(80.014, 3);
    expect(w.inputUnit).toBe('lb');
    const out = await d.body.logWeight({ id: newId(), measuredAt: '2026-11-03T07:00:00Z', timeZone: 'UTC', value: 10, inputUnit: 'lb' });
    expect(out.ok === false && out.error.code).toBe('VALIDATION_FAILED');
    expectOk(await d.body.logMeasurement({ id: newId(), measuredAt: '2026-11-03T07:00:00Z', timeZone: 'UTC', site: 'waist', value: 32, inputUnit: 'in' }));
    expect(expectOk(await d.body.listMeasurements({}, 'waist'))[0]?.valueCm).toBeCloseTo(81.28, 2);
    await d.close();
  });

  it('perfil: inicializar (idempotente) y actualizar preferencias', async () => {
    const d = await deviceWithCatalog();
    expect((await d.profile.get()).ok).toBe(false);
    expectOk(await d.profile.initialize('America/Mexico_City'));
    expectOk(await d.profile.initialize('Europe/Madrid'));
    const p = expectOk(await d.profile.update({ displayName: 'Ana', loadUnit: 'lb', weekStartsOn: 0, goals: ['Fuerza'] }));
    expect(p).toMatchObject({ id: USER, timeZone: 'America/Mexico_City', displayName: 'Ana', loadUnit: 'lb', weekStartsOn: 0, goals: ['Fuerza'] });
    await d.close();
  });

  it('ejercicios personalizados y búsqueda', async () => {
    const d = await deviceWithCatalog();
    const mine = expectOk(await d.exercises.createCustom({ id: newId(), name: 'Hip thrust 50%', modality: 'strength', loadType: 'external', primaryMuscleGroupIds: ['10000000-0000-4000-8000-000000000008'] }));
    expect(mine.ownerUserId).toBe(USER);
    expect(expectOk(await d.exercises.list({ search: 'sentadilla' })).map((e) => e.id)).toEqual([SQUAT]);
    expect(expectOk(await d.exercises.list({ search: '50%' })).map((e) => e.id)).toEqual([mine.id]);
    const archived = expectOk(await d.exercises.archiveCustom(mine.id));
    expect(archived.archivedAt).not.toBeNull();
    expect(expectOk(await d.exercises.list({})).map((e) => e.id)).toEqual([SQUAT]);
    const global = await d.exercises.archiveCustom(SQUAT);
    expect(global.ok === false && global.error.code).toBe('NOT_FOUND');
    const badRef = await d.exercises.createCustom({ id: newId(), name: 'X', modality: 'strength', loadType: 'external', equipmentIds: [newId()] });
    expect(badRef.ok === false && badRef.error.code).toBe('VALIDATION_FAILED');
    await d.close();
  });

  it('programas: plan → días → ejercicios con objetivos, y borrado en cascada', async () => {
    const d = await deviceWithCatalog();
    const plan = expectOk(await d.plans.createPlan({ id: newId(), name: 'Fuerza 5x5', description: null, status: 'active', startsOn: '2026-11-02', endsOn: null }));
    const day = expectOk(await d.plans.addDay({ id: newId(), planId: plan.id, position: 0, name: 'Día A', kind: 'training', notes: null }));
    expectOk(await d.plans.addDayExercise({ id: newId(), trainingDayId: day.id, exerciseId: SQUAT, position: 0, targetSets: 5, targetRepsMin: 5, targetRepsMax: 5, targetWeightKg: 100, targetRir: 2, targetRestSeconds: 180, targetDurationSeconds: null, targetDistanceMeters: null, notes: null }));
    const bad = await d.plans.addDayExercise({ id: newId(), trainingDayId: day.id, exerciseId: SQUAT, position: 1, targetSets: 3, targetRepsMin: 10, targetRepsMax: 5, targetWeightKg: null, targetRir: null, targetRestSeconds: null, targetDurationSeconds: null, targetDistanceMeters: null, notes: null });
    expect(bad.ok === false && bad.error.code).toBe('VALIDATION_FAILED');
    const detail = expectOk(await d.plans.getPlan(plan.id));
    expect(detail.days[0]?.exercises[0]?.targetSets).toBe(5);
    expectOk(await d.plans.deletePlan(plan.id));
    expect((await d.plans.getPlan(plan.id)).ok).toBe(false);
    await d.close();
  });
});

describe('persistencia tras reinicio', () => {
  it('la sesión en curso y la outbox sobreviven a cerrar y reabrir la base', async () => {
    const d1 = await deviceWithCatalog();
    transport.online = false;
    const s = expectOk(await d1.sessions.start({ id: newId(), startedAt: '2026-11-04T10:00:00Z', timeZone: 'UTC' }));
    const se = expectOk(await d1.sessions.addExercise({ id: newId(), sessionId: s.id, exerciseId: SQUAT }));
    expectOk(await d1.sessions.logSet({ id: newId(), sessionExerciseId: se.id, weightKg: 80, reps: 8, completedAt: '2026-11-04T10:10:00Z' }));
    const pendingBefore = (await d1.sync.status()).pendingCount;
    await d1.close();

    const d2 = await openDevice(path, USER, transport);
    const active = expectOk(await d2.sessions.getActive());
    expect(active?.id).toBe(s.id);
    expect(active?.exercises[0]?.sets[0]?.reps).toBe(8);
    expect((await d2.sync.status()).pendingCount).toBe(pendingBefore);
    expect(d2.deviceId).toBe(d1.deviceId);
    await d2.close();
  });

  it('una base local no puede abrirse con otro usuario', async () => {
    const d = await openDevice(path, USER, transport);
    await d.close();
    await expect(openDevice(path, '6f1c2d3e-4b5a-4c6d-8e7f-000000000000', transport)).rejects.toThrow(/otro usuario/);
  });

  it('transacción atómica: si falla la escritura, no queda mutación huérfana', async () => {
    const d = await deviceWithCatalog();
    const db = openNodeSqlite(path);
    const before = await db.get<{ n: number }>('SELECT COUNT(*) AS n FROM outbox');
    const r = await d.sessions.logSet({ id: newId(), sessionExerciseId: newId(), reps: 5 }); // padre inexistente
    expect(r.ok).toBe(false);
    const after = await db.get<{ n: number }>('SELECT COUNT(*) AS n FROM outbox');
    expect(after?.n).toBe(before?.n);
    await db.close();
    await d.close();
  });
});
