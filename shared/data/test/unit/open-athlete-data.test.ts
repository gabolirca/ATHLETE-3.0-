import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { join } from 'node:path';
import type { Result } from '@athlete/contracts';
import { BUNDLED_CATALOG, CATALOG_EXERCISE_ID } from '../../src/catalog/bundled';
import { IDENTITY_KEY } from '../../src/identity';
import { localDatabaseName } from '../../src/sql/expo-sqlite';
import { openAthleteData, type OpenedAthleteData } from '../../src/open';
import { migrateLocalDatabase, LOCAL_SCHEMA_VERSION } from '../../src/local/schema';
import { openNodeSqlite } from '../../src/sql/node-sqlite';
import { FakeTransport, MemorySecureStore, TestClock, cipherOpener, expectOk, newId, randomBytesSync, tempDir } from '../support';

const SQUAT = CATALOG_EXERCISE_ID['back-squat']!;
let tmp: ReturnType<typeof tempDir>;
let secure: MemorySecureStore;
let account: FakeTransport;
let clock: TestClock;

beforeEach(() => {
  tmp = tempDir();
  secure = new MemorySecureStore();
  account = new FakeTransport();
  clock = new TestClock();
});
afterEach(() => tmp.cleanup());

const open = () => openAthleteData({ openDatabase: cipherOpener(tmp.dir).open, secureStore: secure, randomBytes: randomBytesSync, accountTransport: account, clock });
const codeOf = <T>(r: Result<T>) => (r.ok ? null : r.error.code);

async function workout(d: OpenedAthleteData) {
  const s = expectOk(await d.sessions.start({ id: newId(), startedAt: clock.now(), timeZone: 'America/Mexico_City' }));
  const se = expectOk(await d.sessions.addExercise({ id: newId(), sessionId: s.id, exerciseId: SQUAT }));
  expectOk(await d.sessions.logSet({ id: newId(), sessionExerciseId: se.id, weightKg: 100, reps: 5, rir: 0, completedAt: clock.now() }));
  clock.advance(60_000);
  expectOk(await d.sessions.complete({ sessionId: s.id, endedAt: clock.now() }));
  return s.id;
}

describe('openAthleteData: identidad local sin cuenta', () => {
  it('primera apertura sin red ni cuenta: crea identidad, base cifrada y catálogo; el ciclo completo funciona', async () => {
    const d = await open();
    expect(d.identity.accountUserId).toBeNull();
    expect(JSON.parse(secure.items.get(IDENTITY_KEY)!)).toEqual({ v: 1, localUserId: d.identity.localUserId, accountUserId: null });
    expect(secure.items.has(`athlete3.sqlcipher-key.${localDatabaseName(d.identity.localUserId)}.v1`)).toBe(true);

    const catalog = expectOk(await d.exercises.list({}));
    expect(catalog.map((e) => e.id).sort()).toEqual(BUNDLED_CATALOG.exercises.map((e) => e.id).sort());

    expectOk(await d.profile.initialize('America/Mexico_City'));
    expect(expectOk(await d.profile.update({ sports: ['strength', 'running'] })).sports).toEqual(['strength', 'running']);
    const sessionId = await workout(d);

    // Sin cuenta: la sync no envía nada y lo deja pendiente (sin consumir intentos).
    const sync = await d.sync.syncNow();
    expect(codeOf(sync)).toBe('UNAUTHENTICATED');
    const status = await d.sync.status();
    expect(status.pendingCount).toBeGreaterThan(0);
    expect(status.rejectedCount).toBe(0);
    expect(account.pushes).toHaveLength(0);
    await d.close();

    // Cerrar y abrir: misma identidad, misma base, datos intactos.
    const again = await open();
    expect(again.identity).toEqual(d.identity);
    expect(expectOk(await again.sessions.getDetail(sessionId)).exercises[0]?.sets[0]?.rir).toBe(0);
    expect(expectOk(await again.profile.get()).sports).toEqual(['strength', 'running']);
    await again.close();
  });

  it('ignora el identificador de la capa anterior (retirada): crea una identidad propia y no toca esa entrada', async () => {
    const oldOwnerKey = 'athlete3.local-owner.v1';
    const legacy = '1b4e28ba-2fa1-41d2-883f-0016d3cca427';
    secure.items.set(oldOwnerKey, `device:${legacy}`);
    const d = await open();
    expect(d.identity.localUserId).not.toBe(legacy);
    expect(secure.items.get(oldOwnerKey)).toBe(`device:${legacy}`);
    await d.close();
  });

  it('identidad guardada corrupta: error explícito, no se reemplaza', async () => {
    secure.items.set(IDENTITY_KEY, '{"v":1,"localUserId":"x"}');
    const e = await open().then(() => null, (x: unknown) => x);
    expect(e).toMatchObject({ code: 'secret-invalid' });
    expect(secure.items.get(IDENTITY_KEY)).toBe('{"v":1,"localUserId":"x"}');
  });

  it('el catálogo incluido no pisa el descargado del servidor al reabrir', async () => {
    const serverSquat = { ...BUNDLED_CATALOG.exercises[0]!, name: 'Sentadilla (servidor)', revision: 2 };
    account.pullCatalog = async () => ({ ok: true, value: { ...BUNDLED_CATALOG, exercises: [serverSquat] } });
    const d = await open();
    const adopted = await d.adoptLocalData('aaaaaaaa-0000-4000-8000-000000000001');
    expectOk(await adopted.sync.syncNow());
    expect(expectOk(await adopted.exercises.getById(SQUAT)).name).toBe('Sentadilla (servidor)');
    await adopted.close();
    const again = await open();
    expect(expectOk(await again.exercises.getById(SQUAT)).name).toBe('Sentadilla (servidor)');
    await again.close();
  });
});

