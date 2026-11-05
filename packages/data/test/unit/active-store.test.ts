import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { CATALOG_EXERCISE_ID } from '../../src/catalog/bundled';
import { IDENTITY_KEY } from '../../src/identity';
import type { OpenedAthleteData } from '../../src/open';
import { databaseKeyName } from '../../src/secure/encrypted-database';
import { localDatabaseName } from '../../src/sql/expo-sqlite';
import {
  ACTIVE_STORE_KEY, inspectStorage, openActiveStore, startNewStore,
  type ActiveStore, type ActiveStoreMarker, type DatabaseFiles,
} from '../../src/storage/active-store';
import { MemorySecureStore, TestClock, cipherOpener, expectOk, fileSha256, newId, randomBytesSync, tempDir } from '../support';

/**
 * Selector del almacén oficial: todas las pruebas usan directorios temporales desechables (nunca la base del
 * simulador). `appDir` hace de `SQLite.defaultDatabaseDirectory`.
 */

const SQUAT = CATALOG_EXERCISE_ID['back-squat']!;
/** Nombre de la base de la capa anterior, retirada el 5-nov-2026. Solo se usa para comprobar que se ignora. */
const RETIRED_LEGACY_DB = 'athlete3.db';
const RETIRED_LEGACY_KEY = 'athlete3.sqlite.sqlcipher-key.v1';
let tmp: ReturnType<typeof tempDir>;
let appDir: string;
let secure: MemorySecureStore;
let clock: TestClock;
let opener: ReturnType<typeof cipherOpener>;
let files: DatabaseFiles;

beforeEach(() => {
  tmp = tempDir();
  appDir = join(tmp.dir, 'SQLite');
  mkdirSync(appDir, { recursive: true });
  secure = new MemorySecureStore();
  clock = new TestClock(Date.parse('2026-11-05T12:00:00Z'));
  opener = cipherOpener(appDir);
  files = { async listDatabases() { return existsSync(appDir) ? readdirSync(appDir) : []; } };
});
afterEach(() => { vi.restoreAllMocks(); tmp.cleanup(); });

const options = (extra: Record<string, unknown> = {}) => ({
  openDatabase: opener.open, secureStore: secure, randomBytes: randomBytesSync, clock, files, ...extra,
});
const marker = () => (secure.items.has(ACTIVE_STORE_KEY) ? JSON.parse(secure.items.get(ACTIVE_STORE_KEY)!) as ActiveStoreMarker : null);

function official(store: ActiveStore): OpenedAthleteData {
  if (store.kind !== 'official') throw new Error(`Se esperaba official: ${JSON.stringify(store.selection)}`);
  return store.data;
}

async function workout(d: OpenedAthleteData) {
  const s = expectOk(await d.sessions.start({ id: newId(), startedAt: clock.now(), timeZone: 'UTC' }));
  const se = expectOk(await d.sessions.addExercise({ id: newId(), sessionId: s.id, exerciseId: SQUAT }));
  expectOk(await d.sessions.logSet({ id: newId(), sessionExerciseId: se.id, weightKg: 100, reps: 5, rir: 1, completedAt: clock.now() }));
  clock.advance(60_000);
  expectOk(await d.sessions.complete({ sessionId: s.id, endedAt: clock.now() }));
  return s.id;
}

