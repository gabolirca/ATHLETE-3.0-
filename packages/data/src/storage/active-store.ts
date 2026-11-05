import type { SecureKeyValueStorage } from '@athlete/contracts';
import { IDENTITY_KEY, LEGACY_OWNER_KEY, readIdentity, replaceIdentity, type DeviceIdentity } from '../identity';
import { createUuidV7Generator, systemClock } from '../ids';
import type { ImportErrorCode, LegacyImportReport } from '../legacy/codex-v1';
import { LegacyImportError } from '../legacy/codex-v1';
import { LEGACY_DATABASE_KEY_NAME, openAthleteData, openLegacyDatabaseCopy, type OpenAthleteDataOptions, type OpenedAthleteData } from '../open';
import {
  databaseKeyName, isLocalDatabaseError, LocalDatabaseError, readSecret, replaceSecret, storeNewSecret, type LocalDatabaseErrorCode,
} from '../secure/encrypted-database';
import { localDatabaseName, localDatabasePrefix, type ExpoSQLiteDatabaseLike } from '../sql/expo-sqlite';
import type { SqlDatabase } from '../sql/types';

/**
 * Selección del almacenamiento activo: la capa anterior de la app (`athlete3.db`, "legacy") o el almacén oficial
 * (`openAthleteData`, `athlete3-<localUserId>.db`).
 *
 * Reglas (ver `docs/architecture/seleccion-almacen.md`):
 *  - Antes de elegir se inspecciona cada almacén (archivos, claves, identidad, marcador). Nada se abre para escribir
 *    hasta que la clasificación lo permite.
 *  - Una base existente nunca se trata como instalación nueva: si hay archivos sin su identidad o sin su clave, o un
 *    marcador que apunta a un archivo que ya no está, se detiene con `open-error` y una recuperación explícita.
 *  - La base legacy nunca se abre, escribe, sobrescribe ni borra desde aquí: solo se lee su archivo para copiarlo.
 *  - Exclusión de escrituras: el marcador `athlete3.active-store.v1` es la única fuente de verdad y avanza de forma
 *    monótona `legacy → migrating → official` con comparar-y-escribir. Desde `migrating` la base legacy queda
 *    congelada (no se devuelve como activa), y desde `official` no hay vuelta atrás. Las operaciones de este módulo
 *    se serializan en el proceso.
 *  - Ninguna recuperación borra archivos ni claves: `startNewStore` crea una base nueva con otro nombre y deja las
 *    anteriores registradas en `retained`.
 */

export const ACTIVE_STORE_KEY = 'athlete3.active-store.v1';
/** Archivo de la capa anterior (`SQLiteProvider databaseName="athlete3.db"`). */
export const LEGACY_DATABASE_NAME = 'athlete3.db';
/** Archivos que forman una base SQLite (el principal y los auxiliares de diario). */
export const DATABASE_FILE_SUFFIXES = ['', '-wal', '-shm', '-journal'] as const;

/**
 * Puerto de archivos. La app lo implementa con `expo-file-system` sobre `SQLite.defaultDatabaseDirectory`
 * (Android: `files/SQLite`; iOS: `Documents/SQLite`) y un directorio de respaldos propio.
 * Ninguna operación abre una base con SQLite ni modifica el directorio de bases.
 */
export interface DatabaseFiles {
  /** Nombres de archivo del directorio de bases. Si el directorio no existe → []. */
  listDatabases(): Promise<string[]>;
  /** SHA-256 hexadecimal del archivo del directorio de bases; null si no existe. */
  hashDatabaseFile(name: string): Promise<string | null>;
  /** Copia byte a byte `name` del directorio de bases a `<respaldos>/<backupDir>/<name>`. Debe fallar si el destino existe. */
  copyToBackup(name: string, backupDir: string): Promise<void>;
  /** SHA-256 del archivo copiado; null si no existe. */
  hashBackupFile(backupDir: string, name: string): Promise<string | null>;
}

// ---------------------------------------------------------------------------------------------------------------
// Marcador
// ---------------------------------------------------------------------------------------------------------------

/** Base que dejó de usarse en una recuperación. Se conserva intacta (archivo y clave) para un posible rescate. */
export type RetainedStore = { file: string; keyName: string; reason: string; at: string };

export type ActiveStoreMarker =
  | { v: 1; store: 'legacy'; at: string }
  | { v: 1; store: 'migrating'; at: string; backupDir: string; legacyHashes: Record<string, string> | null }
  | { v: 1; store: 'official'; at: string; migratedFrom: { backupDir: string; fingerprint: string } | null; retained: RetainedStore[] };

