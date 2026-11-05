import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import * as SecureStore from 'expo-secure-store';
import type { SQLiteDatabase } from 'expo-sqlite';
import { getLocalOwnerKey, initializeAthleteDatabase, LocalDatabaseError } from './database';

jest.mock('expo-crypto', () => {
  const crypto = jest.requireActual<typeof import('node:crypto')>('node:crypto');
  return { randomUUID: () => crypto.randomUUID(), getRandomBytesAsync: async (size: number) => new Uint8Array(crypto.randomBytes(size)) };
});

const mockKeychain = new Map<string, string>();
let mockKeychainFailure: Error | null = null;
let mockKeychainWriteFailure: Error | null = null;
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async (name: string) => { if (mockKeychainFailure) throw mockKeychainFailure; return mockKeychain.get(name) ?? null; }),
  setItemAsync: jest.fn(async (name: string, value: string) => { if (mockKeychainFailure ?? mockKeychainWriteFailure) throw mockKeychainFailure ?? mockKeychainWriteFailure; mockKeychain.set(name, value); }),
}));

const DATABASE_KEY_NAME = 'athlete3.sqlite.sqlcipher-key.v1';
const LOCAL_OWNER_NAME = 'athlete3.local-owner.v1';
const KEY_A = 'a'.repeat(64);
const KEY_B = 'b'.repeat(64);

/** What SQLCipher stored on disk: null while the file is still empty, otherwise the key it was encrypted with. */
type DiskState = { fileKey: string | null };

/**
 * Emulates the SQLCipher behaviour that matters here on top of node:sqlite: `PRAGMA key` selects the session
 * key, an empty file adopts the key on its first write, and any statement with a different key fails with
 * "file is not a database" without touching the file.
 */
class FakeSqlCipherDatabase {
  private sessionKey: string | null = null;
  readonly statements: string[] = [];
  closed = false;

  constructor(private readonly native: DatabaseSync, private readonly disk: DiskState, private readonly cipherAvailable = true) {}

  private run<T>(sql: string, task: () => T): T {
    this.statements.push(sql);
    const keyMatch = /^PRAGMA key = "x'([0-9a-f]+)'";$/.exec(sql.trim());
    if (keyMatch) { this.sessionKey = keyMatch[1]; return undefined as T; }
    if (/^PRAGMA cipher_version;$/.test(sql.trim())) return (this.cipherAvailable ? { cipher_version: '4.6.1 community' } : null) as T;
    if (this.disk.fileKey !== null && this.disk.fileKey !== this.sessionKey) throw new Error('file is not a database');
    const isRead = /^\s*(SELECT|PRAGMA user_version;)/i.test(sql);
    if (!isRead && this.disk.fileKey === null) this.disk.fileKey = this.sessionKey ?? 'plaintext';
    return task();
  }

  async execAsync(sql: string) { this.run(sql, () => this.native.exec(sql)); }
  async runAsync(sql: string, ...values: Array<string | number | null>) { return this.run(sql, () => this.native.prepare(sql).run(...values)); }
  async getFirstAsync<T>(sql: string, ...values: Array<string | number | null>): Promise<T | null> { return this.run(sql, () => (this.native.prepare(sql).get(...values) as T | undefined) ?? null); }
  async getAllAsync<T>(sql: string, ...values: Array<string | number | null>): Promise<T[]> { return this.run(sql, () => this.native.prepare(sql).all(...values) as T[]); }
  async withTransactionAsync(task: () => Promise<void>) {
    await this.execAsync('BEGIN IMMEDIATE');
    try { await task(); await this.execAsync('COMMIT'); }
    catch (error) { await this.execAsync('ROLLBACK'); throw error; }
  }
  async closeAsync() { this.closed = true; }
  get writes() { return this.statements.filter((sql) => !/^\s*(SELECT|PRAGMA (key|cipher_version|user_version;))/i.test(sql)); }
}