describe('instalación nueva', () => {
  it('sin archivos ni marcador: crea la base oficial y después el marcador; el segundo arranque la reconoce', async () => {
    expect(await inspectStorage(options())).toEqual({ state: 'fresh-install', active: 'official' });
    const first = await openActiveStore(options());
    const d = official(first);
    expect(first.selection.state).toBe('fresh-install');
    expect(marker()).toEqual({ v: 1, store: 'official', at: clock.now(), retained: [] });
    const sessionId = await workout(d);
    await d.close();

    const second = await openActiveStore(options());
    expect(second.selection).toEqual({ state: 'official-existing', active: 'official' });
    expect(expectOk(await official(second).sessions.listHistory({})).items.map((h) => h.sessionId)).toEqual([sessionId]);
    await official(second).close();
  });

  it('si la app se cierra entre crear la base y escribir el marcador, el siguiente arranque la trata como existente', async () => {
    const spy = vi.spyOn(secure, 'setItem').mockImplementation(async function (this: MemorySecureStore, k: string, v: string) {
      if (k === ACTIVE_STORE_KEY) throw new Error('cierre de la app');
      this.items.set(k, v);
    });
    const r = await openActiveStore(options());
    expect(r.kind).toBe('blocked');
    spy.mockRestore();
    const again = await openActiveStore(options());
    expect(again.selection.state).toBe('official-existing');
    await official(again).close();
  });

  it('dos aperturas simultáneas crean una sola identidad, una sola clave y un solo marcador', async () => {
    const [a, b] = await Promise.all([openActiveStore(options()), openActiveStore(options())]);
    const da = official(a);
    const db = official(b);
    expect(da.identity).toEqual(db.identity);
    expect(a.selection.state).toBe('fresh-install');
    expect(b.selection.state).toBe('official-existing');
    expect(secure.writes.filter((k) => k === IDENTITY_KEY)).toHaveLength(1);
    expect(secure.writes.filter((k) => k === ACTIVE_STORE_KEY)).toHaveLength(1);
    await da.close();
    await db.close();
  });
});

describe('capa anterior retirada', () => {
  it('un athlete3.db de la capa anterior se ignora: no se abre, no se modifica y no se registra', async () => {
    writeFileSync(join(appDir, RETIRED_LEGACY_DB), 'contenido de la base anterior');
    secure.items.set(RETIRED_LEGACY_KEY, 'd'.repeat(64));
    const sha = fileSha256(join(appDir, RETIRED_LEGACY_DB));

    const d = official(await openActiveStore(options()));
    await d.close();
    expect(opener.opened.map((o) => o.path)).not.toContain(join(appDir, RETIRED_LEGACY_DB));
    expect(fileSha256(join(appDir, RETIRED_LEGACY_DB))).toBe(sha);
    expect(secure.items.get(RETIRED_LEGACY_KEY)).toBe('d'.repeat(64));
    expect(marker()?.retained).toEqual([]);
  });

  it('un marcador de la capa anterior bloquea con secret-invalid; start-new-store lo reemplaza sin borrar nada', async () => {
    const old = JSON.stringify({ v: 1, store: 'legacy', at: clock.now() });
    secure.items.set(ACTIVE_STORE_KEY, old);
    const r = await openActiveStore(options());
    expect(r.selection).toMatchObject({ state: 'open-error', code: 'secret-invalid', recovery: ['start-new-store'] });
    expect(r.selection.state === 'open-error' && r.selection.message).toMatch(/capa anterior/);
    expect(secure.items.get(ACTIVE_STORE_KEY)).toBe(old);

    const fresh = official(await startNewStore({ ...options(), confirm: 'start-new-store' }));
    await fresh.close();
    expect(marker()).toMatchObject({ v: 1, store: 'official', retained: [] });
  });
});

