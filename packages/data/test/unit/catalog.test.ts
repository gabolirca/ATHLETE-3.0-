import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { ok } from '@athlete/contracts';
import { FakeTransport, expectOk, newId, openDevice, tempDir } from '../support';
import { openNodeSqlite } from '../../src/sql/node-sqlite';
import { EXERCISES } from '../../src/catalog/catalog-data';
import { BUNDLED_CATALOG } from '../../src/catalog/bundled';
import { foldText } from '../../src/repositories/catalog-profile-plans';
import { LOCAL_SCHEMA_VERSION } from '../../src/local/schema';

const USER = '6f1c2d3e-4b5a-4c6d-8e7f-9a0b1c2d3e4f';
let tmp: ReturnType<typeof tempDir>;
let path: string;
beforeEach(() => { tmp = tempDir(); path = join(tmp.dir, 'device.db'); });
afterEach(() => tmp.cleanup());

/** Servidor simulado que entrega el catálogo real (el mismo que trae la app). */
class CatalogTransport extends FakeTransport {
  override async pullCatalog() { return ok(BUNDLED_CATALOG); }
}
const offline = async () => {
  const d = await openDevice(path, USER, new CatalogTransport());
  expectOk(await d.sync.syncNow());
  return d;
};

describe('catálogo 0.6.0', () => {
  it('fuente única: ids consecutivos, slugs únicos y todos con rasgos', () => {
    expect(EXERCISES.map(([n]) => n)).toEqual(EXERCISES.map((_, i) => i + 1));
    expect(new Set(EXERCISES.map(([, slug]) => slug)).size).toBe(EXERCISES.length);
    const free = EXERCISES.filter((e) => e[10] === 'free').length;
    expect(free).toBeGreaterThanOrEqual(40); // Gratis: lo suficiente para entrenar cuerpo completo
    expect(free).toBeLessThan(EXERCISES.length / 2); // …pero con ganas de más
    for (const muscleOrEq of BUNDLED_CATALOG.exercises.flatMap((e) => [...(e.primary_muscle_group_ids as string[]), ...(e.equipment_ids as string[])])) {
      expect([...BUNDLED_CATALOG.muscleGroups, ...BUNDLED_CATALOG.equipment].some((x) => x.id === muscleOrEq)).toBe(true);
    }
  });

  it('búsqueda sin acentos ni mayúsculas, con varias palabras', async () => {
    const d = await offline();
    const names = async (search: string) => expectOk(await d.exercises.list({ search })).map((e) => e.name);
    expect(await names('jalon')).toEqual(['Jalón agarre cerrado', 'Jalón al pecho']);
    expect(await names('PRESS banca')).toEqual(expect.arrayContaining(['Press de banca', 'Press de banca con mancuernas', 'Press de banca en Smith']));
    expect(await names('femoral')).toHaveLength(2);
    expect(foldText('  Búlgara ')).toBe('bulgara');
    await d.close();
  });

  it('filtros por patrón, equipo y nivel; los rasgos llegan al contrato', async () => {
    const d = await offline();
    const squats = expectOk(await d.exercises.list({ movementPattern: 'squat' }));
    expect(squats.every((e) => e.movementPattern === 'squat')).toBe(true);
    const freeCount = expectOk(await d.exercises.list({ accessTier: 'free' })).length;
    expect(freeCount).toBe(EXERCISES.filter((e) => e[10] === 'free').length);
    const kettlebell = expectOk(await d.exercises.list({ equipmentId: '20000000-0000-4000-8000-000000000006' })).map((e) => e.name);
    expect(kettlebell).toEqual(expect.arrayContaining(['Kettlebell swing', 'Sentadilla goblet']));
    const bulgarian = expectOk(await d.exercises.list({ search: 'bulgara' }))[0]!;
    expect(bulgarian).toMatchObject({ movementPattern: 'lunge', mechanics: 'compound', isUnilateral: true, accessTier: 'free' });
    await d.close();
  });

  it('ejercicio personalizado con rasgos: siempre gratis, y se puede editar', async () => {
    const d = await offline();
    const id = newId();
    const created = expectOk(await d.exercises.createCustom({ id, name: 'Remo Meadows', modality: 'strength', loadType: 'external', movementPattern: 'horizontal_pull', mechanics: 'compound', isUnilateral: true }));
    expect(created).toMatchObject({ accessTier: 'free', isUnilateral: true, movementPattern: 'horizontal_pull', ownerUserId: USER });
    const edited = expectOk(await d.exercises.updateCustom(id, { isUnilateral: false }));
    expect(edited).toMatchObject({ isUnilateral: false, movementPattern: 'horizontal_pull' });
    const plain = expectOk(await d.exercises.createCustom({ id: newId(), name: 'Mi ejercicio', modality: 'strength', loadType: 'none' }));
    expect(plain).toMatchObject({ movementPattern: null, mechanics: null, isUnilateral: false, accessTier: 'free' });
    await d.close();
  });

  it('un teléfono con la versión 4 (13 ejercicios) recibe los 105 sin perder sus ejercicios propios', async () => {
    const d1 = await offline();
    const own = newId();
    expectOk(await d1.exercises.createCustom({ id: own, name: 'Ejercicio propio', modality: 'strength', loadType: 'external' }));
    await d1.close();
    const raw = await openNodeSqlite(path);
    // Simula la app anterior: sin columnas nuevas, con catálogo viejo marcado como aplicado.
    await raw.exec(`DELETE FROM exercises WHERE user_id IS NULL AND CAST(substr(id, 25) AS INTEGER) > 13;
      ALTER TABLE exercises DROP COLUMN movement_pattern; ALTER TABLE exercises DROP COLUMN mechanics;
      ALTER TABLE exercises DROP COLUMN is_unilateral; ALTER TABLE exercises DROP COLUMN access_tier;
      INSERT OR REPLACE INTO sync_state (key, value) VALUES ('catalog_at', '2026-11-07T00:00:00Z');
      PRAGMA user_version = 4;`);
    await raw.close();
    const d2 = await openDevice(path, USER, new CatalogTransport());
    // La migración v5 olvidó el catálogo aplicado: la siguiente sync lo vuelve a descargar.
    expect(expectOk(await d2.exercises.list({})).filter((e) => e.ownerUserId === null).length).toBeLessThan(105);
    expectOk(await d2.sync.syncNow());
    const all = expectOk(await d2.exercises.list({}));
    expect(all.filter((e) => e.ownerUserId === null)).toHaveLength(105);
    expect(all.find((e) => e.id === own)).toMatchObject({ name: 'Ejercicio propio', accessTier: 'free', isUnilateral: false });
    expect(all.find((e) => e.name === 'Sentadilla trasera')).toMatchObject({ movementPattern: 'squat', accessTier: 'free' });
    expect(LOCAL_SCHEMA_VERSION).toBe(5);
    await d2.close();
  });
});
