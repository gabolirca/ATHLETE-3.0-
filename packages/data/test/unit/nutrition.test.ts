import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { FakeTransport, expectOk, newId, openDevice, tempDir } from '../support';
import { openNodeSqlite } from '../../src/sql/node-sqlite';
import { LOCAL_SCHEMA_VERSION } from '../../src/local/schema';

const USER = '6f1c2d3e-4b5a-4c6d-8e7f-9a0b1c2d3e4f';
const TZ = 'America/Mexico_City';
let tmp: ReturnType<typeof tempDir>;
let path: string;

beforeEach(() => { tmp = tempDir(); path = join(tmp.dir, 'device.db'); });
afterEach(() => tmp.cleanup());

const meal = (over: Record<string, unknown> = {}) => ({
  id: newId(), consumedAt: '2026-11-03T14:30:00-06:00', timeZone: TZ, mealType: 'lunch' as const,
  description: 'Arroz con pollo', ...over,
});

describe('nutrición (local)', () => {
  it('registra, edita, borra y resume el día; la fecha local sale de la zona horaria', async () => {
    const d = await openDevice(path, USER, new FakeTransport());
    const a = expectOk(await d.nutrition.logMeal(meal({ energyKcal: 650.04, proteinG: 45.26, carbsG: 70, fatG: 18 })));
    expect(a).toEqual(expect.objectContaining({ localDate: '2026-11-03', source: 'manual', energyKcal: 650, proteinG: 45.3, notes: null }));
    // 23:30 en CDMX ya es el día siguiente en UTC, pero cuenta para el día local.
    const b = expectOk(await d.nutrition.logMeal(meal({ consumedAt: '2026-11-04T05:30:00Z', mealType: 'dinner', description: 'Cena sin pesar' })));
    expect(b.localDate).toBe('2026-11-03');
    expectOk(await d.nutrition.logMeal(meal({ consumedAt: '2026-11-04T15:00:00Z', description: 'Otro día', energyKcal: 999 })));

    let summary = expectOk(await d.nutrition.getDaySummary('2026-11-03'));
    expect(summary).toEqual({ localDate: '2026-11-03', entryCount: 2, energyKcal: 650, proteinG: 45.3, carbsG: 70, fatG: 18, entriesMissingEnergy: 1 });

    const edited = expectOk(await d.nutrition.updateMeal(b.id, { energyKcal: 400, notes: 'tacos' }));
    expect([edited.energyKcal, edited.description, edited.notes]).toEqual([400, 'Cena sin pesar', 'tacos']);
    summary = expectOk(await d.nutrition.getDaySummary('2026-11-03'));
    expect([summary.energyKcal, summary.entriesMissingEnergy]).toEqual([1050, 0]);

    expectOk(await d.nutrition.deleteMeal(a.id));
    const list = expectOk(await d.nutrition.listMeals('2026-11-03'));
    expect(list.map((m) => m.id)).toEqual([b.id]);
    // La outbox fusiona por registro: quedan 2 por subir (la cena editada y la del otro día);
    // la comida creada y borrada sin haberse subido nunca no viaja al servidor.
    expect((await d.sync.status()).pendingCount).toBe(2);
    await d.close();
  });

  it('un día sin comidas tiene totales null (no 0 inventado)', async () => {
    const d = await openDevice(path, USER, new FakeTransport());
    expect(expectOk(await d.nutrition.getDaySummary('2026-11-03'))).toEqual({
      localDate: '2026-11-03', entryCount: 0, energyKcal: null, proteinG: null, carbsG: null, fatG: null, entriesMissingEnergy: 0,
    });
    await d.close();
  });

  it('valida con códigos estables', async () => {
    const d = await openDevice(path, USER, new FakeTransport());
    const cases = [
      meal({ description: '   ' }),
      meal({ energyKcal: -1 }),
      meal({ proteinG: 2_001 }),
      meal({ mealType: 'brunch' }),
      meal({ consumedAt: '2026-11-08T00:00:00Z' }), // más de 2 días en el futuro (reloj de prueba: 4-nov)
    ];
    for (const c of cases) {
      const r = await d.nutrition.logMeal(c as never);
      expect(r.ok === false && r.error.code).toBe('VALIDATION_FAILED');
    }
    const first = meal();
    expectOk(await d.nutrition.logMeal(first));
    const dup = await d.nutrition.logMeal(first);
    expect(dup.ok === false && dup.error.code).toBe('DUPLICATE');
    const missing = await d.nutrition.updateMeal(newId(), { energyKcal: 1 });
    expect(missing.ok === false && missing.error.code).toBe('NOT_FOUND');
    const badDay = await d.nutrition.listMeals('3-11-2026');
    expect(badDay.ok === false && badDay.error.code).toBe('VALIDATION_FAILED');
    await d.close();
  });

  it('una base creada antes de nutrición (v2) se actualiza sin perder nada', async () => {
    const d1 = await openDevice(path, USER, new FakeTransport());
    const cardioId = newId();
    expectOk(await d1.cardio.log({ id: cardioId, activity: 'run', startedAt: '2026-11-03T12:00:00Z', timeZone: 'UTC', durationSeconds: 1800 }));
    await d1.close();
    // Simula un teléfono con la app anterior: sin tablas de nutrición y en la versión 2.
    const raw = await openNodeSqlite(path);
    await raw.exec('DROP TABLE meal_entries; DROP TABLE nutrition_targets; PRAGMA user_version = 2;');
    await raw.close();

    const d2 = await openDevice(path, USER, new FakeTransport());
    expectOk(await d2.cardio.getById(cardioId));
    expectOk(await d2.nutrition.logMeal(meal()));
    await d2.close();
    const check = await openNodeSqlite(path);
    expect((await check.get<{ user_version: number }>('PRAGMA user_version'))?.user_version).toBe(LOCAL_SCHEMA_VERSION);
    expect(LOCAL_SCHEMA_VERSION).toBe(3);
    await check.close();
  });
});
