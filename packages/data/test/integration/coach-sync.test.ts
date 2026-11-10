/**
 * Modo coach (0.9.0) contra Postgres local con las migraciones reales (20261112000100).
 */
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { TestClock, expectOk, newId, openDevice, tempDir } from '../support';
import { PgTransport, createUser, pool } from './pg-transport';

let tmp: ReturnType<typeof tempDir>;
beforeEach(() => { tmp = tempDir(); });
afterEach(() => tmp.cleanup());
afterAll(() => pool.end());

const SQUAT = '30000000-0000-4000-8000-000000000001';

async function asUser<T>(user: string, sql: string, params: unknown[]): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query('begin');
    await c.query('set local role authenticated');
    await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: user, role: 'authenticated' })]);
    const { rows } = await c.query(`select ${sql} as r`, params);
    await c.query('commit');
    return rows[0].r as T;
  } catch (e) { await c.query('rollback'); throw e; } finally { c.release(); }
}

describe('modo coach con el servidor', () => {
  it('el coach arma su programa en su teléfono, lo asigna y el atleta lo recibe con sus comentarios', async () => {
    const [coach, athlete] = [await createUser(), await createUser()];
    await pool.query("insert into athlete3_private.user_roles (user_id, role) values ($1, 'coach')", [coach]);
    const clock = new TestClock(Date.now());

    const coachPhone = await openDevice(join(tmp.dir, 'coach.db'), coach, new PgTransport(coach), clock);
    expectOk(await coachPhone.sync.syncNow());
    const planId = newId(); const dayId = newId();
    expectOk(await coachPhone.plans.createPlan({ id: planId, name: 'Fuerza base', description: null, status: 'active', startsOn: null, endsOn: null }));
    expectOk(await coachPhone.plans.addDay({ id: dayId, planId, position: 0, name: 'Día A', kind: 'training', notes: null }));
    expectOk(await coachPhone.plans.addDayExercise({ id: newId(), trainingDayId: dayId, exerciseId: SQUAT, position: 0, targetSets: 4, targetRepsMin: 6, targetRepsMax: 8, targetWeightKg: null, targetRir: null, targetRestSeconds: null, targetDurationSeconds: null, targetDistanceMeters: null, notes: null }));
    expect(expectOk(await coachPhone.sync.syncNow())).toMatchObject({ pendingCount: 0, rejectedCount: 0 });

    const invite = await asUser<{ code: string }>(coach, 'athlete3.coach_create_invite()', []);
    await asUser(athlete, 'athlete3.pro_accept_invite($1)', [invite.code]);
    const { planId: assigned } = await asUser<{ planId: string }>(coach, 'athlete3.coach_assign_plan($1, $2)', [athlete, planId]);
    await asUser(coach, 'athlete3.coach_add_comment($1, $2, $3, $4)', [athlete, 'plan', assigned, 'Empieza con 60 kg.']);
    await asUser(coach, 'athlete3.coach_add_comment($1, $2, $3, $4)', [athlete, 'general', null, 'Bienvenido.']);

    const phone = await openDevice(join(tmp.dir, 'athlete.db'), athlete, new PgTransport(athlete), clock);
    expect(expectOk(await phone.sync.syncNow())).toMatchObject({ rejectedCount: 0, conflictCount: 0 });
    const plans = expectOk(await phone.plans.listPlans());
    expect(plans.find((p) => p.id === assigned)).toMatchObject({ name: 'Fuerza base', assignedBy: coach });
    const detail = expectOk(await phone.plans.getPlan(assigned));
    expect(detail.days[0]?.exercises[0]).toMatchObject({ exerciseId: SQUAT, targetSets: 4, targetRepsMin: 6, targetRepsMax: 8 });
    expect(expectOk(await phone.coach.listComments()).map((c) => c.body)).toEqual(['Bienvenido.', 'Empieza con 60 kg.']);
    expect(expectOk(await phone.coach.listComments({ targetType: 'plan', targetId: assigned }))).toHaveLength(1);

    // El atleta edita el nombre: sube sin conflicto y conserva la marca del coach.
    expectOk(await phone.plans.updatePlan(assigned, { name: 'Fuerza base (mía)' }));
    expect(expectOk(await phone.sync.syncNow())).toMatchObject({ pendingCount: 0, rejectedCount: 0 });
    const { rows } = await pool.query('select name, assigned_by from athlete3.training_plans where id = $1', [assigned]);
    expect(rows[0]).toEqual({ name: 'Fuerza base (mía)', assigned_by: coach });
    await Promise.all([coachPhone.close(), phone.close()]);
  });
});