const NAME = /^[A-Za-z0-9._-]+$/;
const HEX64 = /^[0-9a-f]{64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function decodeMarker(raw: string): ActiveStoreMarker {
  let p: Record<string, unknown> | null = null;
  try {
    p = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    p = null;
  }
  const isName = (v: unknown) => typeof v === 'string' && NAME.test(v);
  const hashes = (v: unknown) => v === null || (typeof v === 'object' && v !== null && Object.entries(v).every(([k, h]) => NAME.test(k) && typeof h === 'string' && HEX64.test(h)));
  const retained = (v: unknown) => Array.isArray(v) && v.every((r: Record<string, unknown>) => isName(r?.file) && typeof r?.keyName === 'string' && typeof r?.reason === 'string' && typeof r?.at === 'string');
  const from = p?.migratedFrom as Record<string, unknown> | null | undefined;
  const valid = p !== null && p.v === 1 && typeof p.at === 'string' && (
    p.store === 'legacy'
    || (p.store === 'migrating' && isName(p.backupDir) && hashes(p.legacyHashes))
    || (p.store === 'official' && (from === null || (isName(from?.backupDir) && typeof from?.fingerprint === 'string')) && retained(p.retained)));
  if (!valid) throw new LocalDatabaseError('secret-invalid', 'El marcador del almacén activo tiene un formato inválido; no se reemplazó.');
  return p as unknown as ActiveStoreMarker;
}

/** Comparar-y-escribir del marcador sobre su valor crudo. Nunca sobrescribe un valor que no sea el esperado. */
async function writeMarker(secure: SecureKeyValueStorage, expectedRaw: string | null, next: ActiveStoreMarker): Promise<string> {
  const value = JSON.stringify(next);
  if (expectedRaw === null) await storeNewSecret(secure, ACTIVE_STORE_KEY, value);
  else await replaceSecret(secure, ACTIVE_STORE_KEY, expectedRaw, value);
  return value;
}

// ---------------------------------------------------------------------------------------------------------------
// Inspección y clasificación
// ---------------------------------------------------------------------------------------------------------------

export type KeyState = 'present' | 'absent' | 'invalid';

export type StorageProbe = {
  marker: ActiveStoreMarker | null;
  identity: DeviceIdentity | null;
  legacy: { file: boolean; key: KeyState; ownerUuid: string | null };
  /** Base oficial esperada: la de la identidad (o la que crearía `openAthleteData` a partir del dueño heredado). */
  official: { file: string | null; exists: boolean; key: KeyState };
  /** Bases oficiales del ambiente que no corresponden a la identidad ni están en `retained`. */
  orphans: string[];
};

type Raw = { marker: string | null; identity: string | null };

const keyState = (v: string | null): KeyState => (v === null ? 'absent' : HEX64.test(v) ? 'present' : 'invalid');
const present = (files: ReadonlySet<string>, name: string) => files.has(name) || files.has(`${name}-wal`);

async function probe(secure: SecureKeyValueStorage, files: DatabaseFiles, env: OpenAthleteDataOptions['env']): Promise<{ probe: StorageProbe; raw: Raw }> {
  // Lecturas crudas primero: `secure-store-unavailable` se propaga sin haber decidido nada.
  const raw: Raw = { marker: await readSecret(secure, ACTIVE_STORE_KEY), identity: await readSecret(secure, IDENTITY_KEY) };
  const legacyKey = await readSecret(secure, LEGACY_DATABASE_KEY_NAME);
  const legacyOwner = await readSecret(secure, LEGACY_OWNER_KEY);
  const marker = raw.marker === null ? null : decodeMarker(raw.marker);
  const identity = await readIdentity(secure); // valida el formato (secret-invalid)
  const list = new Set(await files.listDatabases());

  const ownerUuid = legacyOwner?.startsWith('device:') && UUID.test(legacyOwner.slice(7).toLowerCase()) ? legacyOwner.slice(7).toLowerCase() : null;
  const localUserId = identity?.localUserId ?? ownerUuid;
  const officialFile = localUserId ? localDatabaseName(localUserId, env) : null;
  const officialKey = officialFile ? keyState(await readSecret(secure, databaseKeyName(officialFile))) : 'absent';

  const retained = new Set(marker?.store === 'official' ? marker.retained.map((r) => r.file) : []);
  const pattern = new RegExp(`^${localDatabasePrefix(env).replace(/[.-]/g, '\\$&')}-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\.db$`);
  const orphans = [...new Set([...list].map((n) => n.replace(/-(wal|shm|journal)$/, '')))]
    .filter((n) => pattern.test(n) && n !== officialFile && !retained.has(n)).sort();

  return {
    raw,
    probe: {
      marker,
      identity,
      legacy: { file: present(list, LEGACY_DATABASE_NAME), key: keyState(legacyKey), ownerUuid },
      official: { file: officialFile, exists: officialFile !== null && present(list, officialFile), key: officialKey },
      orphans,
    },
  };
}

export type StoreErrorCode =
  | LocalDatabaseErrorCode
  /** El marcador dice `legacy` pero `athlete3.db` ya no está. */
  | 'legacy-missing'
  /** El marcador dice `official` pero la base oficial ya no está. */
  | 'official-missing'
  /** Hay base legacy y bases oficiales sin marcador: no se puede saber cuál es la vigente. */
  | 'store-ambiguous'
  /** Falta `athlete3.local-owner.v1`: no se sabe qué filas legacy son de este dispositivo. */
  | 'legacy-owner-missing'
  /** La base legacy tiene datos de otro dueño y ninguno de este dispositivo. */
  | 'legacy-owner-mismatch'
  /** La base legacy cambió mientras estaba congelada por la migración. */
  | 'legacy-changed-during-migration'
  /** El archivo legacy cambió durante la copia. */
  | 'legacy-copy-unstable'
  /** Ya existe en el respaldo un archivo distinto con el mismo nombre. No se sobrescribió. */
  | 'backup-conflict'
  /** La importación ya se confirmó: no se puede volver a legacy, solo terminar la migración. */
  | 'import-committed'
  /** No se pudo comprobar si la importación se confirmó. */
  | 'import-state-unknown'
  /** La operación no corresponde al estado actual. */
  | 'not-allowed'
  /** Error inesperado al abrir. */
  | 'open-failed'
  | ImportErrorCode;

/**
 * Acciones de recuperación que la UI puede ofrecer. Ninguna borra datos; todas requieren una decisión explícita
 * del usuario salvo `retry`.
 */
export type RecoveryAction =
  /** Reintentar más tarde (almacén seguro bloqueado, conflicto transitorio). */
  | 'retry'
  /** Continuar la migración interrumpida (`migrateLegacyStore`). */
  | 'resume-migration'
  /** Volver a la base legacy si la importación no se confirmó (`rollbackMigration`). */
  | 'rollback-to-legacy'
  /** Ante `store-ambiguous`: seguir con la base legacy; las oficiales quedan intactas (`keepLegacyStore`). */
  | 'keep-legacy'
  /** Empezar con una base nueva vacía conservando intactas las anteriores (`startNewStore`). Con cuenta, se restaura por sync. */
  | 'start-new-store';

export type StoreSelection =
  | { state: 'fresh-install'; active: 'official' | 'legacy' }
  | { state: 'legacy-existing'; active: 'legacy'; migratable: boolean; officialFilePresent: boolean }
  | { state: 'official-existing'; active: 'official'; legacy: 'absent' | 'retained-read-only' }
  | { state: 'migration-pending'; active: null; backupDir: string; recovery: RecoveryAction[] }
  | {
    state: 'open-error'; active: null; store: 'legacy' | 'official' | 'unknown'; code: StoreErrorCode; message: string;
    recovery: RecoveryAction[];
    /** Hay una cuenta vinculada: tras `start-new-store`, la sync restaura lo que se haya enviado al servidor. */
    accountLinked: boolean;
  };

export type OpenErrorSelection = Extract<StoreSelection, { state: 'open-error' }>;

const NEW_STORE: RecoveryAction[] = ['start-new-store'];

function recoveryFor(code: StoreErrorCode): RecoveryAction[] {
  switch (code) {
    case 'secure-store-unavailable':
    case 'secret-conflict':
    case 'open-failed':
      return ['retry'];
    case 'sqlcipher-unavailable':
      return []; // compilación incorrecta: nunca se abre ni crea nada sin cifrado
    default:
      return NEW_STORE;
  }
}

function openError(store: OpenErrorSelection['store'], code: StoreErrorCode, message: string, accountLinked: boolean, recovery = recoveryFor(code)): OpenErrorSelection {
  return { state: 'open-error', active: null, store, code, message, recovery, accountLinked };
}

/** Clasificación pura del estado inspeccionado. Ver la tabla de decisión en la documentación. */
export function classifyStorage(p: StorageProbe, policy: { newInstallations?: 'official' | 'legacy' } = {}): StoreSelection {
  const linked = p.identity?.accountUserId != null;
  const m = p.marker;

  const legacySelection = (): StoreSelection => {
    if (p.legacy.key === 'absent') return openError('legacy', 'database-key-missing', 'Existe la base anterior pero no su clave. No se generó otra ni se modificó nada.', linked);
    if (p.legacy.key === 'invalid') return openError('legacy', 'secret-invalid', 'La clave de la base anterior tiene un formato inválido. No se reemplazó.', linked);
    return { state: 'legacy-existing', active: 'legacy', migratable: p.legacy.ownerUuid !== null, officialFilePresent: p.official.exists };
  };
  const officialSelection = (): StoreSelection => {
    if (!p.identity) return openError('official', 'identity-missing', 'Hay una base oficial pero falta la identidad del dispositivo. No se creó otra.', false);
    if (!p.official.exists && p.orphans.length > 0) return openError('official', 'identity-missing', 'Hay bases oficiales que no corresponden a la identidad del dispositivo. No se creó otra.', linked);
    if (!p.official.exists) return openError('official', 'official-missing', 'La base oficial registrada ya no está en el dispositivo.', linked);
    if (p.official.key === 'absent') return openError('official', 'database-key-missing', 'Existe la base oficial pero no su clave. No se generó otra ni se modificó nada.', linked);
    if (p.official.key === 'invalid') return openError('official', 'secret-invalid', 'La clave de la base oficial tiene un formato inválido. No se reemplazó.', linked);
    return { state: 'official-existing', active: 'official', legacy: p.legacy.file ? 'retained-read-only' : 'absent' };
  };

  if (m?.store === 'migrating') {
    return { state: 'migration-pending', active: null, backupDir: m.backupDir, recovery: ['resume-migration', 'rollback-to-legacy', 'start-new-store'] };
  }
  if (m?.store === 'official') return officialSelection();
  if (m?.store === 'legacy') {
    return p.legacy.file ? legacySelection() : openError('legacy', 'legacy-missing', 'La base anterior registrada ya no está en el dispositivo.', linked);
  }

  // Sin marcador: primera vez con el selector.
  const officialFiles = p.official.exists || p.orphans.length > 0;
  if (p.legacy.file && officialFiles) {
    return openError('unknown', 'store-ambiguous', 'Hay datos en la base anterior y en la oficial; elige explícitamente antes de continuar.', linked, ['keep-legacy']);
  }
  if (p.legacy.file) return legacySelection();
  if (officialFiles) return officialSelection();
  return { state: 'fresh-install', active: policy.newInstallations ?? 'official' };
}

// ---------------------------------------------------------------------------------------------------------------
// Errores y exclusión en el proceso
// ---------------------------------------------------------------------------------------------------------------

export class ActiveStoreError extends Error {
  constructor(readonly code: StoreErrorCode, message: string, readonly recovery: RecoveryAction[] = recoveryFor(code), options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'ActiveStoreError';
  }
}

let queue: Promise<unknown> = Promise.resolve();
/** Serializa selección, migración y recuperación en el proceso: nunca dos a la vez sobre los mismos archivos. */
function exclusive<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(fn, fn);
  queue = run.catch(() => undefined);
  return run;
}