describe('initializeAthleteDatabase', () => {
  let directory: string;
  let disk: DiskState;
  const natives: DatabaseSync[] = [];

  function open(cipherAvailable = true) {
    const native = new DatabaseSync(path.join(directory, 'athlete3.db'));
    natives.push(native);
    return new FakeSqlCipherDatabase(native, disk, cipherAvailable);
  }
  const init = (db: FakeSqlCipherDatabase) => initializeAthleteDatabase(db as unknown as SQLiteDatabase);
  const ownerOf = (db: FakeSqlCipherDatabase) => getLocalOwnerKey(db as unknown as SQLiteDatabase);
  async function expectCode(promise: Promise<unknown>, code: string, recoverable: boolean) {
    const error = await promise.then(() => null, (reason: unknown) => reason);
    expect(error).toBeInstanceOf(LocalDatabaseError);
    expect(error).toMatchObject({ code, recoverable });
  }

  beforeEach(() => {
    directory = mkdtempSync(path.join(tmpdir(), 'athlete-db-init-'));
    disk = { fileKey: null };
    mockKeychain.clear();
    mockKeychainFailure = null;
    mockKeychainWriteFailure = null;
  });
  afterEach(() => {
    natives.splice(0).forEach((native) => native.close());
    rmSync(directory, { recursive: true, force: true });
  });

  test('first install: stores a new key before the first write and encrypts the new database with it', async () => {
    let fileKeyWhenStored: string | null | undefined;
    (SecureStore.setItemAsync as jest.Mock).mockImplementationOnce(async (name: string, value: string) => { fileKeyWhenStored = disk.fileKey; mockKeychain.set(name, value); });
    const db = open();
    await init(db);

    const storedKey = mockKeychain.get(DATABASE_KEY_NAME);
    expect(storedKey).toMatch(/^[0-9a-f]{64}$/);
    expect(fileKeyWhenStored).toBeNull();
    expect(disk.fileKey).toBe(storedKey);
    expect(await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version;')).toEqual({ user_version: 1 });

    const owner = await ownerOf(db);
    expect(owner).toMatch(/^device:[0-9a-f-]{36}$/);
    expect(mockKeychain.get(LOCAL_OWNER_NAME)).toBe(owner);
  });

  test('existing key: reopens the encrypted database without replacing the key or the data', async () => {
    const first = open();
    await init(first);
    const owner = await ownerOf(first);
    await first.runAsync("INSERT INTO routines (id, owner_key, name, created_at, updated_at) VALUES ('r1', ?, 'Torso', 'now', 'now')", owner);
    const key = mockKeychain.get(DATABASE_KEY_NAME);
    (SecureStore.setItemAsync as jest.Mock).mockClear();

    const second = open();
    await init(second);

    expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
    expect(mockKeychain.get(DATABASE_KEY_NAME)).toBe(key);
    expect(disk.fileKey).toBe(key);
    expect(await ownerOf(second)).toBe(owner);
    expect(await second.getAllAsync('SELECT id FROM routines')).toEqual([{ id: 'r1' }]);
  });

  test('SecureStore unavailable (e.g. missing mockKeychain entitlement): recoverable error, no key generated, no SQL run', async () => {
    mockKeychainFailure = new Error("Calling the 'getValueWithKeyAsync' function has failed → A required entitlement is not present.");
    const db = open();

    await expectCode(init(db), 'secure-store-unavailable', true);
    expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
    expect(db.statements).toEqual([]);
    expect(db.closed).toBe(true);
    expect(disk.fileKey).toBeNull();
  });

  test('SecureStore write fails on first install: nothing is written to the database', async () => {
    mockKeychainWriteFailure = new Error('errSecInteractionNotAllowed');
    const db = open();

    await expectCode(init(db), 'secure-store-unavailable', true);
    expect(db.writes).toEqual([]);
    expect(disk.fileKey).toBeNull();
    expect(mockKeychain.size).toBe(0);
  });

  test('encrypted database whose key is missing: refuses to generate a new key and leaves the file untouched', async () => {
    disk.fileKey = KEY_A;
    const db = open();

    await expectCode(init(db), 'database-key-missing', false);
    expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
    expect(mockKeychain.has(DATABASE_KEY_NAME)).toBe(false);
    expect(disk.fileKey).toBe(KEY_A);
    expect(db.writes).toEqual([]);
    expect(db.closed).toBe(true);
  });

  test('encrypted database that the stored key cannot open: no migration, no write, key preserved', async () => {
    disk.fileKey = KEY_A;
    mockKeychain.set(DATABASE_KEY_NAME, KEY_B);
    const db = open();

    await expectCode(init(db), 'database-unreadable', false);
    expect(mockKeychain.get(DATABASE_KEY_NAME)).toBe(KEY_B);
    expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
    expect(disk.fileKey).toBe(KEY_A);
    expect(db.statements.some((sql) => sql.includes('user_version'))).toBe(false);
    expect(db.writes).toEqual([]);
  });

  test('malformed stored key is reported and never overwritten', async () => {
    mockKeychain.set(DATABASE_KEY_NAME, 'not-a-key');
    const db = open();

    await expectCode(init(db), 'secret-invalid', false);
    expect(mockKeychain.get(DATABASE_KEY_NAME)).toBe('not-a-key');
    expect(db.statements).toEqual([]);
  });

  test('a key written concurrently by another instance is not overwritten', async () => {
    const getItem = SecureStore.getItemAsync as jest.Mock;
    getItem.mockImplementationOnce(async () => null).mockImplementationOnce(async () => KEY_B);
    const db = open();

    await expectCode(init(db), 'secret-conflict', true);
    expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
    expect(db.writes).toEqual([]);
  });

  test('refuses to open without SQLCipher instead of storing data in plaintext', async () => {
    const db = open(false);

    await expectCode(init(db), 'sqlcipher-unavailable', false);
    expect(mockKeychain.size).toBe(0);
    expect(db.writes).toEqual([]);
  });

  test('local owner lost from SecureStore is restored from the database instead of orphaning its data', async () => {
    const db = open();
    await init(db);
    const owner = await ownerOf(db);
    await db.runAsync("INSERT INTO routines (id, owner_key, name, created_at, updated_at) VALUES ('r1', ?, 'Torso', 'now', 'now')", owner);
    mockKeychain.delete(LOCAL_OWNER_NAME);

    expect(await ownerOf(db)).toBe(owner);
    expect(mockKeychain.get(LOCAL_OWNER_NAME)).toBe(owner);
  });

  test('local owner lost with data from several owners: explicit error, nothing stored', async () => {
    const db = open();
    await init(db);
    await db.runAsync("INSERT INTO routines (id, owner_key, name, created_at, updated_at) VALUES ('r1', 'device:one', 'A', 'now', 'now'), ('r2', 'device:two', 'B', 'now', 'now')");

    await expectCode(ownerOf(db), 'local-owner-ambiguous', false);
    expect(mockKeychain.has(LOCAL_OWNER_NAME)).toBe(false);
  });

  test('local owner read fails: explicit recoverable error instead of a new identity', async () => {
    const db = open();
    await init(db);
    mockKeychainFailure = new Error('A required entitlement is not present.');

    await expectCode(ownerOf(db), 'secure-store-unavailable', true);
  });
});
