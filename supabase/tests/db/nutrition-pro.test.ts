import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { asUser, createUser, pgError, pool, pull, push, upsert, uuid } from './helpers';

afterAll(() => pool.end());

const MEALS = [
  { label: 'Desayuno', time: '08:00', equivalents: { cereales_sin_grasa: 2, aoa_moderado: 1, frutas: 1 }, note: null },
  { label: 'Comida', time: '15:00', equivalents: { verduras: 2, leguminosas: 1, aoa_bajo: 2.5 }, note: 'Sin refresco' },
];
const today = () => new Date().toISOString().slice(0, 10);
const plan = (overrides: Record<string, unknown> = {}) => ({
  effectiveFrom: today(), name: 'Plan de definición', meals: MEALS, notes: null,
  energyKcal: 1850, proteinG: 140, carbsG: 190, fatG: 55, ...overrides,
});

let nutri: string;
let client: string;
let stranger: string;

const rpc = async (user: string, sql: string, params: unknown[] = []) =>
  (await asUser(user, (db) => db.query(`select ${sql} as r`, params))).rows[0].r;

async function link(): Promise<string> {
  const invite = await rpc(nutri, 'athlete3.pro_create_invite()');
  expect(invite.code).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
  const accepted = await rpc(client, 'athlete3.pro_accept_invite($1)', [invite.code.toLowerCase()]);
  return accepted.linkId as string;
}

beforeAll(async () => {
  nutri = await createUser();
  client = await createUser();
  stranger = await createUser();
  await pool.query("insert into athlete3_private.user_roles (user_id, role) values ($1, 'nutritionist')", [nutri]);
});

describe('plan nutricional propio (sync)', () => {
  it('el usuario sube su plan; no puede marcarlo como asignado', async () => {
    const id = uuid();
    const r = await asUser(stranger, (db) => push(db, [upsert('nutrition_plan', id, {
      effective_from: today(), name: 'Mío', meals: MEALS, notes: null,
      source: 'assigned', assigned_by: nutri, assigned_by_name: 'Falso',
    })]));
    expect(r[0]?.status).toBe('applied');
    const { rows } = await pool.query('select source, assigned_by, assigned_by_name from athlete3.nutrition_plans where id = $1', [id]);
    expect(rows[0]).toEqual({ source: 'self', assigned_by: null, assigned_by_name: null });
  });

  it('rechaza grupos SMAE inexistentes y raciones fuera de pasos de ½', async () => {
    for (const meals of [
      [{ label: 'X', time: null, equivalents: { pizza: 1 }, note: null }],
      [{ label: 'X', time: null, equivalents: { frutas: 1.3 }, note: null }],
      [{ label: 'X', time: '25:00', equivalents: {}, note: null }],
      [],
    ]) {
      const r = await asUser(stranger, (db) => push(db, [upsert('nutrition_plan', uuid(), { effective_from: '2026-01-01', name: 'Mal', meals, notes: null })]));
      expect(r[0]?.status, JSON.stringify(meals)).toBe('rejected');
    }
  });
});