describe('base oficial existente', () => {
  it('creada sin selector (sin marcador): se reconoce y se registra el marcador', async () => {
    const { openAthleteData } = await import('../../src/open');
    const d = await openAthleteData({ openDatabase: opener.open, secureStore: secure, randomBytes: randomBytesSync, clock });
    await workout(d);
    await d.close();
    const r = await openActiveStore(options());
    expect(r.selection).toEqual({ state: 'official-existing', active: 'official' });
    expect(expectOk(await official(r).sessions.listHistory({})).items).toHaveLength(1);
    expect(marker()).toMatchObject({ store: 'official' });
    await official(r).close();
  });

  it('archivo oficial sin identidad: identity-missing; nunca se crea una identidad ni una base nueva', async () => {
    await official(await openActiveStore(options())).close();
    secure.items.delete(IDENTITY_KEY);
    const before = new Map(secure.items);
    const listing = readdirSync(appDir).sort();
    const r = await openActiveStore(options());
    expect(r.kind).toBe('blocked');
    expect(r.selection).toMatchObject({ state: 'open-error', code: 'identity-missing', recovery: ['start-new-store'] });
    expect(secure.items).toEqual(before);
    expect(readdirSync(appDir).sort()).toEqual(listing);
  });

  it('la identidad apunta a otra base que la existente: se detiene (identity-missing), no se crea la de la identidad', async () => {
    const d = official(await openActiveStore(options()));
    await d.close();
    const other = '0190f0f0-0000-7000-8000-0000000000aa';
    secure.items.set(IDENTITY_KEY, JSON.stringify({ v: 1, localUserId: other, accountUserId: null }));
    const listing = readdirSync(appDir).sort();
    const r = await openActiveStore(options());
    expect(r.selection).toMatchObject({ state: 'open-error', code: 'identity-missing' });
    expect(readdirSync(appDir).sort()).toEqual(listing);
  });

  it("openAthleteData({ expect: 'existing' }) nunca crea identidad ni clave aunque se llame sin el selector", async () => {
    const { openAthleteData } = await import('../../src/open');
    const base = { openDatabase: opener.open, secureStore: secure, randomBytes: randomBytesSync, clock, expect: 'existing' as const };
    await expect(openAthleteData(base)).rejects.toMatchObject({ code: 'identity-missing' });
    expect(secure.items.size).toBe(0);
    secure.items.set(IDENTITY_KEY, JSON.stringify({ v: 1, localUserId: '0190f0f0-0000-7000-8000-0000000000bb', accountUserId: null }));
    await expect(openAthleteData(base)).rejects.toMatchObject({ code: 'database-key-missing' });
    expect(secure.items.size).toBe(1);
    expect(opener.opened).toHaveLength(0);
  });

  it('marcador oficial pero sin archivo (p. ej. reinstalación con el llavero conservado): official-missing, no se crea nada', async () => {
    const d = official(await openActiveStore(options()));
    const name = localDatabaseName(d.identity.localUserId);
    await d.close();
    for (const f of readdirSync(appDir)) rmSync(join(appDir, f));
    const r = await openActiveStore(options());
    expect(r.selection).toMatchObject({ state: 'open-error', store: 'official', code: 'official-missing', recovery: ['start-new-store'] });
    expect(readdirSync(appDir)).toEqual([]);
    expect(secure.items.has(databaseKeyName(name))).toBe(true);
  });

  it('start-new-store no se permite cuando no hay ningún error que recuperar', async () => {
    await expect(startNewStore({ ...options(), confirm: 'start-new-store' })).rejects.toMatchObject({ code: 'not-allowed' });
    await official(await openActiveStore(options())).close();
    const before = new Map(secure.items);
    await expect(startNewStore({ ...options(), confirm: 'start-new-store' })).rejects.toMatchObject({ code: 'not-allowed' });
    expect(secure.items).toEqual(before);
  });
});

