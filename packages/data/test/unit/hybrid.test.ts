import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { FakeTransport, SQUAT, TestClock, expectOk, newId, openDevice, tempDir } from '../support';
import { openNodeSqlite } from '../../src/sql/node-sqlite';

const USER = '6f1c2d3e-4b5a-4c6d-8e7f-9a0b1c2d3e4f';
let tmp: ReturnType<typeof tempDir>;
let path: string;
beforeEach(() => { tmp = tempDir(); path = join(tmp.dir, 'device.db'); });
afterEach(() => tmp.cleanup());

/** Dispositivo con el catálogo de prueba descargado (SQUAT) y reloj fijo (4-nov-2026). */
async function device() {
  const d = await openDevice(path, USER, new FakeTransport(), new TestClock());
  expectOk(await d.sync.syncNow());
  return d;
}

const planInput = (over: Record<string, unknown> = {}) => ({ id: newId(), name: 'Hybrid Athlete 1.0', description: null, status: 'active' as const, startsOn: null, endsOn: null, ...over });
const exInput = (dayId: string, over: Record<string, unknown> = {}) => ({
  id: newId(), trainingDayId: dayId, exerciseId: SQUAT, position: 0, targetSets: 3, targetRepsMin: 12, targetRepsMax: 12, targetWeightKg: null,
  targetRir: null, targetRestSeconds: null, targetDurationSeconds: null, targetDistanceMeters: null, notes: null, ...over,
});
const blockInput = (dayId: string, over: Record<string, unknown> = {}) => ({
  id: newId(), trainingDayId: dayId, position: 0, name: 'Bloque C · AMRAP', kind: 'wod' as const, format: 'amrap' as const,
  rounds: null, timeCapSeconds: 900, restSeconds: null, targetRpe: 8, notes: null, ...over,
});

