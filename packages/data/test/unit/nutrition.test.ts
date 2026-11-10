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
    expect(LOCAL_SCHEMA_VERSION).toBe(9);
    await check.close();
  });
});

describe('metas nutricionales (0.5.0)', () => {
  it('una meta por día: la vigente es la más reciente anterior o igual a la fecha', async () => {
    const d = await openDevice(path, USER, new FakeTransport());
    expect(expectOk(await d.nutrition.getTargetFor('2026-11-03'))).toBeNull();
    expectOk(await d.nutrition.setTarget({ id: newId(), effectiveFrom: '2026-11-01', energyKcal: 2400, proteinG: 150, source: 'estimated' }));
    const pro = expectOk(await d.nutrition.setTarget({ id: newId(), effectiveFrom: '2026-11-05', energyKcal: 2200, proteinG: 160, carbsG: 220, fatG: 70, source: 'professional' }));
    expect(expectOk(await d.nutrition.getTargetFor('2026-11-03'))).toMatchObject({ energyKcal: 2400, source: 'estimated', carbsG: null });
    expect(expectOk(await d.nutrition.getTargetFor('2026-11-06'))).toMatchObject({ id: pro.id, source: 'professional' });
    // Reemplazar la del mismo día conserva el registro (no crea duplicados que el servidor rechazaría).
    const replaced = expectOk(await d.nutrition.setTarget({ id: newId(), effectiveFrom: '2026-11-05', energyKcal: 2300, source: 'manual' }));
    expect(replaced.id).toBe(pro.id);
    expect(expectOk(await d.nutrition.getTargetFor('2026-11-06'))).toMatchObject({ energyKcal: 2300, source: 'manual', proteinG: null });
    const bad = await d.nutrition.setTarget({ id: newId(), effectiveFrom: '2026-11-05', energyKcal: 300, source: 'manual' });
    expect(bad.ok === false && bad.error.code).toBe('VALIDATION_FAILED');
    await d.close();
  });

  it('un teléfono en la versión 3 recibe la columna de origen sin perder metas', async () => {
    const d1 = await openDevice(path, USER, new FakeTransport());
    expectOk(await d1.nutrition.setTarget({ id: newId(), effectiveFrom: '2026-11-01', energyKcal: 2000, source: 'manual' }));
    await d1.close();
    const raw = await openNodeSqlite(path);
    await raw.exec('ALTER TABLE nutrition_targets DROP COLUMN source; PRAGMA user_version = 3;');
    await raw.close();
    const d2 = await openDevice(path, USER, new FakeTransport());
    expect(expectOk(await d2.nutrition.getTargetFor('2026-11-02'))).toMatchObject({ energyKcal: 2000, source: 'manual' });
    await d2.close();
  });
});

describe('plan nutricional SMAE (0.8.0)', () => {
  const MEALS = [
    { label: 'Desayuno', time: '08:00', equivalents: { cereales_sin_grasa: 2, frutas: 1 }, note: null },
    { label: 'Comida', time: '15:00', equivalents: { verduras: 2, aoa_bajo: 3 }, note: 'Sin refresco' },
  ];

  it('guarda, edita el del mismo día y devuelve el vigente', async () => {
    const d = await openDevice(path, USER, new FakeTransport());
    expect(expectOk(await d.nutrition.getPlanFor('2026-11-03'))).toBeNull();
    const first = expectOk(await d.nutrition.savePlan({ id: newId(), effectiveFrom: '2026-11-01', name: 'Base', meals: MEALS }));
    expect(first).toMatchObject({ source: 'self', assignedBy: null, notes: null, meals: MEALS });
    const edited = expectOk(await d.nutrition.savePlan({ id: newId(), effectiveFrom: '2026-11-01', name: 'Base v2', meals: MEALS.slice(0, 1) }));
    expect(edited.id).toBe(first.id);
    expect(expectOk(await d.nutrition.getPlanFor('2026-11-04'))).toMatchObject({ name: 'Base v2', meals: [MEALS[0]] });
    const bad = await d.nutrition.savePlan({ id: newId(), effectiveFrom: '2026-11-02', name: 'Mal', meals: [{ label: 'X', equivalents: { pizza: 1 } }] as never });
    expect(bad.ok === false && bad.error.code).toBe('VALIDATION_FAILED');
    await d.close();
  });

  it('si el plan del día lo asignó el nutriólogo, guardar crea uno propio y elimina el asignado', async () => {
    const d1 = await openDevice(path, USER, new FakeTransport());
    await d1.close();
    const raw = await openNodeSqlite(path);
    const assigned = newId();
    await raw.run(
      `INSERT INTO nutrition_plans (id, user_id, created_at, updated_at, deleted_at, revision, effective_from, name, meals, notes, source, assigned_by, assigned_by_name)
       VALUES (?, ?, '2026-11-01T00:00:00Z', '2026-11-01T00:00:00Z', NULL, 3, '2026-11-01', 'Del nutri', ?, NULL, 'assigned', ?, 'Dra. Ana')`,
      [assigned, USER, JSON.stringify(MEALS), newId()]);
    await raw.close();
    const d2 = await openDevice(path, USER, new FakeTransport());
    expect(expectOk(await d2.nutrition.getPlanFor('2026-11-02'))).toMatchObject({ id: assigned, source: 'assigned', assignedByName: 'Dra. Ana' });
    const mine = expectOk(await d2.nutrition.savePlan({ id: newId(), effectiveFrom: '2026-11-01', name: 'Mío', meals: MEALS }));
    expect(mine.id).not.toBe(assigned);
    expect(expectOk(await d2.nutrition.getPlanFor('2026-11-02'))).toMatchObject({ id: mine.id, source: 'self' });
    await d2.close();
  });
});
