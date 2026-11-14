/**
 * Ciclo funcional de entrenamiento de extremo a extremo contra Postgres local (migraciones reales, RLS y RPC):
 * rutina → sesión desde el día → series con peso/reps/RIR → finalizar → sync → otro dispositivo.
 * Verifica que el servidor acepta todo lo que el cliente escribe (nada queda `rejected`) y que los valores
 * —en especial RIR 0, medios pasos y null, y pesos convertidos desde lb— son idénticos en ambos lados.
 */
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { SQUAT, TestClock, expectOk, newId, openDevice, tempDir } from '../support';
import { PgTransport, createUser, pool } from './pg-transport';

let tmp: ReturnType<typeof tempDir>;
beforeEach(() => { tmp = tempDir(); });
afterEach(() => tmp.cleanup());
afterAll(() => pool.end());

const LB = 0.45359237;

describe('ciclo de entrenamiento con sincronización', () => {
  it('rutina → sesión → series con RIR → finalizar → servidor y segundo dispositivo con los mismos valores', async () => {
    const user = await createUser();
    const clock = new TestClock(Date.now() - 3600_000);
    const phone = await openDevice(join(tmp.dir, 'phone.db'), user, new PgTransport(user), clock);
    expectOk(await phone.sync.syncNow());

    // Rutina con un ejercicio del catálogo y uno propio; objetivos con medio paso de RIR y peso en lb.
    const lunge = newId();
    expectOk(await phone.exercises.createCustom({ id: lunge, name: 'Zancada', modality: 'strength', loadType: 'external' }));
    const planId = newId();
    const dayId = newId();
    expectOk(await phone.plans.createPlan({ id: planId, name: 'Rutina', description: null, status: 'active', startsOn: null, endsOn: null }));
    expectOk(await phone.plans.addDay({ id: dayId, planId, position: 0, name: 'Pierna A', kind: 'training', notes: null }));
    const base = { targetDurationSeconds: null, targetDistanceMeters: null, notes: null };
    const squatPlan = expectOk(await phone.plans.addDayExercise({ ...base, id: newId(), trainingDayId: dayId, exerciseId: SQUAT, position: 0,
      targetSets: 3, targetRepsMin: 5, targetRepsMax: 5, targetWeightKg: 225 * LB, targetRir: 1.5, targetRestSeconds: 180 }));
    expectOk(await phone.plans.addDayExercise({ ...base, id: newId(), trainingDayId: dayId, exerciseId: lunge, position: 1,
      targetSets: 3, targetRepsMin: 10, targetRepsMax: 12, targetWeightKg: null, targetRir: 0, targetRestSeconds: 90 }));

    // Sesión desde el día, series y fin.
    const sessionId = newId();
    const session = expectOk(await phone.sessions.startFromTrainingDay({ id: sessionId, trainingDayId: dayId, startedAt: clock.now(), timeZone: 'America/Mexico_City' }));
    const [squat, lungeSe] = session.exercises;
    const sets: Array<[string, 'warmup' | 'working', number | null, number, number | null]> = [
      [squat!.id, 'warmup', 135 * LB, 8, null],
      [squat!.id, 'working', 225 * LB, 5, 2],
      [squat!.id, 'working', 225 * LB, 5, 0.5],
      [squat!.id, 'working', 225 * LB, 4, 0],
      [lungeSe!.id, 'working', null, 12, 10],
    ];
    for (const [sessionExerciseId, setType, weightKg, reps, rir] of sets) {
      clock.advance(120_000);
      expectOk(await phone.sessions.logSet({ id: newId(), sessionExerciseId, setType, weightKg, reps, rir, completedAt: clock.now() }));
    }
    clock.advance(300_000);
    expectOk(await phone.sessions.complete({ sessionId, endedAt: clock.now() }));

    // Sync: el servidor acepta todas las mutaciones.
    const status = expectOk(await phone.sync.syncNow());
    expect([status.pendingCount, status.conflictCount, status.rejectedCount]).toEqual([0, 0, 0]);

    // Servidor: columna `rir` numérica con los mismos valores; peso con la misma precisión que la copia local.
    const server = await pool.query(`
      select s.rir::float8 as rir, s.weight_kg::float8 as weight_kg, s.reps, e.training_day_exercise_id, w.status
        from athlete3.strength_sets s
        join athlete3.session_exercises e on e.id = s.session_exercise_id
        join athlete3.workout_sessions w on w.id = e.session_id
       where w.id = $1 and s.deleted_at is null
       order by e.position, s.position`, [sessionId]);
    expect(server.rows.map((r) => r.rir)).toEqual([null, 2, 0.5, 0, 10]);
    expect(server.rows.map((r) => r.weight_kg)).toEqual([61.23, 102.06, 102.06, 102.06, null]);
    expect(server.rows[0].training_day_exercise_id).toBe(squatPlan.id);
    expect(server.rows.every((r) => r.status === 'completed')).toBe(true);
    const target = await pool.query('select target_rir::float8 as r, target_weight_kg::float8 as w from athlete3.training_day_exercises where id = $1', [squatPlan.id]);
    expect(target.rows[0]).toEqual({ r: 1.5, w: 102.06 });

    const view = (d: Awaited<ReturnType<typeof phone.sessions.getDetail>>) =>
      expectOk(d).exercises.map((e) => ({ trainingDayExerciseId: e.trainingDayExerciseId, sets: e.sets.map((s) => [s.setType, s.weightKg, s.reps, s.rir]) }));
    const onPhone = view(await phone.sessions.getDetail(sessionId));
    expect(onPhone[0]?.sets.map((s) => s[1])).toEqual([61.23, 102.06, 102.06, 102.06]);

    // Segundo dispositivo del mismo usuario: mismos valores, mismo historial.
    const tablet = await openDevice(join(tmp.dir, 'tablet.db'), user, new PgTransport(user), clock);
    expectOk(await tablet.sync.syncNow());
    expect(view(await tablet.sessions.getDetail(sessionId))).toEqual(onPhone);
    // Los instantes pueden llegar como `+00:00` desde el servidor y `Z` localmente: mismo instante, se comparan como tales.
    const history = async (d: typeof phone) => expectOk(await d.sessions.listHistory({})).items
      .map((h) => ({ ...h, startedAt: Date.parse(h.startedAt), endedAt: h.endedAt && Date.parse(h.endedAt) }));
    expect(await history(tablet)).toEqual(await history(phone));
    const tabletPlan = expectOk(await tablet.plans.getPlan(planId));
    expect(tabletPlan.days[0]?.exercises.map((e) => [e.targetSets, e.targetRepsMin, e.targetRepsMax, e.targetRestSeconds, e.targetRir, e.targetWeightKg]))
      .toEqual([[3, 5, 5, 180, 1.5, 102.06], [3, 10, 12, 90, 0, null]]);

    // Tras otro sync completo, la copia del teléfono no cambia (no había divergencia que corregir).
    expectOk(await phone.sync.syncNow());
    expect(view(await phone.sessions.getDetail(sessionId))).toEqual(onPhone);
    await Promise.all([phone.close(), tablet.close()]);
  });
});
