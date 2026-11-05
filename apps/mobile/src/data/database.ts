import { getRandomBytesAsync } from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import type { SQLiteDatabase } from 'expo-sqlite';
import { newId } from './ids';

// Do not pass SecureStore options (keychainService, accessGroup, ...) to these calls: the options are part
// of the keychain query, so changing them would hide the items stored by previous versions.
const DATABASE_KEY_NAME = 'athlete3.sqlite.sqlcipher-key.v1';
const LOCAL_OWNER_NAME = 'athlete3.local-owner.v1';
const DATABASE_KEY_PATTERN = /^[0-9a-f]{64}$/;
const LOCAL_OWNER_PATTERN = /^device:[0-9a-fA-F-]{36}$/;
const OWNER_SCOPED_TABLES = ['routines', 'workout_sessions', 'body_measurements', 'athlete_local_preferences', 'sync_outbox', 'sync_conflicts'] as const;

const STARTER_EXERCISES = [
  ['sample-bench-press', 'Press de banca', 'Pecho', 'Barra'],
  ['sample-back-squat', 'Sentadilla trasera', 'Pierna', 'Barra'],
  ['sample-rdl', 'Peso muerto rumano', 'Pierna', 'Barra'],
  ['sample-lat-pulldown', 'Jalón al pecho', 'Espalda', 'Polea'],
  ['sample-overhead-press', 'Press militar', 'Hombro', 'Barra'],
  ['sample-seated-row', 'Remo sentado', 'Espalda', 'Polea'],
] as const;

export type LocalDatabaseErrorCode =
  /** The keychain could not be read or written (device locked, missing entitlement, keychain error). */
  | 'secure-store-unavailable'
  /** The stored value does not have the expected format. It is left untouched. */
  | 'secret-invalid'
  /** A value appeared in SecureStore while a new one was being created. Nothing was overwritten. */
  | 'secret-conflict'
  /** The database file holds encrypted data but SecureStore has no key for it. No new key was created. */
  | 'database-key-missing'
  /** The stored key does not open the database (wrong key or damaged file). Nothing was migrated or written. */
  | 'database-unreadable'
  /** The native build does not include SQLCipher, so the data would not be encrypted. */
  | 'sqlcipher-unavailable'
  /** The database holds data from more than one local owner and SecureStore lost the current one. */
  | 'local-owner-ambiguous';

const RECOVERABLE_CODES: ReadonlySet<LocalDatabaseErrorCode> = new Set(['secure-store-unavailable', 'secret-conflict']);

/**
 * Explicit failure while opening local storage. `recoverable` means a later retry (device unlocked, correctly
 * signed build, concurrent writer finished) can succeed without losing data. Non-recoverable errors need a
 * human decision: the app must never delete or recreate the database on its own.
 */
export class LocalDatabaseError extends Error {
  readonly code: LocalDatabaseErrorCode;
  readonly recoverable: boolean;

  constructor(code: LocalDatabaseErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'LocalDatabaseError';
    this.code = code;
    this.recoverable = RECOVERABLE_CODES.has(code);
  }
}

export function isLocalDatabaseError(error: unknown): error is LocalDatabaseError {
  return error instanceof LocalDatabaseError;
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function readSecret(name: string): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(name);
  } catch (error) {
    throw new LocalDatabaseError('secure-store-unavailable', `No se pudo leer ${name} de SecureStore: ${messageOf(error)}`, { cause: error });
  }
}

/** Stores a value only while the slot is still empty, then reads it back. Never replaces an existing value. */
async function storeNewSecret(name: string, value: string): Promise<void> {
  if ((await readSecret(name)) !== null) {
    throw new LocalDatabaseError('secret-conflict', `${name} apareció en SecureStore durante la inicialización; no se sobrescribió.`);
  }
  try {
    await SecureStore.setItemAsync(name, value);
  } catch (error) {
    throw new LocalDatabaseError('secure-store-unavailable', `No se pudo guardar ${name} en SecureStore: ${messageOf(error)}`, { cause: error });
  }
  if ((await readSecret(name)) !== value) {
    throw new LocalDatabaseError('secret-conflict', `${name} no coincide con el valor recién guardado; no se usará.`);
  }
}

/** Returns null when the schema cannot be read with the applied key (SQLCipher: "file is not a database"). */
async function readSchemaObjectCount(db: SQLiteDatabase): Promise<number | null> {
  try {
    const row = await db.getFirstAsync<{ objects: number }>('SELECT count(*) AS objects FROM sqlite_master;');
    return row?.objects ?? 0;
  } catch {
    return null;
  }
}

async function assertSqlCipherAvailable(db: SQLiteDatabase): Promise<void> {
  const row = await db.getFirstAsync<{ cipher_version?: string }>('PRAGMA cipher_version;').catch(() => null);
  if (!row?.cipher_version) {
    throw new LocalDatabaseError('sqlcipher-unavailable', 'La compilación nativa no incluye SQLCipher; no se abrirá la base sin cifrado.');
  }
}