function selectionFromError(error: unknown, store: OpenErrorSelection['store'], linked: boolean): OpenErrorSelection {
  if (error instanceof ActiveStoreError) return openError(store, error.code, error.message, linked, error.recovery);
  if (isLocalDatabaseError(error)) return openError(store, error.code, error.message, linked);
  if (error instanceof LegacyImportError) return openError(store, error.code, error.message, linked, ['rollback-to-legacy', 'start-new-store']);
  return openError(store, 'open-failed', error instanceof Error ? error.message : String(error), linked);
}

// ---------------------------------------------------------------------------------------------------------------
// API pública
// ---------------------------------------------------------------------------------------------------------------

export type OpenActiveStoreOptions = OpenAthleteDataOptions & {
  files: DatabaseFiles;
  /** Almacén para instalaciones nuevas durante la transición. Por defecto `'official'`. */
  newInstallations?: 'official' | 'legacy';
};

export type ActiveStore =
  /** Usar los servicios oficiales. */
  | { kind: 'official'; selection: StoreSelection; data: OpenedAthleteData }
  /** Montar la capa anterior (`SQLiteProvider` + `athlete3.db`). Ningún almacén oficial quedó abierto. */
  | { kind: 'legacy'; selection: StoreSelection }
  /** No montar ningún almacén: mostrar `selection.recovery`. */
  | { kind: 'blocked'; selection: Extract<StoreSelection, { state: 'migration-pending' | 'open-error' }> };

