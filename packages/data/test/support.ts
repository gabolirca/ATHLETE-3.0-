import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { appError, err, ok, type Clock, type Result, type SyncTransport, type PushRequest, type PullRequest, type PushResponse, type PullResponse, type CatalogSnapshot } from '@athlete/contracts';
import { createAthleteData } from '../src/factory';
import { createUuidV7Generator } from '../src/ids';
import { openNodeSqlite } from '../src/sql/node-sqlite';

export const ids = createUuidV7Generator((n) => new Uint8Array(randomBytes(n)));
export const newId = () => ids.newId();

export class TestClock implements Clock {
  constructor(private ms = Date.parse('2026-11-04T04:30:00Z')) {}
  now() { return new Date(this.ms).toISOString(); }
  advance(ms: number) { this.ms += ms; }
}

export function tempDir(): { dir: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), 'athlete3-test-'));
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

export const CATALOG: CatalogSnapshot = {
  muscleGroups: [{ id: '10000000-0000-4000-8000-000000000008', slug: 'quadriceps', name: 'Cuádriceps' }],
  equipment: [{ id: '20000000-0000-4000-8000-000000000001', slug: 'barbell', name: 'Barra' }],
  exercises: [{
    id: '30000000-0000-4000-8000-000000000001', user_id: null, slug: 'back-squat', name: 'Sentadilla trasera', modality: 'strength',
    load_type: 'external', primary_muscle_group_ids: ['10000000-0000-4000-8000-000000000008'], secondary_muscle_group_ids: [],
    equipment_ids: ['20000000-0000-4000-8000-000000000001'], instructions: null, archived_at: null,
    created_at: '2026-11-01T00:00:00+00:00', updated_at: '2026-11-01T00:00:00+00:00', deleted_at: null, revision: 1,
  }],
};
export const SQUAT = '30000000-0000-4000-8000-000000000001';

/** Transporte simulado y controlable (sin red). */
export class FakeTransport implements SyncTransport {
  online = true;
  pushes: PushRequest[] = [];
  pushHandler: (req: PushRequest) => Result<PushResponse> = (req) => ok({ results: req.mutations.map((m, i) => ({ status: 'applied' as const, mutationId: m.mutationId, revision: (m.baseRevision ?? 0) + 1 + i * 0 })) });
  pullHandler: (req: PullRequest) => Result<PullResponse> = () => ok({ changes: [], nextCursor: '0', hasMore: false });

  async push(req: PushRequest) {
    if (!this.online) return err<PushResponse>(appError('NETWORK_UNAVAILABLE', 'offline'));
    this.pushes.push(structuredClone(req));
    return this.pushHandler(req);
  }
  async pull(req: PullRequest) {
    if (!this.online) return err<PullResponse>(appError('NETWORK_UNAVAILABLE', 'offline'));
    return this.pullHandler(req);
  }
  async pullCatalog() {
    if (!this.online) return err<CatalogSnapshot>(appError('NETWORK_UNAVAILABLE', 'offline'));
    return ok(CATALOG);
  }
}

export async function openDevice(path: string, userId: string, transport: SyncTransport, clock = new TestClock()) {
  return createAthleteData({ db: openNodeSqlite(path), userId, ids, transport, clock });
}

export function expectOk<T>(r: Result<T>): T {
  if (!r.ok) throw new Error(`Se esperaba ok: ${JSON.stringify(r.error)}`);
  return r.value;
}

// ---------------------------------------------------------------------------------------------
// SQLCipher simulado y almacén seguro en memoria (para `openEncryptedDatabase` / `openAthleteData`).
// ---------------------------------------------------------------------------------------------
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { SecureKeyValueStorage } from '@athlete/contracts';
import type { ExpoSQLiteDatabaseLike } from '../src/sql/expo-sqlite';

/** Clave con la que SQLCipher "cifró" cada archivo (null = archivo vacío aún sin escribir). */
export const cipherDisk = new Map<string, string | null>();

const READ = /^\s*(SELECT|PRAGMA\s+(user_version|table_info|cipher_version)\b(?![^;]*=))/i;

/**
 * Emula lo que importa de SQLCipher sobre node:sqlite real: `PRAGMA key` fija la clave de la sesión; un archivo
 * vacío adopta la clave en su primera escritura; con otra clave toda sentencia falla con "file is not a database".
 * `statements` registra todo lo ejecutado (para comprobar que una copia heredada nunca se escribe).
 */
export class FakeCipherDatabase implements ExpoSQLiteDatabaseLike {
  private key: string | null = null;
  readonly statements: string[] = [];
  private readonly native: DatabaseSync;
  closed = false;

  constructor(readonly path: string, private readonly cipherAvailable = true) {
    this.native = new DatabaseSync(path);
    if (!cipherDisk.has(path)) cipherDisk.set(path, null);
  }

  private guard(sql: string): 'handled' | 'ok' {
    this.statements.push(sql);
    const k = /^PRAGMA key = "x'([0-9a-f]+)'";$/.exec(sql.trim());
    if (k) { this.key = k[1] as string; return 'handled'; }
    const fileKey = cipherDisk.get(this.path) ?? null;
    if (fileKey !== null && fileKey !== this.key) throw new Error('file is not a database');
    if (!READ.test(sql) && fileKey === null) cipherDisk.set(this.path, this.key ?? 'plaintext');
    return 'ok';
  }

  async execAsync(sql: string) {
    if (/^PRAGMA cipher_version/i.test(sql.trim())) return;
    if (this.guard(sql) === 'ok') this.native.exec(sql);
  }
  async runAsync(sql: string, params: Array<string | number | null>) {
    this.guard(sql);
    return { changes: Number(this.native.prepare(sql).run(...params).changes) };
  }
  async getAllAsync<T>(sql: string, params: Array<string | number | null>): Promise<T[]> {
    if (/^PRAGMA cipher_version/i.test(sql.trim())) {
      this.statements.push(sql);
      return (this.cipherAvailable ? [{ cipher_version: '4.6.1 community' }] : []) as T[];
    }
    this.guard(sql);
    return this.native.prepare(sql).all(...params) as T[];
  }
  async closeAsync() { if (!this.closed) { this.closed = true; this.native.close(); } }
}

export class MemorySecureStore implements SecureKeyValueStorage {
  readonly items = new Map<string, string>();
  failReads: Error | null = null;
  failWrites: Error | null = null;
  writes: string[] = [];
  async getItem(key: string) { if (this.failReads) throw this.failReads; return this.items.get(key) ?? null; }
  async setItem(key: string, value: string) {
    if (this.failReads ?? this.failWrites) throw (this.failReads ?? this.failWrites);
    this.writes.push(key);
    this.items.set(key, value);
  }
  async removeItem(key: string) { this.items.delete(key); }
}

export const randomBytesSync = (n: number) => new Uint8Array(randomBytes(n));
export const sha256 = async (text: string) => createHash('sha256').update(text).digest('hex');
export const fileSha256 = (path: string) => createHash('sha256').update(readFileSync(path)).digest('hex');

/** Abridor estilo `SQLite.openDatabaseAsync` que crea los archivos en `dir` y recuerda las conexiones. */
export function cipherOpener(dir: string, options: { cipherAvailable?: boolean } = {}) {
  const opened: FakeCipherDatabase[] = [];
  const open = async (name: string) => {
    const db = new FakeCipherDatabase(join(dir, name), options.cipherAvailable ?? true);
    opened.push(db);
    return db;
  };
  return { open, opened };
}
