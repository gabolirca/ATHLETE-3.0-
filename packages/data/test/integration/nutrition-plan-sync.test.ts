/**
 * Plan nutricional SMAE y modo nutriólogo (0.8.0) contra Postgres local con las migraciones reales (20261111000100).
 */
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { TestClock, expectOk, newId, openDevice, tempDir } from '../support';
import { PgTransport, createUser, pool } from './pg-transport';

let tmp: ReturnType<typeof tempDir>;
beforeEach(() => { tmp = tempDir(); });
afterEach(() => tmp.cleanup());
afterAll(() => pool.end());

const MEALS = [
  { label: 'Desayuno', time: '08:00', equivalents: { cereales_sin_grasa: 2, frutas: 1 }, note: null },
  { label: 'Cena', time: null, equivalents: { verduras: 1.5, aoa_muy_bajo: 2 }, note: 'Ligera' },
];
const today = () => new Date().toISOString().slice(0, 10);

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

describe('plan nutricional con el servidor', () => {
  it('el plan propio sube y aparece igual en otro dispositivo', async () => {
    const user = await createUser();
    const clock = new TestClock(Date.now() - 3600_000);
    const a = await openDevice(join(tmp.dir, 'a.db'), user, new PgTransport(user), clock);
    const plan = expectOk(await a.nutrition.savePlan({ id: newId(), effectiveFrom: '2026-11-01', name: 'Base', meals: MEALS, notes: 'Agua 2 L' }));
    expect(expectOk(await a.sync.syncNow())).toMatchObject({ pendingCount: 0, rejectedCount: 0 });
    const b = await openDevice(join(tmp.dir, 'b.db'), user, new PgTransport(user), clock);
    expectOk(await b.sync.syncNow());
    expect(expectOk(await b.nutrition.getPlanFor('2026-11-05'))).toMatchObject({ id: plan.id, name: 'Base', meals: MEALS, notes: 'Agua 2 L', source: 'self' });
    await Promise.all([a.close(), b.close()]);
  });

  it('el plan y la meta que asigna el nutriólogo llegan al teléfono del cliente; si el cliente lo cambia queda uno propio', async () => {
    const [nutri, client] = [await createUser(), await createUser()];
    await pool.query("insert into athlete3_private.user_roles (user_id, role) values ($1, 'nutritionist')", [nutri]);
    const invite = await asUser<{ code: string }>(nutri, 'athlete3.pro_create_invite()', []);
    await asUser(client, 'athlete3.pro_accept_invite($1)', [invite.code]);
    await asUser(nutri, 'athlete3.pro_assign_plan($1, $2::jsonb)', [client, JSON.stringify({
      effectiveFrom: today(), name: 'Plan de la Dra.', meals: MEALS, energyKcal: 1800, proteinG: 130, carbsG: 180, fatG: 60,
    })]);

    const clock = new TestClock(Date.now());
    const phone = await openDevice(join(tmp.dir, 'c.db'), client, new PgTransport(client), clock);
    expectOk(await phone.sync.syncNow());
    const got = expectOk(await phone.nutrition.getPlanFor(today()))!;
    expect(got).toMatchObject({ name: 'Plan de la Dra.', source: 'assigned', assignedBy: nutri, meals: MEALS });
    expect(expectOk(await phone.nutrition.getTargetFor(today()))).toMatchObject({ energyKcal: 1800, proteinG: 130, source: 'professional' });

    const mine = expectOk(await phone.nutrition.savePlan({ id: newId(), effectiveFrom: today(), name: 'Mi versión', meals: MEALS.slice(0, 1) }));
    expect(expectOk(await phone.sync.syncNow())).toMatchObject({ pendingCount: 0, rejectedCount: 0, conflictCount: 0 });
    const { rows } = await pool.query('select id, source, deleted_at is not null as deleted from athlete3.nutrition_plans where user_id = $1 order by created_at', [client]);
    expect(rows).toEqual([{ id: got.id, source: 'assigned', deleted: true }, { id: mine.id, source: 'self', deleted: false }]);
    await phone.close();
  });
});