describe('motor híbrido (0.7.0, local)', () => {
  it('programa con semana tipo y bloques; las rutinas viejas siguen siendo rutinas', async () => {
    const d = await device();
    const routine = expectOk(await d.plans.createPlan(planInput({ name: 'Torso A' })));
    expect([routine.kind, routine.templateSlug]).toEqual(['routine', null]);

    const plan = expectOk(await d.plans.createPlan(planInput({ kind: 'program', templateSlug: 'hybrid-athlete-1-0' })));
    const sat = expectOk(await d.plans.addDay({ id: newId(), planId: plan.id, position: 5, name: 'Hybrid Conditioning', kind: 'training', notes: null, weekday: 6, modality: 'conditioning', targetRpe: 7.5, targetDurationMinutes: 75 }));
    const mon = expectOk(await d.plans.addDay({ id: newId(), planId: plan.id, position: 1, name: 'Natación · recuperación', kind: 'training', notes: null, weekday: 1, modality: 'swim' }));
    expect([mon.weekday, mon.modality, mon.targetRpe]).toEqual([1, 'swim', null]);

    const amrap = expectOk(await d.plans.addBlock(blockInput(sat.id, { position: 2 })));
    const strength = expectOk(await d.plans.addBlock(blockInput(sat.id, { position: 1, name: 'Bloque B · fuerza', kind: 'strength', format: 'sets', timeCapSeconds: null })));
    const goblet = expectOk(await d.plans.addDayExercise(exInput(sat.id, { blockId: strength.id, perSide: false })));
    const lunge = expectOk(await d.plans.addDayExercise(exInput(sat.id, { blockId: amrap.id, position: 1, perSide: true, targetSets: null })));
    expect([goblet.blockId, lunge.perSide, lunge.targetRpe]).toEqual([strength.id, true, null]);

    const detail = expectOk(await d.plans.getPlan(plan.id));
    expect(detail.plan).toMatchObject({ kind: 'program', templateSlug: 'hybrid-athlete-1-0' });
    expect(detail.days.map((x) => [x.name, x.weekday])).toEqual([['Natación · recuperación', 1], ['Hybrid Conditioning', 6]]);
    expect(detail.days[1]!.blocks.map((b) => [b.name, b.format])).toEqual([['Bloque B · fuerza', 'sets'], ['Bloque C · AMRAP', 'amrap']]);

    // Validaciones: AMRAP sin duración; bloque de otro día.
    const noCap = await d.plans.addBlock(blockInput(sat.id, { timeCapSeconds: null }));
    expect(noCap.ok === false && noCap.error.code).toBe('VALIDATION_FAILED');
    const otherDay = await d.plans.addDayExercise(exInput(mon.id, { blockId: amrap.id }));
    expect(otherDay.ok === false && otherDay.error.code).toBe('VALIDATION_FAILED');

    // Borrar un bloque deja sus ejercicios sin bloque; borrar el día borra sus bloques.
    expectOk(await d.plans.deleteBlock(amrap.id));
    const after = expectOk(await d.plans.getPlan(plan.id)).days[1]!;
    expect(after.blocks.map((b) => b.id)).toEqual([strength.id]);
    expect(after.exercises.find((e) => e.id === lunge.id)?.blockId).toBeNull();
    expectOk(await d.plans.deleteDay(sat.id));
    const raw = await openNodeSqlite(path);
    expect((await raw.all<{ deleted_at: string | null }>('SELECT deleted_at FROM training_blocks WHERE id = ?', [strength.id]))[0]?.deleted_at).not.toBeNull();
    await raw.close();
    await d.close();
  });

  it('RPE de la sesión al terminar y resultado de un AMRAP; se borran con la sesión', async () => {
    const d = await device();
    const s = expectOk(await d.sessions.start({ id: newId(), startedAt: '2026-11-04T03:00:00Z', timeZone: 'UTC' }));
    const result = expectOk(await d.sessions.saveBlockResult({ id: newId(), sessionId: s.id, trainingBlockId: null, position: 0, name: 'AMRAP 15', format: 'amrap', roundsCompleted: 5, extraReps: 14, durationSeconds: 900, notes: null }));
    // Guardar otra vez con el mismo id reemplaza (corrige el resultado).
    expectOk(await d.sessions.saveBlockResult({ ...result, roundsCompleted: 6, extraReps: 2 }));
    expect(expectOk(await d.sessions.listBlockResults(s.id)).map((r) => [r.roundsCompleted, r.extraReps])).toEqual([[6, 2]]);

    const done = expectOk(await d.sessions.complete({ sessionId: s.id, endedAt: '2026-11-04T04:10:00Z', sessionRpe: 7.5 }));
    expect(done.sessionRpe).toBe(7.5);
    const bad = await d.sessions.update({ sessionId: s.id, sessionRpe: 11 });
    expect(bad.ok === false && bad.error.code).toBe('VALIDATION_FAILED');

    expectOk(await d.sessions.delete(s.id));
    expect(expectOk(await d.sessions.listBlockResults(s.id))).toEqual([]);
    await d.close();
  });

  it('un teléfono en la versión 5 recibe el modelo híbrido sin perder rutinas ni sesiones', async () => {
    const d1 = await device();
    const plan = expectOk(await d1.plans.createPlan(planInput({ name: 'Pierna' })));
    const day = expectOk(await d1.plans.addDay({ id: newId(), planId: plan.id, position: 0, name: 'Pierna', kind: 'training', notes: null }));
    expectOk(await d1.plans.addDayExercise(exInput(day.id)));
    await d1.close();
    const raw = await openNodeSqlite(path);
    await raw.exec(`
      DROP TABLE training_blocks; DROP TABLE session_block_results;
      ALTER TABLE training_plans DROP COLUMN kind; ALTER TABLE training_plans DROP COLUMN template_slug;
      ALTER TABLE training_days DROP COLUMN weekday; ALTER TABLE training_days DROP COLUMN modality;
      ALTER TABLE training_days DROP COLUMN target_rpe; ALTER TABLE training_days DROP COLUMN target_duration_minutes;
      ALTER TABLE training_day_exercises DROP COLUMN block_id; ALTER TABLE training_day_exercises DROP COLUMN per_side; ALTER TABLE training_day_exercises DROP COLUMN target_rpe;
      ALTER TABLE workout_sessions DROP COLUMN session_rpe;
      PRAGMA user_version = 5;`);
    await raw.close();
    const d2 = await device();
    const detail = expectOk(await d2.plans.getPlan(plan.id));
    expect(detail.plan.kind).toBe('routine');
    expect(detail.days[0]).toMatchObject({ weekday: null, modality: null, blocks: [] });
    expect(detail.days[0]!.exercises[0]).toMatchObject({ blockId: null, perSide: false });
    await d2.close();
  });
});