async function unlockDatabase(db: SQLiteDatabase): Promise<void> {
  const storedKey = await readSecret(DATABASE_KEY_NAME);
  if (storedKey !== null && !DATABASE_KEY_PATTERN.test(storedKey)) {
    throw new LocalDatabaseError('secret-invalid', 'La clave de la base guardada en SecureStore tiene un formato inválido; no se reemplazó.');
  }

  const encryptionKey = storedKey ?? toHex(await getRandomBytesAsync(32));
  // Must be the first SQL statement on the connection. The key itself remains in platform secure storage.
  await db.execAsync(`PRAGMA key = "x'${encryptionKey}'";`);
  await assertSqlCipherAvailable(db);

  const schemaObjects = await readSchemaObjectCount(db);
  if (storedKey !== null) {
    if (schemaObjects === null) {
      throw new LocalDatabaseError('database-unreadable', 'La clave guardada no abre la base local. No se ejecutaron migraciones ni se modificaron datos.');
    }
    return;
  }

  // No stored key. A fresh random key can only read an empty file, so a read failure or an existing schema
  // means a previous encrypted database whose key is gone: leave both the file and SecureStore untouched.
  if (schemaObjects !== 0) {
    throw new LocalDatabaseError('database-key-missing', 'Existe una base local cifrada pero SecureStore no tiene su clave. No se generó una clave nueva ni se modificaron datos.');
  }
  // First install: persist the key before the first write, so the file is never encrypted with a key we do not hold.
  await storeNewSecret(DATABASE_KEY_NAME, encryptionKey);
}

export async function initializeAthleteDatabase(db: SQLiteDatabase): Promise<void> {
  try {
    await unlockDatabase(db);
  } catch (error) {
    // SQLiteProvider drops a connection whose onInit failed without closing it; close it so a retry starts clean.
    await db.closeAsync().catch(() => undefined);
    throw error;
  }

  await db.execAsync('PRAGMA foreign_keys = ON;');
  await db.execAsync('PRAGMA journal_mode = WAL;');

  await initializeAthleteDatabaseSchema(db);
}

/**
 * Returns the device-scoped owner. `db` must be initialized. If SecureStore lost the owner while the database
 * still holds data, the single owner found there is restored instead of orphaning that data under a new id.
 */
export async function getLocalOwnerKey(db: SQLiteDatabase): Promise<string> {
  const storedOwner = await readSecret(LOCAL_OWNER_NAME);
  if (storedOwner !== null) {
    if (!LOCAL_OWNER_PATTERN.test(storedOwner)) {
      throw new LocalDatabaseError('secret-invalid', 'El identificador local guardado en SecureStore tiene un formato inválido; no se reemplazó.');
    }
    return storedOwner;
  }

  const union = OWNER_SCOPED_TABLES.map((table) => `SELECT owner_key FROM ${table}`).join(' UNION ');
  const owners = (await db.getAllAsync<{ owner_key: string }>(`${union};`)).map((row) => row.owner_key);
  if (owners.length > 1) {
    throw new LocalDatabaseError('local-owner-ambiguous', 'La base local tiene datos de varios propietarios y SecureStore no indica cuál es el actual.');
  }
  const ownerKey = owners[0] ?? `device:${newId()}`;
  await storeNewSecret(LOCAL_OWNER_NAME, ownerKey);
  return ownerKey;
}

