import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SQUAT, asUser, createUser, pgError, pool, pull, push, seedSession, upsert, uuid } from './helpers';

afterAll(() => pool.end());

let coach: string;
let athlete: string;
let nutri: string;
let stranger: string;
const plan = { id: uuid(), day: uuid(), block: uuid(), ex: uuid() };

const rpc = async (user: string, sql: string, params: unknown[] = []) =>
  (await asUser(user, (db) => db.query(`select ${sql} as r`, params))).rows[0].r;

beforeAll(async () => {
  [coach, athlete, nutri, stranger] = [await createUser(), await createUser(), await createUser(), await createUser()];
  await pool.query("insert into athlete3_private.user_roles (user_id, role) values ($1, 'coach'), ($2, 'nutritionist')", [coach, nutri]);
  // El coach arma su programa en SU cuenta (como cualquier usuario, por sync).
  const r = await asUser(coach, (db) => push(db, [
    upsert('training_plan', plan.id, { name: 'Fuerza 3 días', status: 'active', kind: 'program' }),
    upsert('training_day', plan.day, { plan_id: plan.id, position: 0, name: 'Lunes pierna', kind: 'training', weekday: 1, modality: 'strength' }),
    upsert('training_block', plan.block, { training_day_id: plan.day, position: 0, name: 'Fuerza', kind: 'strength', format: 'sets' }),
    upsert('training_day_exercise', plan.ex, { training_day_id: plan.day, exercise_id: SQUAT, position: 0, target_sets: 5, target_reps_min: 5, target_reps_max: 5, block_id: plan.block }),
  ]));
  expect(r.map((x) => x.status)).toEqual(['applied', 'applied', 'applied', 'applied']);
});

async function linkCoach(): Promise<string> {
  const invite = await rpc(coach, 'athlete3.coach_create_invite()');
  const accepted = await rpc(athlete, 'athlete3.pro_accept_invite($1)', [invite.code]);
  expect(accepted.scope).toBe('training');
  return accepted.linkId;
}

describe('vínculos por alcance', () => {
  it('solo un coach crea invitaciones de entrenamiento; el nutriólogo no ve atletas del coach', async () => {
    expect((await pgError(rpc(nutri, 'athlete3.coach_create_invite()'))).message).toBe('ATHLETE:FORBIDDEN');
    await linkCoach();
    const nInvite = await rpc(nutri, 'athlete3.pro_create_invite()');
    await rpc(athlete, 'athlete3.pro_accept_invite($1)', [nInvite.code]);
    const status = await rpc(athlete, 'athlete3.pro_status()');
    expect(status.coach?.name).toBeTruthy();
    expect(status.professional?.name).toBeTruthy(); // nutriólogo y coach a la vez
    expect((await rpc(nutri, 'athlete3.pro_list_clients()')).map((c: { clientId: string }) => c.clientId)).toEqual([athlete]);
    expect((await rpc(coach, 'athlete3.coach_list_clients()')).map((c: { clientId: string }) => c.clientId)).toEqual([athlete]);
    // El coach no puede usar las RPC de nutrición sobre su atleta ni el nutriólogo las del coach.
    expect((await pgError(rpc(nutri, 'athlete3.coach_client_summary($1)', [athlete]))).message).toBe('ATHLETE:FORBIDDEN');
    await pool.query("insert into athlete3_private.user_roles (user_id, role) values ($1, 'nutritionist')", [coach]);
    expect((await pgError(rpc(coach, 'athlete3.pro_get_client_plan($1)', [athlete]))).message).toBe('ATHLETE:NOT_FOUND');
    await pool.query("delete from athlete3_private.user_roles where user_id = $1 and role = 'nutritionist'", [coach]);
  });
});