/** Inspecciona sin abrir ninguna base ni escribir nada. */
export function inspectStorage(options: OpenActiveStoreOptions): Promise<StoreSelection> {
  return exclusive(async () => {
    try {
      return classifyStorage((await probe(options.secureStore, options.files, options.env)).probe, options);
    } catch (error) {
      return selectionFromError(error, 'unknown', false);
    }
  });
}

/**
 * Punto de entrada de la app: decide el almacén y, si es el oficial, lo abre. Nunca ejecuta la migración (ver
 * `migrateLegacyStore`) y nunca abre la base legacy.
 */
export function openActiveStore(options: OpenActiveStoreOptions): Promise<ActiveStore> {
  return exclusive(async () => {
    let state: Awaited<ReturnType<typeof probe>>;
    try {
      state = await probe(options.secureStore, options.files, options.env);
    } catch (error) {
      return { kind: 'blocked', selection: selectionFromError(error, 'unknown', false) };
    }
    const { probe: p, raw } = state;
    const selection = classifyStorage(p, options);
    const linked = p.identity?.accountUserId != null;
    if (selection.state === 'migration-pending' || selection.state === 'open-error') return { kind: 'blocked', selection };

    if (selection.active === 'legacy') {
      if (selection.state === 'legacy-existing' && p.marker === null) {
        try {
          await writeMarker(options.secureStore, raw.marker, { v: 1, store: 'legacy', at: (options.clock ?? systemClock).now() });
        } catch (error) {
          return { kind: 'blocked', selection: selectionFromError(error, 'legacy', linked) };
        }
      }
      return { kind: 'legacy', selection };
    }

    let data: OpenedAthleteData;
    try {
      data = await openAthleteData({ ...options, expect: selection.state === 'official-existing' ? 'existing' : 'create-if-missing' });
    } catch (error) {
      return { kind: 'blocked', selection: selectionFromError(error, 'official', linked) };
    }
    if (p.marker === null) {
      // El marcador se escribe después de crear la base: si la app se cierra antes, la próxima vez se ve
      // "base oficial sin marcador" (official-existing), nunca "marcador sin base".
      try {
        await writeMarker(options.secureStore, raw.marker, { v: 1, store: 'official', at: (options.clock ?? systemClock).now(), migratedFrom: null, retained: [] });
      } catch (error) {
        await data.close().catch(() => undefined);
        return { kind: 'blocked', selection: selectionFromError(error, 'official', linked) };
      }
    }
    return { kind: 'official', selection, data };
  });
}