describe('clave ausente o incorrecta', () => {
  it('base oficial sin su clave: se detiene sin generar clave; start-new-store conserva el archivo', async () => {
    const d = official(await openActiveStore(options()));
    const oldName = localDatabaseName(d.identity.localUserId);
    await workout(d);
    await d.close();
    secure.items.delete(databaseKeyName(oldName));
    const sha = fileSha256(join(appDir, oldName));

    const r = await openActiveStore(options());
    expect(r.selection).toMatchObject({ state: 'open-error', code: 'database-key-missing', recovery: ['start-new-store'] });
    expect(secure.items.has(databaseKeyName(oldName))).toBe(false);
    expect(fileSha256(join(appDir, oldName))).toBe(sha);

    await expect(startNewStore({ ...options(), confirm: 'nope' as 'start-new-store' })).rejects.toMatchObject({ code: 'not-allowed' });
    const fresh = official(await startNewStore({ ...options(), confirm: 'start-new-store' }));
    expect(localDatabaseName(fresh.identity.localUserId)).not.toBe(oldName);
    expect(expectOk(await fresh.sessions.listHistory({})).items).toEqual([]);
    await fresh.close();
    expect(fileSha256(join(appDir, oldName))).toBe(sha);
    expect(marker()).toMatchObject({ store: 'official', retained: [{ file: oldName, reason: 'database-key-missing' }] });
    expect((await openActiveStore(options())).selection.state).toBe('official-existing');
  });

  it('almacén seguro no disponible (dispositivo bloqueado): retry, sin escribir nada', async () => {
    await official(await openActiveStore(options())).close();
    const writes = secure.writes.length;
    secure.failReads = new Error('User interaction is not allowed');
    const r = await openActiveStore(options());
    expect(r.selection).toMatchObject({ state: 'open-error', code: 'secure-store-unavailable', recovery: ['retry'] });
    expect(secure.writes).toHaveLength(writes);
    secure.failReads = null;
    const again = await openActiveStore(options());
    expect(again.selection.state).toBe('official-existing');
    await official(again).close();
  });

  it('clave incorrecta: database-unreadable antes de migrar el esquema; la clave guardada no se reemplaza', async () => {
    const d = official(await openActiveStore(options()));
    const keyName = databaseKeyName(localDatabaseName(d.identity.localUserId));
    await d.close();
    const wrong = 'e'.repeat(64);
    secure.items.set(keyName, wrong);
    const opened = opener.opened.length;
    const r = await openActiveStore(options());
    expect(r.selection).toMatchObject({ state: 'open-error', code: 'database-unreadable', recovery: ['start-new-store'] });
    expect(secure.items.get(keyName)).toBe(wrong);
    const last = opener.opened[opened]!;
    expect(last.statements.some((s) => /CREATE|INSERT|UPDATE|ALTER/i.test(s))).toBe(false);
  });
});

describe('restauración y recuperación', () => {
  it('restauración de archivos sin el almacén seguro (Android Auto Backup sin reglas): nada se interpreta como nuevo', async () => {
    // Dispositivo A: una base oficial con datos.
    const a = official(await openActiveStore(options()));
    await workout(a);
    await a.close();
    const restoredFiles = readdirSync(appDir).sort();

    // Dispositivo B: mismos archivos, almacén seguro vacío (las claves de Keystore nunca se respaldan).
    secure = new MemorySecureStore();
    const r = await openActiveStore(options());
    expect(r.selection).toMatchObject({ state: 'open-error', code: 'identity-missing', recovery: ['start-new-store'] });
    expect(readdirSync(appDir).sort()).toEqual(restoredFiles);

    const fresh = official(await startNewStore({ ...options(), confirm: 'start-new-store' }));
    await fresh.close();
    expect(readdirSync(appDir).filter((n) => restoredFiles.includes(n)).sort()).toEqual(restoredFiles);
    expect(marker()!.retained.map((x) => x.file).sort()).toEqual(restoredFiles.filter((n) => n.endsWith('.db')).sort());
  });

  it('con cuenta vinculada: el error lo indica y la base nueva conserva la cuenta para restaurar por sync', async () => {
    const d = official(await openActiveStore(options()));
    const account = '0190f0f0-0000-7000-8000-000000000001';
    const linked = await d.adoptLocalData(account);
    const keyName = databaseKeyName(localDatabaseName(linked.identity.localUserId));
    await linked.close();
    secure.items.delete(keyName);
    const r = await openActiveStore(options());
    expect(r.selection).toMatchObject({ state: 'open-error', code: 'database-key-missing', accountLinked: true });
    const fresh = official(await startNewStore({ ...options(), confirm: 'start-new-store' }));
    expect(fresh.identity.accountUserId).toBe(account);
    await fresh.close();
  });

  it('marcador ilegible: secret-invalid; start-new-store lo reemplaza por comparar-y-escribir sin borrar nada', async () => {
    const d = official(await openActiveStore(options()));
    await d.close();
    secure.items.set(ACTIVE_STORE_KEY, '{roto');
    const r = await openActiveStore(options());
    expect(r.selection).toMatchObject({ state: 'open-error', code: 'secret-invalid' });
    const fresh = official(await startNewStore({ ...options(), confirm: 'start-new-store' }));
    await fresh.close();
    expect(marker()).toMatchObject({ store: 'official', retained: [{ reason: 'secret-invalid' }] });
  });
});