describe('modo nutriólogo', () => {
  it('solo un nutriólogo genera invitaciones y ve clientes', async () => {
    expect((await pgError(rpc(client, 'athlete3.pro_create_invite()'))).message).toBe('ATHLETE:FORBIDDEN');
    expect((await pgError(rpc(client, 'athlete3.pro_list_clients()'))).message).toBe('ATHLETE:FORBIDDEN');
    const status = await rpc(nutri, 'athlete3.pro_status()');
    expect(status).toEqual({ isNutritionist: true, isCoach: false, professional: null, coach: null });
  });

  it('código inválido o ya usado no vincula', async () => {
    expect((await pgError(rpc(client, 'athlete3.pro_accept_invite($1)', ['ZZZZZZZZ']))).message).toBe('ATHLETE:NOT_FOUND');
    const invite = await rpc(nutri, 'athlete3.pro_create_invite()');
    await rpc(stranger, 'athlete3.pro_accept_invite($1)', [invite.code]);
    expect((await pgError(rpc(client, 'athlete3.pro_accept_invite($1)', [invite.code]))).message).toBe('ATHLETE:NOT_FOUND');
    expect((await pgError(rpc(nutri, 'athlete3.pro_accept_invite($1)', [(await rpc(nutri, 'athlete3.pro_create_invite()')).code]))).message)
      .toBe('ATHLETE:VALIDATION_FAILED');
  });

  it('vincula, asigna el plan y la meta, y le llegan al cliente por su sync', async () => {
    const linkId = await link();
    const status = await rpc(client, 'athlete3.pro_status()');
    expect(status.professional.linkId).toBe(linkId);

    const clients = await rpc(nutri, 'athlete3.pro_list_clients()');
    expect(clients.map((c: { clientId: string }) => c.clientId)).toContain(client);

    await rpc(nutri, 'athlete3.pro_assign_plan($1, $2::jsonb)', [client, JSON.stringify(plan())]);
    const changes = (await asUser(client, (db) => pull(db))).changes;
    const p = changes.find((c) => c.entity === 'nutrition_plan');
    const t = changes.find((c) => c.entity === 'nutrition_target');
    expect(p?.record).toMatchObject({ user_id: client, source: 'assigned', assigned_by: nutri, name: 'Plan de definición' });
    expect(t?.record).toMatchObject({ user_id: client, source: 'professional', energy_kcal: 1850 });

    // Reasignar el mismo día reemplaza (no duplica) y sube la revisión.
    await rpc(nutri, 'athlete3.pro_assign_plan($1, $2::jsonb)', [client, JSON.stringify(plan({ name: 'Ajuste semana 2', energyKcal: 1750 }))]);
    const { rows } = await pool.query('select name, revision::int as revision from athlete3.nutrition_plans where user_id = $1 and deleted_at is null', [client]);
    expect(rows).toEqual([{ name: 'Ajuste semana 2', revision: 2 }]);
    const got = await rpc(nutri, 'athlete3.pro_get_client_plan($1)', [client]);
    expect(got).toMatchObject({ name: 'Ajuste semana 2', source: 'assigned' });
  });

  it('el cliente puede editar su plan asignado sin cambiar su origen', async () => {
    const row = (await pool.query("select id, revision, meals from athlete3.nutrition_plans where user_id = $1 and deleted_at is null", [client])).rows[0];
    const r = await asUser(client, (db) => push(db, [upsert('nutrition_plan', row.id, {
      effective_from: today(), name: 'Editado', meals: row.meals, notes: 'nota', source: 'self', assigned_by: null, assigned_by_name: null,
    }, Number(row.revision))]));
    expect(r[0]?.status).toBe('applied');
    const after = (await pool.query('select name, source, assigned_by from athlete3.nutrition_plans where id = $1', [row.id])).rows[0];
    expect(after).toEqual({ name: 'Editado', source: 'assigned', assigned_by: nutri });
  });

  it('no se asigna a quien no es cliente ni con valores fuera de rango', async () => {
    expect((await pgError(rpc(nutri, 'athlete3.pro_assign_plan($1, $2::jsonb)', [uuid(), JSON.stringify(plan())]))).message).toBe('ATHLETE:NOT_FOUND');
    expect((await pgError(rpc(nutri, 'athlete3.pro_assign_plan($1, $2::jsonb)', [client, JSON.stringify(plan({ energyKcal: 300 }))]))).message).toBe('ATHLETE:VALIDATION_FAILED');
    expect((await pgError(rpc(nutri, 'athlete3.pro_assign_plan($1, $2::jsonb)', [client, JSON.stringify(plan({ meals: [{ label: 'X', equivalents: { pizza: 1 } }] }))]))).code).toBe('23514');
  });

  it('las tablas del vínculo no son legibles por la app y otro usuario no ve el plan', async () => {
    expect((await pgError(asUser(client, (db) => db.query('select * from athlete3_private.pro_links')))).code).toBe('42501');
    const { rows } = await asUser(stranger, (db) => db.query('select id from athlete3.nutrition_plans where user_id = $1', [client]));
    expect(rows).toEqual([]);
  });

  it('al terminar el vínculo el nutriólogo pierde acceso; el plan se queda con el cliente', async () => {
    const status = await rpc(client, 'athlete3.pro_status()');
    await rpc(client, 'athlete3.pro_end_link($1)', [status.professional.linkId]);
    expect(await rpc(client, 'athlete3.pro_status()')).toEqual({ isNutritionist: false, isCoach: false, professional: null, coach: null });
    expect((await pgError(rpc(nutri, 'athlete3.pro_get_client_plan($1)', [client]))).message).toBe('ATHLETE:NOT_FOUND');
    const { rows } = await pool.query('select count(*)::int as n from athlete3.nutrition_plans where user_id = $1 and deleted_at is null', [client]);
    expect(rows[0].n).toBe(1);
  });
});