export type MigrateLegacyStoreOptions = OpenActiveStoreOptions & {
  /** Abre un archivo del directorio de respaldo: `(name, dir) => SQLite.openDatabaseAsync(name, {}, <respaldos>/dir)`. */
  openBackupDatabase: (name: string, backupDir: string) => Promise<ExpoSQLiteDatabaseLike>;
  deviceTimeZone: string;
  sha256: (text: string) => Promise<string>;
};

export type MigrationResult = { data: OpenedAthleteData; report: LegacyImportReport; alreadyImported: boolean; backupDir: string };

/**
 * Migra la base legacy al almacén oficial, o reanuda una migración interrumpida.
 *
 *  1. Marcador `legacy → migrating` (desde aquí la base legacy queda congelada).
 *  2. Copia `athlete3.db` (+ `-wal`/`-shm`) al respaldo, verificando SHA-256 del origen antes/después y de la copia.
 *     Al reanudar, el origen debe seguir idéntico al registrado.
 *  3. Abre SOLO la copia, con la clave original, en solo lectura.
 *  4. Importa (transaccional, verificado e idempotente por huella) en el almacén oficial.
 *  5. Marcador `migrating → official`.
 *
 * Si falla, el marcador queda en `migrating` (`migration-pending`): se puede reanudar o volver a legacy.
 * Lanza `ActiveStoreError`. Nunca abre, escribe ni borra el original.
 */
