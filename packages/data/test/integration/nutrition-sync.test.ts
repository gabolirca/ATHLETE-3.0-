/**
 * Nutrición contra Postgres local con las migraciones reales (incluida 20261106000100), RLS y las RPC de sync.
 */
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { TestClock, expectOk, newId, openDevice, tempDir } from '../support';
import { PgTransport, createUser, pool } from './pg-transport';

let tmp: ReturnType<typeof tempDir>;
beforeEach(() => { tmp = tempDir(); });
afterEach(() => tmp.cleanup());
afterAll(() => pool.end());

const TZ = 'America/Mexico_City';

describe('nutrición con el servidor', () => {
  it('comidas creadas sin conexión se suben solas al volver la red, sin duplicarse, y aparecen en otro dispositivo', async () => {
    const user = await createUser();
    const clock = new TestClock(Date.now() - 3600_000);
    const net = new PgTransport(user);
    const a = await openDevice(join(tmp.dir, 'a.db'), user, net, clock);
    expectOk(await a.sync.syncNow());

    net.online = false;
    const lunch = expectOk(await a.nutrition.logMeal({ id: newId(), consumedAt: clock.now(), timeZone: TZ, mealType: 'lunch', description: 'Pollo con arroz', energyKcal: 612.345, proteinG: 48.26 }));
    const snack = expectOk(await a.nutrition.logMeal({ id: newId(), consumedAt: clock.now(), timeZone: TZ, mealType: 'snack', description: 'Manzana' }));
    expectOk(await a.nutrition.updateMeal(snack.id, { energyKcal: 95 }));
    const offline = await a.sync.syncNow();
    expect(offline.ok).toBe(false);
    clock.advance(10 * 60_000); // el fallo sin red programa el siguiente intento más tarde

    net.online = true;
    net.loseNextPushResponse = true; // el servidor guarda pero la respuesta se pierde: el reintento no debe duplicar
    const lost = await a.sync.syncNow();
    expect(lost.ok === false && lost.error.code).toBe('NETWORK_UNAVAILABLE');
    clock.advance(10 * 60_000); // pasa la espera de reintento del motor
    expect(expectOk(await a.sync.syncNow())).toMatchObject({ pendingCount: 0, conflictCount: 0, rejectedCount: 0 });

    const { rows } = await pool.query('select id, energy_kcal::float8 as kcal, protein_g::float8 as p from athlete3.meal_entries where user_id = $1 order by description', [user]);
    expect(rows).toEqual([
      { id: snack.id, kcal: 95, p: null },
      { id: lunch.id, kcal: 612.3, p: 48.3 },
    ]);

    const b = await openDevice(join(tmp.dir, 'b.db'), user, new PgTransport(user), clock);
    expectOk(await b.sync.syncNow());
    const day = lunch.localDate;
    expect(expectOk(await b.nutrition.getDaySummary(day))).toMatchObject({ entryCount: 2, energyKcal: 707.3, proteinG: 48.3, entriesMissingEnergy: 0 });

    // Borrar en B no reaparece en A.
    expectOk(await b.nutrition.deleteMeal(snack.id));
    expectOk(await b.sync.syncNow());
    expectOk(await a.sync.syncNow());
    expect(expectOk(await a.nutrition.listMeals(day)).map((m) => m.id)).toEqual([lunch.id]);
    await Promise.all([a.close(), b.close()]);
  });

  it('cada usuario solo ve sus comidas y objetivos (RLS)', async () => {
    const [ana, beto] = [await createUser(), await createUser()];
    const clock = new TestClock(Date.now() - 3600_000);
    const a = await openDevice(join(tmp.dir, 'ana.db'), ana, new PgTransport(ana), clock);
    const secret = expectOk(await a.nutrition.logMeal({ id: newId(), consumedAt: clock.now(), timeZone: TZ, mealType: 'dinner', description: 'Secreto de Ana' }));
    expectOk(await a.sync.syncNow());
    // Objetivo diario subido directamente por la RPC (la app aún no tiene pantalla para objetivos).
    const anaDevice = newId();
    const target = await new PgTransport(ana).push({ deviceId: anaDevice, mutations: [{
      mutationId: newId(), deviceId: anaDevice, entity: 'nutrition_target', entityId: newId(), op: 'upsert', baseRevision: null,
      payload: { effective_from: '2026-11-01', energy_kcal: 2200, protein_g: 150, carbs_g: null, fat_g: null },
      clientRecordedAt: clock.now(),
    }] } as never);
    expect(expectOk(target).results[0]).toMatchObject({ status: 'applied' });

    const b = await openDevice(join(tmp.dir, 'beto.db'), beto, new PgTransport(beto), clock);
    expectOk(await b.sync.syncNow());
    expect(expectOk(await b.nutrition.listMeals(secret.localDate))).toEqual([]);
    const pulled = expectOk(await new PgTransport(beto).pull({ cursor: null, limit: 500 }));
    expect(pulled.changes.filter((c) => c.entity === 'meal_entry' || c.entity === 'nutrition_target')).toEqual([]);
    const own = expectOk(await new PgTransport(ana).pull({ cursor: null, limit: 500 }));
    expect(own.changes.map((c) => c.entity).sort()).toEqual(['meal_entry', 'nutrition_target']);
    await Promise.all([a.close(), b.close()]);
  });

  it('el servidor rechaza datos fuera de rango aunque el cliente los mande', async () => {
    const user = await createUser();
    const device = newId();
    const r = await new PgTransport(user).push({ deviceId: device, mutations: [{
      mutationId: newId(), deviceId: device, entity: 'meal_entry', entityId: newId(), op: 'upsert', baseRevision: null,
      payload: { consumed_at: new Date().toISOString(), time_zone: 'UTC', local_date: new Date().toISOString().slice(0, 10), meal_type: 'lunch', description: 'x', energy_kcal: -5, protein_g: null, carbs_g: null, fat_g: null, source: 'manual', notes: null },
      clientRecordedAt: new Date().toISOString(),
    }] } as never);
    expect(expectOk(r).results[0]).toMatchObject({ status: 'rejected', error: { code: 'VALIDATION_FAILED' } });
  });
});