describe('adoptLocalData: vincular la cuenta al iniciar sesión', () => {
  const ACCOUNT = 'aaaaaaaa-0000-4000-8000-000000000001';

  it('reasigna la propiedad en una transacción, vincula la identidad y sincroniza todo lo pendiente', async () => {
    const d = await open();
    const local = d.identity.localUserId;
    expectOk(await d.profile.initialize('UTC'));
    const sessionId = await workout(d);
    const adopted = await d.adoptLocalData(ACCOUNT);

    expect(adopted.identity).toEqual({ localUserId: local, accountUserId: ACCOUNT });
    expect(expectOk(await adopted.profile.get()).id).toBe(ACCOUNT);
    expect(expectOk(await adopted.sessions.getDetail(sessionId)).userId).toBe(ACCOUNT);

    const status = expectOk(await adopted.sync.syncNow());
    expect([status.pendingCount, status.rejectedCount, status.conflictCount]).toEqual([0, 0, 0]);
    const sent = account.pushes.flatMap((p) => p.mutations);
    expect(sent.some((m) => m.entity === 'profile' && m.entityId === ACCOUNT)).toBe(true);
    expect(sent.some((m) => m.entity === 'profile' && m.entityId === local)).toBe(false);
    expect(sent.every((m) => !('user_id' in (m.payload ?? {})))).toBe(true);
    await adopted.close();

    // La misma base sigue abriéndose ya vinculada.
    const again = await open();
    expect(again.identity.accountUserId).toBe(ACCOUNT);
    await again.close();
  });

  it('si la app se cierra entre reasignar y vincular, la siguiente apertura completa el vínculo', async () => {
    const d = await open();
    await workout(d);
    secure.failWrites = new Error('llavero bloqueado');
    const e = await d.adoptLocalData(ACCOUNT).then(() => null, (x: unknown) => x);
    expect(e).toMatchObject({ code: 'secure-store-unavailable' });
    await d.close().catch(() => undefined);
    secure.failWrites = null;

    const again = await open();
    expect(again.identity.accountUserId).toBe(ACCOUNT);
    expect(expectOk(await again.sessions.listHistory({})).items).toHaveLength(1);
    await again.close();
  });

  it('otra cuenta en un dispositivo ya vinculado → FORBIDDEN; nada cambia', async () => {
    const d = await open();
    const adopted = await d.adoptLocalData(ACCOUNT);
    const e = await adopted.adoptLocalData('bbbbbbbb-0000-4000-8000-000000000002').then(() => null, (x: unknown) => x);
    expect(e).toMatchObject({ appError: { code: 'FORBIDDEN' } });
    expect(adopted.identity.accountUserId).toBe(ACCOUNT);
    await adopted.close();
  });
});

describe('esquema local v2', () => {
  it('una base v1 existente (sin `sports` ni cuarentena) se actualiza sin perder datos', async () => {
    const path = join(tmp.dir, 'v1.db');
    const db = openNodeSqlite(path);
    await migrateLocalDatabase(db);
    await db.exec("INSERT INTO profiles (id, user_id, time_zone, goals) VALUES ('p', 'p', 'UTC', '[]')");
    await db.exec('ALTER TABLE profiles DROP COLUMN sports; DROP TABLE legacy_quarantine; PRAGMA user_version = 1;');
    await migrateLocalDatabase(db);
    expect(Number((await db.get<{ user_version: number }>('PRAGMA user_version'))?.user_version)).toBe(LOCAL_SCHEMA_VERSION);
    expect(await db.get('SELECT id, sports FROM profiles')).toEqual({ id: 'p', sports: '[]' });
    expect(await db.get("SELECT name FROM sqlite_master WHERE name = 'legacy_quarantine'")).toEqual({ name: 'legacy_quarantine' });
    await db.close();
  });
});