export async function initializeAthleteDatabaseSchema(db: SQLiteDatabase): Promise<void> {
  const versionRow = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version;');
  if ((versionRow?.user_version ?? 0) < 1) {
    await db.withTransactionAsync(async () => {
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS exercises (
          id TEXT PRIMARY KEY NOT NULL,
          name TEXT NOT NULL,
          muscle_group TEXT NOT NULL,
          equipment TEXT,
          origin TEXT NOT NULL DEFAULT 'sample',
          created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS routines (
          id TEXT PRIMARY KEY NOT NULL,
          owner_key TEXT NOT NULL,
          name TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          local_version INTEGER NOT NULL DEFAULT 1,
          server_version INTEGER,
          sync_status TEXT NOT NULL DEFAULT 'pending',
          tombstoned_at TEXT
        );
        CREATE TABLE IF NOT EXISTS routine_exercises (
          id TEXT PRIMARY KEY NOT NULL,
          routine_id TEXT NOT NULL REFERENCES routines(id) ON DELETE CASCADE,
          exercise_id TEXT NOT NULL REFERENCES exercises(id),
          sort_order INTEGER NOT NULL,
          sets_target INTEGER NOT NULL,
          reps_target INTEGER NOT NULL,
          rest_seconds INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS workout_sessions (
          id TEXT PRIMARY KEY NOT NULL,
          owner_key TEXT NOT NULL,
          routine_id TEXT REFERENCES routines(id),
          state TEXT NOT NULL CHECK(state IN ('active','completed','deleted')),
          started_at TEXT NOT NULL,
          completed_at TEXT,
          updated_at TEXT NOT NULL,
          local_version INTEGER NOT NULL DEFAULT 1,
          server_version INTEGER,
          sync_status TEXT NOT NULL DEFAULT 'pending',
          tombstoned_at TEXT
        );
        CREATE TABLE IF NOT EXISTS session_exercises (
          id TEXT PRIMARY KEY NOT NULL,
          session_id TEXT NOT NULL REFERENCES workout_sessions(id) ON DELETE CASCADE,
          exercise_id TEXT NOT NULL REFERENCES exercises(id),
          sort_order INTEGER NOT NULL,
          sets_target INTEGER,
          reps_target INTEGER,
          rest_seconds INTEGER
        );
        CREATE TABLE IF NOT EXISTS workout_sets (
          id TEXT PRIMARY KEY NOT NULL,
          session_exercise_id TEXT NOT NULL REFERENCES session_exercises(id) ON DELETE CASCADE,
          set_index INTEGER NOT NULL,
          weight_kg REAL,
          reps INTEGER,
          rir INTEGER,
          is_warmup INTEGER NOT NULL DEFAULT 0,
          updated_at TEXT NOT NULL,
          UNIQUE(session_exercise_id, set_index),
          CHECK(weight_kg IS NULL OR weight_kg >= 0),
          CHECK(reps IS NULL OR reps BETWEEN 1 AND 200),
          CHECK(rir IS NULL OR rir BETWEEN 0 AND 10)
        );
        CREATE TABLE IF NOT EXISTS sync_outbox (
          id TEXT PRIMARY KEY NOT NULL,
          client_mutation_id TEXT NOT NULL UNIQUE,
          owner_key TEXT NOT NULL,
          aggregate_type TEXT NOT NULL,
          aggregate_id TEXT NOT NULL,
          operation TEXT NOT NULL,
          local_version INTEGER NOT NULL,
          base_server_version INTEGER,
          payload_json TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','syncing','failed','conflict','acked')),
          attempt_count INTEGER NOT NULL DEFAULT 0,
          last_error_code TEXT,
          created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS sync_conflicts (
          id TEXT PRIMARY KEY NOT NULL,
          owner_key TEXT NOT NULL,
          aggregate_type TEXT NOT NULL,
          aggregate_id TEXT NOT NULL,
          local_version INTEGER NOT NULL,
          server_version INTEGER,
          local_snapshot_json TEXT NOT NULL,
          remote_snapshot_json TEXT NOT NULL,
          detected_at TEXT NOT NULL,
          resolution TEXT
        );
        CREATE TABLE IF NOT EXISTS body_measurements (
          id TEXT PRIMARY KEY NOT NULL,
          owner_key TEXT NOT NULL,
          measurement_type TEXT NOT NULL,
          value REAL NOT NULL,
          unit TEXT NOT NULL,
          measured_at TEXT NOT NULL,
          local_version INTEGER NOT NULL DEFAULT 1,
          server_version INTEGER,
          sync_status TEXT NOT NULL DEFAULT 'pending',
          tombstoned_at TEXT
        );
        CREATE TABLE IF NOT EXISTS athlete_local_preferences (
          owner_key TEXT PRIMARY KEY NOT NULL,
          display_name TEXT NOT NULL DEFAULT '',
          unit_system TEXT NOT NULL DEFAULT 'metric',
          preferred_sport TEXT NOT NULL DEFAULT 'strength',
          timezone TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_sessions_owner_date ON workout_sessions(owner_key, started_at DESC);
        CREATE UNIQUE INDEX IF NOT EXISTS idx_one_active_workout_per_owner ON workout_sessions(owner_key) WHERE state = 'active' AND tombstoned_at IS NULL;
        CREATE INDEX IF NOT EXISTS idx_outbox_owner_status ON sync_outbox(owner_key, status, created_at);
        CREATE INDEX IF NOT EXISTS idx_session_exercises_session ON session_exercises(session_id, sort_order);
        CREATE INDEX IF NOT EXISTS idx_measurements_owner_date ON body_measurements(owner_key, measured_at DESC);
      `);
      await db.execAsync('PRAGMA user_version = 1;');
    });
  }

  // A process may have exited while a sync request was in flight. Retry those rows on next launch.
  await db.runAsync("UPDATE sync_outbox SET status = 'pending' WHERE status = 'syncing';");

  const now = new Date().toISOString();
  for (const [id, name, muscleGroup, equipment] of STARTER_EXERCISES) {
    await db.runAsync(
      'INSERT OR IGNORE INTO exercises (id, name, muscle_group, equipment, origin, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      id,
      name,
      muscleGroup,
      equipment,
      'sample',
      now,
    );
  }
}