describe('programa asignado', () => {
  it('se copia completo a la cuenta del atleta y le llega por sync, marcado como asignado', async () => {
    const { planId } = await rpc(coach, 'athlete3.coach_assign_plan($1, $2)', [athlete, plan.id]);
    const changes = (await asUser(athlete, (db) => pull(db))).changes;
    const p = changes.find((c) => c.entity === 'training_plan' && c.entityId === planId);
    expect(p?.record).toMatchObject({ user_id: athlete, name: 'Fuerza 3 días', kind: 'program', status: 'active', assigned_by: coach });
    const day = changes.find((c) => c.entity === 'training_day' && c.record?.plan_id === planId)!;
    const block = changes.find((c) => c.entity === 'training_block' && c.record?.training_day_id === day.entityId)!;
    const ex = changes.find((c) => c.entity === 'training_day_exercise' && c.record?.training_day_id === day.entityId)!;
    expect(day.record).toMatchObject({ name: 'Lunes pierna', weekday: 1 });
    expect(ex.record).toMatchObject({ exercise_id: SQUAT, target_sets: 5, block_id: block.entityId });
    expect([day.entityId, block.entityId, ex.entityId]).not.toContain(plan.day);
    const plans = await rpc(coach, 'athlete3.coach_list_client_plans($1)', [athlete]);
    expect(plans[0]).toMatchObject({ id: planId, assignedByMe: true, days: 1 });
  });

  it('el atleta puede editar el programa pero no quitarle la marca de asignado', async () => {
    const row = (await pool.query('select id, revision from athlete3.training_plans where user_id = $1 and assigned_by is not null limit 1', [athlete])).rows[0];
    const r = await asUser(athlete, (db) => push(db, [upsert('training_plan', row.id, { name: 'Mi versión', status: 'active', kind: 'program', assigned_by: null, assigned_by_name: null }, Number(row.revision))]));
    expect(r[0]?.status).toBe('applied');
    expect((await pool.query('select name, assigned_by from athlete3.training_plans where id = $1', [row.id])).rows[0]).toEqual({ name: 'Mi versión', assigned_by: coach });
  });

  it('no se asigna un programa ajeno, ni con ejercicios personalizados, ni a quien no es su atleta', async () => {
    expect((await pgError(rpc(coach, 'athlete3.coach_assign_plan($1, $2)', [athlete, uuid()]))).message).toBe('ATHLETE:NOT_FOUND');
    expect((await pgError(rpc(coach, 'athlete3.coach_assign_plan($1, $2)', [stranger, plan.id]))).message).toBe('ATHLETE:NOT_FOUND');
    const custom = uuid(); const p2 = uuid(); const d2 = uuid();
    await asUser(coach, (db) => push(db, [
      upsert('exercise', custom, { name: 'Mío', modality: 'strength', load_type: 'external' }),
      upsert('training_plan', p2, { name: 'Con propio', status: 'active' }),
      upsert('training_day', d2, { plan_id: p2, position: 0, name: 'Día', kind: 'training' }),
      upsert('training_day_exercise', uuid(), { training_day_id: d2, exercise_id: custom, position: 0 }),
    ]));
    expect((await pgError(rpc(coach, 'athlete3.coach_assign_plan($1, $2)', [athlete, p2]))).message).toBe('ATHLETE:VALIDATION_FAILED');
  });

  it('el coach retira su programa (borrado lógico que llega por sync)', async () => {
    const { planId } = await rpc(coach, 'athlete3.coach_assign_plan($1, $2)', [athlete, plan.id]);
    await rpc(coach, 'athlete3.coach_remove_plan($1, $2)', [athlete, planId]);
    const changes = (await asUser(athlete, (db) => pull(db))).changes;
    expect(changes.find((c) => c.entity === 'training_plan' && c.entityId === planId)?.deleted).toBe(true);
  });
});

describe('progreso y comentarios', () => {
  it('el resumen trae sesiones, semanas y mejores levantamientos del atleta', async () => {
    const ids = await seedSession(athlete);
    await asUser(athlete, (db) => db.query("update athlete3.workout_sessions set status = 'completed', ended_at = started_at + interval '50 minutes', local_date = local_date where id = $1", [ids.session]));
    const s = await rpc(coach, 'athlete3.coach_client_summary($1, $2)', [athlete, 120]);
    expect(s.plannedPerWeek).toBe(1);
    expect(s.sessions.find((x: { id: string }) => x.id === ids.session)).toMatchObject({ minutes: 50, workingSets: 1, volumeKg: 500 });
    expect(s.weeks).toHaveLength(4);
    expect(s.topLifts[0]).toMatchObject({ e1rmKg: 116.7, bestWeightKg: 100 });
    expect((await pgError(rpc(coach, 'athlete3.coach_client_summary($1)', [stranger]))).message).toBe('ATHLETE:NOT_FOUND');
  });

  it('los comentarios del coach llegan al atleta, que no puede crearlos ni editarlos', async () => {
    const session = (await pool.query("select id from athlete3.workout_sessions where user_id = $1 limit 1", [athlete])).rows[0].id;
    const { id } = await rpc(coach, 'athlete3.coach_add_comment($1, $2, $3, $4)', [athlete, 'session', session, '¡Buen trabajo! Sube 2.5 kg la próxima.']);
    expect((await pgError(rpc(coach, 'athlete3.coach_add_comment($1, $2, $3, $4)', [athlete, 'session', uuid(), 'x']))).message).toBe('ATHLETE:VALIDATION_FAILED');
    const c = (await asUser(athlete, (db) => pull(db))).changes.find((x) => x.entity === 'coach_comment' && x.entityId === id);
    expect(c?.record).toMatchObject({ target_type: 'session', target_id: session, author_id: coach });
    const forged = await asUser(athlete, (db) => push(db, [upsert('coach_comment', uuid(), { author_name: 'Yo', target_type: 'general', target_id: null, body: 'falso', author_id: coach })]));
    expect(forged[0]?.status).toBe('rejected');
    expect((await rpc(coach, 'athlete3.coach_list_comments($1)', [athlete])).map((x: { id: string }) => x.id)).toEqual([id]);
    await rpc(coach, 'athlete3.coach_delete_comment($1)', [id]);
    expect(await rpc(coach, 'athlete3.coach_list_comments($1)', [athlete])).toEqual([]);
  });

  it('al terminar el vínculo de entrenamiento el coach pierde acceso; el de nutrición sigue', async () => {
    const status = await rpc(athlete, 'athlete3.pro_status()');
    await rpc(athlete, 'athlete3.pro_end_link($1)', [status.coach.linkId]);
    expect((await pgError(rpc(coach, 'athlete3.coach_client_summary($1)', [athlete]))).message).toBe('ATHLETE:NOT_FOUND');
    const after = await rpc(athlete, 'athlete3.pro_status()');
    expect(after.coach).toBeNull();
    expect(after.professional).not.toBeNull();
  });
});