export function migrateLegacyStore(options: MigrateLegacyStoreOptions): Promise<MigrationResult> {
  return exclusive(async () => {
    const clock = options.clock ?? systemClock;
    const { probe: p, raw } = await probe(options.secureStore, options.files, options.env);
    const selection = classifyStorage(p, options);

    let marker: Extract<ActiveStoreMarker, { store: 'migrating' }>;
    let markerRaw: string;
    if (selection.state === 'migration-pending' && p.marker?.store === 'migrating') {
      marker = p.marker;
      markerRaw = raw.marker as string;
    } else if (selection.state === 'legacy-existing') {
      if (!selection.migratable) throw new ActiveStoreError('legacy-owner-missing', 'Falta el dueño local de la base anterior; no se puede saber qué datos importar.', []);
      marker = { v: 1, store: 'migrating', at: clock.now(), backupDir: `legacy-${clock.now().replace(/[^0-9]/g, '').slice(0, 14)}`, legacyHashes: null };
      markerRaw = await writeMarker(options.secureStore, raw.marker, marker);
    } else {
      throw new ActiveStoreError('not-allowed', `No hay una base anterior que migrar (estado: ${selection.state}).`, []);
    }

    // 2. Copia verificada.
    try {
      const hashes = await backupLegacyFiles(options.files, marker.backupDir, marker.legacyHashes);
      if (marker.legacyHashes === null) {
        const next = { ...marker, legacyHashes: hashes };
        markerRaw = await writeMarker(options.secureStore, markerRaw, next);
        marker = next;
      }
    } catch (error) {
      throw asMigrationError(error);
    }

    // 3–4. Abrir la copia e importar.
    let copy: SqlDatabase;
    try {
      copy = await openLegacyDatabaseCopy({ name: LEGACY_DATABASE_NAME, open: (name) => options.openBackupDatabase(name, marker.backupDir), secureStore: options.secureStore });
    } catch (error) {
      throw asMigrationError(error);
    }
    let data: OpenedAthleteData | null = null;
    try {
      await assertLegacyOwner(copy, p.identity?.localUserId ?? p.legacy.ownerUuid);
      data = await openAthleteData({ ...options, expect: 'create-if-missing' });
      const { report, alreadyImported } = await data.importLegacyStore(copy, { deviceTimeZone: options.deviceTimeZone, sha256: options.sha256 });
      // 5. Cambio de almacén activo.
      await writeMarker(options.secureStore, markerRaw, { v: 1, store: 'official', at: clock.now(), migratedFrom: { backupDir: marker.backupDir, fingerprint: report.fingerprint }, retained: [] });
      return { data, report, alreadyImported, backupDir: marker.backupDir };
    } catch (error) {
      await data?.close().catch(() => undefined);
      throw asMigrationError(error);
    } finally {
      await copy.close().catch(() => undefined);
    }
  });
}

function asMigrationError(error: unknown): ActiveStoreError {
  if (error instanceof ActiveStoreError) return error;
  const pending: RecoveryAction[] = ['resume-migration', 'rollback-to-legacy', 'start-new-store'];
  if (isLocalDatabaseError(error)) return new ActiveStoreError(error.code, error.message, error.recoverable ? pending : ['rollback-to-legacy', 'start-new-store'], { cause: error });
  if (error instanceof LegacyImportError) return new ActiveStoreError(error.code, error.message, ['rollback-to-legacy', 'start-new-store'], { cause: error });
  return new ActiveStoreError('open-failed', error instanceof Error ? error.message : String(error), pending, { cause: error });
}

/** Copia los archivos de la base legacy al respaldo y devuelve sus SHA-256. Nunca abre ni modifica el origen. */
async function backupLegacyFiles(files: DatabaseFiles, backupDir: string, expected: Record<string, string> | null): Promise<Record<string, string>> {
  const listed = new Set(await files.listDatabases());
  const names = DATABASE_FILE_SUFFIXES.map((s) => `${LEGACY_DATABASE_NAME}${s}`).filter((n) => listed.has(n));
  if (!names.includes(LEGACY_DATABASE_NAME)) throw new ActiveStoreError('legacy-missing', 'La base anterior ya no está en el dispositivo.', ['rollback-to-legacy', 'start-new-store']);
  if (expected && (names.length !== Object.keys(expected).length || names.some((n) => !(n in expected)))) {
    throw new ActiveStoreError('legacy-changed-during-migration', 'Los archivos de la base anterior cambiaron mientras estaba congelada.', ['rollback-to-legacy', 'start-new-store']);
  }
  const hashes: Record<string, string> = {};
  for (const name of names) {
    const before = await files.hashDatabaseFile(name);
    if (before === null) throw new ActiveStoreError('legacy-copy-unstable', `${name} desapareció durante la copia.`, ['resume-migration', 'rollback-to-legacy']);
    if (expected && expected[name] !== before) {
      throw new ActiveStoreError('legacy-changed-during-migration', `${name} cambió mientras la base anterior estaba congelada.`, ['rollback-to-legacy', 'start-new-store']);
    }
    const existing = await files.hashBackupFile(backupDir, name);
    if (existing === null) {
      await files.copyToBackup(name, backupDir);
    } else if (existing !== before) {
      throw new ActiveStoreError('backup-conflict', `${backupDir}/${name} ya existe con otro contenido; no se sobrescribió.`, ['rollback-to-legacy']);
    }
    const copied = await files.hashBackupFile(backupDir, name);
    const after = await files.hashDatabaseFile(name);
    if (copied !== before || after !== before) {
      throw new ActiveStoreError('legacy-copy-unstable', `${name} cambió durante la copia o la copia no coincide.`, ['resume-migration', 'rollback-to-legacy']);
    }
    hashes[name] = before;
  }
  return hashes;
}

