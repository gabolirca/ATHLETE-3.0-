/**
 * Motor híbrido (0.7.0) de punta a punta contra Postgres real: programa con semana tipo y bloques, sesión con RPE
 * y resultado de AMRAP se suben sin rechazos y llegan iguales a un segundo dispositivo. El servidor aplica las
 * mismas reglas que el cliente (bloque del mismo día, AMRAP con duración).
 */
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { SQUAT, TestClock, expectOk, newId, openDevice, tempDir } from '../support';
import type pg from 'pg';
import { PgTransport, createUser, pool } from './pg-transport';

/** Ejecuta como el usuario autenticado (igual que PostgREST) y deshace todo al terminar. */
async function asUser(userId: string, fn: (c: pg.PoolClient) => Promise<void>): Promise<void> {
  const c = await pool.connect();
  try {
    await c.query('begin');
    await c.query('set local role authenticated');
    await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: userId, role: 'authenticated' })]);
    await fn(c);
  } finally {
    await c.query('rollback').catch(() => undefined);
    c.release();
  }
}

let tmp: ReturnType<typeof tempDir>;
beforeEach(() => { tmp = tempDir(); });
afterEach(() => tmp.cleanup());
afterAll(() => pool.end());

describe('motor híbrido entre dispositivos', () => {
  it('programa, bloques, RPE de sesión y resultado de AMRAP sincronizan sin rechazos', async () => {
    const user = await createUser();
    const clock = new TestClock(Date.now() - 3600_000);
    const a = await openDevice(join(tmp.dir, 'a.db'), user, new PgTransport(user), clock);
    expectOk(await a.sync.syncNow());

    const plan = expectOk(await a.plans.createPlan({ id: newId(), name: 'Hybrid Athlete 1.0', description: null, status: 'active', startsOn: null, endsOn: null, kind: 'program', templateSlug: 'hybrid-athlete-1-0' }));
    const sat = expectOk(await a.plans.addDay({ id: newId(), planId: plan.id, position: 6, name: 'Hybrid Conditioning', kind: 'training', notes: null, weekday: 6, modality: 'conditioning', targetRpe: 7.5, targetDurationMinutes: 75 }));
    const block = expectOk(await a.plans.addBlock({ id: newId(), trainingDayId: sat.id, position: 2, name: 'AMRAP 15', kind: 'wod', format: 'amrap', rounds: null, timeCapSeconds: 900, restSeconds: null, targetRpe: 8, notes: null }));
    const dayEx = expectOk(await a.plans.addDayExercise({ id: newId(), trainingDayId: sat.id, exerciseId: SQUAT, position: 0, targetSets: null, targetRepsMin: 12, targetRepsMax: 12, targetWeightKg: null, targetRir: null, targetRestSeconds: null, targetDurationSeconds: null, targetDistanceMeters: null, notes: null, blockId: block.id, perSide: true, targetRpe: 8 }));

    const session = expectOk(await a.sessions.startFromTrainingDay({ id: newId(), startedAt: clock.now(), timeZone: 'America/Mexico_City', trainingDayId: sat.id }));
    expectOk(await a.sessions.saveBlockResult({ id: newId(), sessionId: session.id, trainingBlockId: block.id, position: 0, name: 'AMRAP 15', format: 'amrap', roundsCompleted: 5, extraReps: 14, durationSeconds: 900, notes: null }));
    clock.advance(60 * 60_000);
    expectOk(await a.sessions.complete({ sessionId: session.id, endedAt: clock.now(), sessionRpe: 8 }));
    expect(expectOk(await a.sync.syncNow())).toMatchObject({ pendingCount: 0, conflictCount: 0, rejectedCount: 0 });

    const b = await openDevice(join(tmp.dir, 'b.db'), user, new PgTransport(user), clock);
    expectOk(await b.sync.syncNow());
    const detail = expectOk(await b.plans.getPlan(plan.id));
    expect(detail.plan).toMatchObject({ kind: 'program', templateSlug: 'hybrid-athlete-1-0' });
    expect(detail.days[0]).toMatchObject({ weekday: 6, modality: 'conditioning', targetRpe: 7.5, targetDurationMinutes: 75 });
    expect(detail.days[0]!.blocks[0]).toMatchObject({ id: block.id, format: 'amrap', timeCapSeconds: 900 });
    expect(detail.days[0]!.exercises[0]).toMatchObject({ id: dayEx.id, blockId: block.id, perSide: true, targetRpe: 8 });
    expect(expectOk(await b.sessions.getDetail(session.id)).sessionRpe).toBe(8);
    expect(expectOk(await b.sessions.listBlockResults(session.id))).toEqual([expect.objectContaining({ roundsCompleted: 5, extraReps: 14, trainingBlockId: block.id })]);

    // Borrar la sesión en B borra su resultado en A.
    expectOk(await b.sessions.delete(session.id));
    expectOk(await b.sync.syncNow());
    expectOk(await a.sync.syncNow());
    expect(expectOk(await a.sessions.listBlockResults(session.id))).toEqual([]);
    await Promise.all([a.close(), b.close()]);
  });

  it('el servidor rechaza un ejercicio en el bloque de otro día y un AMRAP sin duración', async () => {
    const user = await createUser();
    await asUser(user, async (c) => {
      const plan = newId(); const d1 = newId(); const d2 = newId();
      await c.query("insert into athlete3.training_plans (id, name, kind) values ($1, 'P', 'program')", [plan]);
      await c.query("insert into athlete3.training_days (id, plan_id, position, name, weekday) values ($1, $3, 0, 'L', 1), ($2, $3, 1, 'M', 2)", [d1, d2, plan]);
      await expect(c.query("insert into athlete3.training_blocks (id, training_day_id, position, name, kind, format) values ($1, $2, 0, 'AMRAP', 'wod', 'amrap')", [newId(), d1])).rejects.toThrow(/training_blocks_timed_formats/);
    });
    await asUser(user, async (c) => {
      const plan = newId(); const d1 = newId(); const d2 = newId(); const blk = newId();
      await c.query("insert into athlete3.training_plans (id, name, kind) values ($1, 'P', 'program')", [plan]);
      await c.query("insert into athlete3.training_days (id, plan_id, position, name, weekday) values ($1, $3, 0, 'L', 1), ($2, $3, 1, 'M', 2)", [d1, d2, plan]);
      await c.query("insert into athlete3.training_blocks (id, training_day_id, position, name, kind, format) values ($1, $2, 0, 'Fuerza', 'strength', 'sets')", [blk, d1]);
      await expect(c.query('insert into athlete3.training_day_exercises (id, training_day_id, exercise_id, position, block_id) values ($1, $2, $3, 0, $4)', [newId(), d2, SQUAT, blk])).rejects.toThrow(/ATHLETE:VALIDATION_FAILED/);
    });
  });
});
