import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { constants, copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { CATALOG_EXERCISE_ID } from '../../src/catalog/bundled';
import { IDENTITY_KEY, LEGACY_OWNER_KEY } from '../../src/identity';
import { LEGACY_DATABASE_KEY_NAME, type OpenedAthleteData } from '../../src/open';
import { databaseKeyName } from '../../src/secure/encrypted-database';
import { fromExpoSqlite, localDatabaseName } from '../../src/sql/expo-sqlite';
import {
  ACTIVE_STORE_KEY, LEGACY_DATABASE_NAME, inspectStorage, keepLegacyStore, migrateLegacyStore, openActiveStore, rollbackMigration, startNewStore,
  type ActiveStore, type ActiveStoreMarker, type DatabaseFiles,
} from '../../src/storage/active-store';
import { createCodexV1, L } from '../fixtures/codex-v1';
import { FakeCipherDatabase, MemorySecureStore, TestClock, cipherDisk, cipherOpener, expectOk, fileSha256, newId, randomBytesSync, sha256, tempDir } from '../support';

/**
 * Selector de almacén: todas las pruebas usan directorios temporales desechables (nunca la base del simulador).
 * `appDir` hace de `SQLite.defaultDatabaseDirectory`; `backupRoot`, del directorio de respaldos.
 */

const LEGACY_KEY = 'd'.repeat(64);
const SQUAT = CATALOG_EXERCISE_ID['back-squat']!;
let tmp: ReturnType<typeof tempDir>;
let appDir: string;
let backupRoot: string;
let secure: MemorySecureStore;
let clock: TestClock;
let opener: ReturnType<typeof cipherOpener>;
let files: DatabaseFiles & { copies: string[]; failCopy: Error | null };

function nodeFiles(): typeof files {
  const port = {
    copies: [] as string[],
    failCopy: null as Error | null,
    async listDatabases() { return existsSync(appDir) ? readdirSync(appDir) : []; },
    async hashDatabaseFile(name: string) { const p = join(appDir, name); return existsSync(p) ? fileSha256(p) : null; },
    async copyToBackup(name: string, dir: string) {
      if (port.failCopy) throw port.failCopy;
      mkdirSync(join(backupRoot, dir), { recursive: true });
      copyFileSync(join(appDir, name), join(backupRoot, dir, name), constants.COPYFILE_EXCL);
      if (cipherDisk.has(join(appDir, name))) cipherDisk.set(join(backupRoot, dir, name), cipherDisk.get(join(appDir, name)) ?? null);
      port.copies.push(name);
    },
    async hashBackupFile(dir: string, name: string) { const p = join(backupRoot, dir, name); return existsSync(p) ? fileSha256(p) : null; },
  };
  return port;
}

beforeEach(() => {
  tmp = tempDir();
  appDir = join(tmp.dir, 'SQLite');
  backupRoot = join(tmp.dir, 'backups');
  mkdirSync(appDir, { recursive: true });
  secure = new MemorySecureStore();
  clock = new TestClock(Date.parse('2026-11-05T12:00:00Z'));
  opener = cipherOpener(appDir);
  files = nodeFiles();
});
afterEach(() => { vi.restoreAllMocks(); tmp.cleanup(); });

const options = (extra: Record<string, unknown> = {}) => ({
  openDatabase: opener.open, secureStore: secure, randomBytes: randomBytesSync, clock, files, ...extra,
});
const migrateOptions = () => ({
  ...options(),
  openBackupDatabase: async (name: string, dir: string) => new FakeCipherDatabase(join(backupRoot, dir, name)),
  deviceTimeZone: 'UTC',
  sha256,
});
const marker = () => (secure.items.has(ACTIVE_STORE_KEY) ? JSON.parse(secure.items.get(ACTIVE_STORE_KEY)!) as ActiveStoreMarker : null);
const legacyPath = () => join(appDir, LEGACY_DATABASE_NAME);
const openedNames = () => opener.opened.map((d) => d.path.slice(appDir.length + 1));

/** Base de la capa anterior cifrada con su clave, como la deja `apps/mobile/src/data/database.ts`. */
async function createLegacy(fixture: Parameters<typeof createCodexV1>[1] = {}) {
  secure.items.set(LEGACY_DATABASE_KEY_NAME, LEGACY_KEY);
  secure.items.set(LEGACY_OWNER_KEY, `device:${L.owner}`);
  const db = await fromExpoSqlite(new FakeCipherDatabase(legacyPath()), { encryptionKey: LEGACY_KEY });
  await createCodexV1(db, fixture);
  await db.close();
  return fileSha256(legacyPath());
}

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

async function count(d: OpenedAthleteData, sql: string) {
  const rows = await (d as unknown as { sync: { store: { db: { all<T>(s: string): Promise<T[]> } } } }).sync.store.db.all<{ n: number }>(sql);
  return Number(rows[0]?.n ?? 0);
}

describe('instalación nueva', () => {
  it('sin archivos ni marcador: crea la base oficial y después el marcador; el segundo arranque la reconoce', async () => {
    expect(await inspectStorage(options())).toEqual({ state: 'fresh-install', active: 'official' });
    const first = await openActiveStore(options());
    const d = official(first);
    expect(first.selection.state).toBe('fresh-install');
    expect(marker()).toMatchObject({ v: 1, store: 'official', migratedFrom: null, retained: [] });
    const sessionId = await workout(d);
    await d.close();
    expect(existsSync(legacyPath())).toBe(false);

    const second = await openActiveStore(options());
    expect(second.selection).toEqual({ state: 'official-existing', active: 'official', legacy: 'absent' });
    expect(expectOk(await official(second).sessions.listHistory({})).items.map((h) => h.sessionId)).toEqual([sessionId]);
    await official(second).close();
  });

  it('con la política de transición `legacy`, una instalación nueva monta legacy y no crea nada', async () => {
    const r = await openActiveStore(options({ newInstallations: 'legacy' }));
    expect(r).toEqual({ kind: 'legacy', selection: { state: 'fresh-install', active: 'legacy' } });
    expect(secure.items.size).toBe(0);
    expect(readdirSync(appDir)).toEqual([]);
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
});

describe('base legacy existente', () => {
  it('se selecciona legacy sin abrirla, sin crear identidad ni base oficial; solo se registra el marcador', async () => {
    const sha = await createLegacy();
    const before = new Map(secure.items);
    const r = await openActiveStore(options());
    expect(r).toEqual({ kind: 'legacy', selection: { state: 'legacy-existing', active: 'legacy', migratable: true, officialFilePresent: false } });
    expect(opener.opened).toHaveLength(0);
    expect(fileSha256(legacyPath())).toBe(sha);
    expect([...secure.items.keys()].filter((k) => !before.has(k))).toEqual([ACTIVE_STORE_KEY]);
    expect(marker()).toMatchObject({ store: 'legacy' });
    expect(readdirSync(appDir).filter((n) => n !== LEGACY_DATABASE_NAME && !n.startsWith(`${LEGACY_DATABASE_NAME}-`))).toEqual([]);
  });

  it('sin dueño local: se puede seguir usando legacy pero no migrar', async () => {
    await createLegacy();
    secure.items.delete(LEGACY_OWNER_KEY);
    expect(await inspectStorage(options())).toMatchObject({ state: 'legacy-existing', migratable: false });
    await expect(migrateLegacyStore(migrateOptions())).rejects.toMatchObject({ code: 'legacy-owner-missing' });
    expect(marker()).toBeNull();
  });

  it('migración completa: copia verificada, importa desde la copia, cambia a oficial; el original no cambia', async () => {
    const sha = await createLegacy();
    const r = await migrateLegacyStore(migrateOptions());
    expect(r.alreadyImported).toBe(false);
    expect(r.report.imported.strength_set).toBe(6);
    expect(files.copies).toContain(LEGACY_DATABASE_NAME);
    expect(openedNames()).not.toContain(LEGACY_DATABASE_NAME);
    expect(fileSha256(legacyPath())).toBe(sha);
    expect(secure.items.get(LEGACY_DATABASE_KEY_NAME)).toBe(LEGACY_KEY);
    expect(marker()).toMatchObject({ store: 'official', migratedFrom: { backupDir: r.backupDir, fingerprint: r.report.fingerprint } });
    expect(expectOk(await r.data.sessions.listHistory({})).items.length).toBeGreaterThan(0);
    await r.data.close();

    const next = await openActiveStore(options());
    expect(next.selection).toEqual({ state: 'official-existing', active: 'official', legacy: 'retained-read-only' });
    await official(next).close();
    expect(existsSync(legacyPath())).toBe(true);
  });
});

describe('base oficial existente', () => {
  it('creada por una compilación sin selector (sin marcador): se reconoce y se registra el marcador', async () => {
    const { openAthleteData } = await import('../../src/open');
    const d = await openAthleteData({ openDatabase: opener.open, secureStore: secure, randomBytes: randomBytesSync, clock });
    await workout(d);
    await d.close();
    const r = await openActiveStore(options());
    expect(r.selection).toEqual({ state: 'official-existing', active: 'official', legacy: 'absent' });
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
});

describe('clave ausente', () => {
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

  it('base legacy sin su clave: se detiene; start-new-store deja legacy y su dueño intactos', async () => {
    const sha = await createLegacy();
    secure.items.delete(LEGACY_DATABASE_KEY_NAME);
    const r = await openActiveStore(options());
    expect(r.selection).toMatchObject({ state: 'open-error', store: 'legacy', code: 'database-key-missing' });
    expect(marker()).toBeNull();
    const fresh = official(await startNewStore({ ...options(), confirm: 'start-new-store' }));
    expect(fresh.identity.localUserId).not.toBe(L.owner);
    await fresh.close();
    expect(fileSha256(legacyPath())).toBe(sha);
    expect(secure.items.get(LEGACY_OWNER_KEY)).toBe(`device:${L.owner}`);
    expect(marker()).toMatchObject({ retained: [{ file: LEGACY_DATABASE_NAME, keyName: LEGACY_DATABASE_KEY_NAME }] });
  });

  it('almacén seguro no disponible (dispositivo bloqueado): retry, sin escribir nada', async () => {
    await createLegacy();
    secure.failReads = new Error('User interaction is not allowed');
    const r = await openActiveStore(options());
    expect(r.selection).toMatchObject({ state: 'open-error', code: 'secure-store-unavailable', recovery: ['retry'] });
    expect(secure.writes).toEqual([]);
    secure.failReads = null;
    expect((await openActiveStore(options())).kind).toBe('legacy');
  });
});

describe('clave incorrecta', () => {
  it('oficial: database-unreadable antes de migrar el esquema; la clave guardada no se reemplaza', async () => {
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

  it('legacy: la copia no abre con la clave; la migración queda pendiente, se vuelve a legacy y se ofrece empezar de nuevo', async () => {
    const sha = await createLegacy();
    secure.items.set(LEGACY_DATABASE_KEY_NAME, 'e'.repeat(64));
    await expect(migrateLegacyStore(migrateOptions())).rejects.toMatchObject({ code: 'database-unreadable', recovery: ['rollback-to-legacy', 'start-new-store'] });
    expect(await inspectStorage(options())).toMatchObject({ state: 'migration-pending' });
    expect((await openActiveStore(options())).kind).toBe('blocked');
    expect(await rollbackMigration(options())).toMatchObject({ state: 'legacy-existing' });
    // La capa legacy informa que no puede abrir su base → el usuario elige empezar de nuevo.
    await expect(startNewStore({ ...options(), confirm: 'start-new-store' })).rejects.toMatchObject({ code: 'not-allowed' });
    await official(await startNewStore({ ...options(), confirm: 'start-new-store', legacyFailureCode: 'database-unreadable' })).close();
    expect(fileSha256(legacyPath())).toBe(sha);
  });
});

describe('migración interrumpida', () => {
  it('falla la copia: queda pendiente, no se monta ningún almacén y al reanudar termina', async () => {
    const sha = await createLegacy();
    files.failCopy = new Error('disco lleno');
    await expect(migrateLegacyStore(migrateOptions())).rejects.toMatchObject({ code: 'open-failed' });
    expect(marker()).toMatchObject({ store: 'migrating', legacyHashes: null });
    const blocked = await openActiveStore(options());
    expect(blocked).toMatchObject({ kind: 'blocked', selection: { state: 'migration-pending', recovery: ['resume-migration', 'rollback-to-legacy', 'start-new-store'] } });
    files.failCopy = null;
    const r = await migrateLegacyStore(migrateOptions());
    expect(r.alreadyImported).toBe(false);
    expect(fileSha256(legacyPath())).toBe(sha);
    await r.data.close();
  });

  it('cierre tras confirmar la importación y antes de cambiar el marcador: no se puede volver; reanudar no duplica', async () => {
    await createLegacy();
    const realSet = secure.setItem.bind(secure);
    const spy = vi.spyOn(secure, 'setItem').mockImplementation(async (k, v) => {
      if (k === ACTIVE_STORE_KEY && v.includes('"store":"official"')) throw new Error('cierre de la app');
      return realSet(k, v);
    });
    await expect(migrateLegacyStore(migrateOptions())).rejects.toBeTruthy();
    spy.mockRestore();
    expect(marker()).toMatchObject({ store: 'migrating' });
    await expect(rollbackMigration(options())).rejects.toMatchObject({ code: 'import-committed', recovery: ['resume-migration'] });

    const r = await migrateLegacyStore(migrateOptions());
    expect(r.alreadyImported).toBe(true);
    expect(await count(r.data, 'SELECT COUNT(*) AS n FROM outbox')).toBe(r.report.enqueued);
    expect(await count(r.data, 'SELECT COUNT(*) AS n FROM strength_sets')).toBe(r.report.imported.strength_set);
    await r.data.close();
    expect(marker()).toMatchObject({ store: 'official' });
  });

  it('la base legacy cambia mientras está congelada: se detiene; volver a legacy es posible si no se importó', async () => {
    await createLegacy();
    let failImport = true;
    const { LocalStore } = await import('../../src/local/store');
    const spy = vi.spyOn(LocalStore.prototype, 'importRecord').mockImplementation(async () => { if (failImport) throw new Error('fallo a mitad'); });
    await expect(migrateLegacyStore(migrateOptions())).rejects.toMatchObject({ code: 'open-failed' });
    spy.mockRestore();
    failImport = false;
    expect(marker()).toMatchObject({ store: 'migrating' });
    expect((marker() as Extract<ActiveStoreMarker, { store: 'migrating' }>).legacyHashes).not.toBeNull();

    writeFileSync(legacyPath(), Buffer.from('x'), { flag: 'a' }); // alguien escribió en legacy
    await expect(migrateLegacyStore(migrateOptions())).rejects.toMatchObject({ code: 'legacy-changed-during-migration' });
    expect(await rollbackMigration(options())).toMatchObject({ state: 'legacy-existing' });
    expect(marker()).toMatchObject({ store: 'legacy' });
  });
});

describe('restauración y recuperación', () => {
  it('restauración de archivos sin el almacén seguro (Android Auto Backup sin reglas): nada se interpreta como nuevo', async () => {
    // Dispositivo A: legacy + una base oficial creada con la bandera de desarrollo.
    await createLegacy();
    const { openAthleteData } = await import('../../src/open');
    await (await openAthleteData({ openDatabase: opener.open, secureStore: secure, randomBytes: randomBytesSync, clock })).close();
    const restoredFiles = readdirSync(appDir).sort();

    // Dispositivo B: mismos archivos, almacén seguro vacío (las claves de Keystore nunca se respaldan).
    secure = new MemorySecureStore();
    const r = await openActiveStore(options());
    expect(r.selection).toMatchObject({ state: 'open-error', code: 'store-ambiguous', recovery: ['keep-legacy'] });
    expect(await keepLegacyStore(options())).toMatchObject({ state: 'open-error', code: 'database-key-missing', store: 'legacy' });
    const fresh = official(await startNewStore({ ...options(), confirm: 'start-new-store' }));
    await fresh.close();
    expect(readdirSync(appDir).filter((n) => restoredFiles.includes(n)).sort()).toEqual(restoredFiles);
    expect((marker() as Extract<ActiveStoreMarker, { store: 'official' }>).retained.map((x) => x.file).sort())
      .toEqual(restoredFiles.filter((n) => n.endsWith('.db')).sort());
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

describe('ausencia de escrituras duplicadas', () => {
  it('tras migrar, legacy nunca vuelve a ser activa (ni con la política legacy) y el original no recibe escrituras', async () => {
    const sha = await createLegacy();
    expect((await openActiveStore(options())).kind).toBe('legacy');
    const r = await migrateLegacyStore(migrateOptions());
    const outbox = await count(r.data, 'SELECT COUNT(*) AS n FROM outbox');
    expectOk(await r.data.body.logWeight({ id: newId(), value: 80, inputUnit: 'kg', measuredAt: clock.now(), timeZone: 'UTC' }));
    expect(await count(r.data, 'SELECT COUNT(*) AS n FROM outbox')).toBe(outbox + 1);
    await r.data.close();
    for (const policy of ['official', 'legacy'] as const) {
      const again = await openActiveStore(options({ newInstallations: policy }));
      expect(again.kind).toBe('official');
      await official(again).close();
    }
    await expect(migrateLegacyStore(migrateOptions())).rejects.toMatchObject({ code: 'not-allowed' });
    await expect(rollbackMigration(options())).rejects.toMatchObject({ code: 'not-allowed' });
    expect(fileSha256(legacyPath())).toBe(sha);
    expect(openedNames()).not.toContain(LEGACY_DATABASE_NAME);
  });

  it('dos migraciones simultáneas en el proceso: una importa, la otra no puede; outbox sin duplicados', async () => {
    await createLegacy();
    const [a, b] = await Promise.allSettled([migrateLegacyStore(migrateOptions()), migrateLegacyStore(migrateOptions())]);
    expect(a.status).toBe('fulfilled');
    expect(b).toMatchObject({ status: 'rejected', reason: { code: 'not-allowed' } });
    const r = (a as PromiseFulfilledResult<Awaited<ReturnType<typeof migrateLegacyStore>>>).value;
    expect(await count(r.data, 'SELECT COUNT(*) AS n FROM outbox')).toBe(r.report.enqueued);
    await r.data.close();
  });

  it('mientras la migración está pendiente no se monta ningún almacén (ni legacy ni oficial)', async () => {
    await createLegacy();
    files.failCopy = new Error('fallo');
    await expect(migrateLegacyStore(migrateOptions())).rejects.toBeTruthy();
    const before = opener.opened.length;
    for (const policy of ['official', 'legacy'] as const) {
      expect((await openActiveStore(options({ newInstallations: policy }))).kind).toBe('blocked');
    }
    expect(opener.opened.length).toBe(before);
  });

  it('dos aperturas simultáneas en una instalación nueva crean una sola identidad, una sola clave y un solo marcador', async () => {
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