/** La copia debe contener datos de este dispositivo si contiene datos de alguien: si no, se importaría "nada". */
async function assertLegacyOwner(copy: SqlDatabase, localUserId: string | null): Promise<void> {
  if (!localUserId) throw new ActiveStoreError('legacy-owner-missing', 'Falta el dueño local de la base anterior.', ['rollback-to-legacy']);
  let owners: Array<{ owner_key: string }>;
  try {
    owners = await copy.all<{ owner_key: string }>(
      `SELECT DISTINCT owner_key FROM (SELECT owner_key FROM routines UNION ALL SELECT owner_key FROM workout_sessions
       UNION ALL SELECT owner_key FROM body_measurements UNION ALL SELECT owner_key FROM athlete_local_preferences)`);
  } catch {
    return; // esquema no reconocido: el importador lo rechaza con `legacy-unsupported-version`
  }
  const mine = `device:${localUserId}`;
  if (owners.length > 0 && !owners.some((o) => o.owner_key.toLowerCase() === mine)) {
    throw new ActiveStoreError('legacy-owner-mismatch', 'La base anterior no tiene datos de este dispositivo; no se importó nada.', ['rollback-to-legacy']);
  }
}

/**
 * Vuelve a la base legacy tras una migración interrumpida, solo si la importación no se confirmó en el almacén
 * oficial (si se confirmó, lo correcto es reanudar: volver dejaría de mostrar lo ya importado y duplicaría escrituras).
 */
export function rollbackMigration(options: OpenActiveStoreOptions): Promise<StoreSelection> {
  return exclusive(async () => {
    const { probe: p, raw } = await probe(options.secureStore, options.files, options.env);
    const m = p.marker;
    if (m?.store !== 'migrating') throw new ActiveStoreError('not-allowed', 'No hay una migración pendiente.', []);
    if (!p.legacy.file) throw new ActiveStoreError('legacy-missing', 'La base anterior ya no está en el dispositivo.', ['resume-migration', 'start-new-store']);
    if (p.official.exists) {
      let report: LegacyImportReport | null;
      try {
        const data = await openAthleteData({ ...options, expect: 'existing' });
        try { report = await data.legacyImportReport(); } finally { await data.close(); }
      } catch (error) {
        throw new ActiveStoreError('import-state-unknown', 'No se pudo comprobar si la importación se confirmó; no se cambió nada.', ['retry', 'resume-migration'], { cause: error });
      }
      if (report && report.importedAt >= m.at) {
        throw new ActiveStoreError('import-committed', 'La importación ya se confirmó; hay que terminar la migración.', ['resume-migration']);
      }
    }
    await writeMarker(options.secureStore, raw.marker, { v: 1, store: 'legacy', at: (options.clock ?? systemClock).now() });
    return classifyStorage((await probe(options.secureStore, options.files, options.env)).probe, options);
  });
}

/** Ante `store-ambiguous`: el usuario elige seguir con la base legacy. Las bases oficiales no se tocan. */
export function keepLegacyStore(options: OpenActiveStoreOptions): Promise<StoreSelection> {
  return exclusive(async () => {
    const { probe: p, raw } = await probe(options.secureStore, options.files, options.env);
    const selection = classifyStorage(p, options);
    if (selection.state !== 'open-error' || selection.code !== 'store-ambiguous') throw new ActiveStoreError('not-allowed', 'Solo aplica cuando hay dos almacenes sin marcador.', []);
    await writeMarker(options.secureStore, raw.marker, { v: 1, store: 'legacy', at: (options.clock ?? systemClock).now() });
    return classifyStorage((await probe(options.secureStore, options.files, options.env)).probe, options);
  });
}

/** Códigos con los que la capa legacy (`apps/mobile/src/data/database.ts`) informa que no puede abrir su base. */
const LEGACY_UNREADABLE = new Set(['database-key-missing', 'database-unreadable', 'secret-invalid']);

/**
 * Recuperación explícita: empieza con una base oficial nueva y vacía. Requiere `confirm: 'start-new-store'`.
 *  - No borra ni renombra archivos y no elimina ni sobrescribe ninguna clave de base: la base nueva tiene otro
 *    nombre (nuevo `localUserId`) y, por tanto, otra clave.
 *  - Las bases que dejan de usarse se registran en `retained` del marcador.
 *  - Si había una cuenta vinculada se conserva: la sync restaurará lo que esté en el servidor.
 * Permitido en `open-error` con `start-new-store`, en `migration-pending`, o en `legacy-existing` si la capa legacy
 * informó que no puede abrir su base (`legacyFailureCode`).
 */
export function startNewStore(options: OpenActiveStoreOptions & { confirm: 'start-new-store'; legacyFailureCode?: string }): Promise<ActiveStore> {
  return exclusive(async () => {
    if (options.confirm !== 'start-new-store') throw new ActiveStoreError('not-allowed', 'Falta la confirmación explícita.', []);
    const secure = options.secureStore;
    const now = (options.clock ?? systemClock).now();
    const raw: Raw = { marker: await readSecret(secure, ACTIVE_STORE_KEY), identity: await readSecret(secure, IDENTITY_KEY) };

    let p: StorageProbe | null = null;
    let reason: string;
    try {
      p = (await probe(secure, options.files, options.env)).probe;
      const selection = classifyStorage(p, options);
      const allowed = (selection.state === 'open-error' && selection.recovery.includes('start-new-store'))
        || selection.state === 'migration-pending'
        || (selection.state === 'legacy-existing' && LEGACY_UNREADABLE.has(options.legacyFailureCode ?? ''));
      if (!allowed) throw new ActiveStoreError('not-allowed', `No corresponde empezar de nuevo en el estado ${selection.state}.`, []);
      reason = selection.state === 'open-error' ? selection.code : selection.state === 'legacy-existing' ? `legacy-${options.legacyFailureCode}` : selection.state;
    } catch (error) {
      if (!(isLocalDatabaseError(error) && error.code === 'secret-invalid')) throw error;
      reason = 'secret-invalid'; // marcador o identidad ilegibles: se reemplazan por comparar-y-escribir sobre el valor crudo
    }

    // Todo lo que exista se conserva y se registra.
    const files = new Set((await options.files.listDatabases()).map((n) => n.replace(/-(wal|shm|journal)$/, '')));
    const previous = p?.marker?.store === 'official' ? p.marker.retained : [];
    const known = new Set(previous.map((r) => r.file));
    const retained: RetainedStore[] = [...previous];
    const keep = (file: string, keyName: string) => { if (files.has(file) && !known.has(file)) { known.add(file); retained.push({ file, keyName, reason, at: now }); } };
    keep(LEGACY_DATABASE_NAME, LEGACY_DATABASE_KEY_NAME);
    if (p?.official.file) keep(p.official.file, databaseKeyName(p.official.file));
    const pattern = new RegExp(`^${localDatabasePrefix(options.env).replace(/[.-]/g, '\\$&')}-[0-9a-f-]{36}\\.db$`);
    for (const f of [...files].filter((n) => pattern.test(n)).sort()) keep(f, databaseKeyName(f));

    const ids = createUuidV7Generator(options.randomBytes);
    let localUserId = ids.newId().toLowerCase();
    while (files.has(localDatabaseName(localUserId, options.env))) localUserId = ids.newId().toLowerCase();
    const current = p?.identity ?? null;
    const next: DeviceIdentity = { localUserId, accountUserId: current?.accountUserId ?? null };
    // Identidad (comparar-y-escribir sobre el valor crudo) y después marcador. Si la app se cierra en medio, el
    // estado resultante vuelve a clasificarse como error con la misma recuperación: nunca se pierde nada.
    await replaceIdentity(secure, raw.identity, next);
    await writeMarker(secure, raw.marker, { v: 1, store: 'official', at: now, migratedFrom: null, retained });

    try {
      const data = await openAthleteData({ ...options, expect: 'create-if-missing' });
      return { kind: 'official', selection: { state: 'fresh-install', active: 'official' }, data } as ActiveStore;
    } catch (error) {
      return { kind: 'blocked', selection: selectionFromError(error, 'official', next.accountUserId !== null) };
    }
  });
}
