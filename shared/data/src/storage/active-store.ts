import type { SecureKeyValueStorage } from '@athlete/contracts';
import { IDENTITY_KEY, readIdentity, replaceIdentity, type DeviceIdentity } from '../identity';
import { createUuidV7Generator, systemClock } from '../ids';
import { openAthleteData, type OpenAthleteDataOptions, type OpenedAthleteData } from '../open';
import {
  databaseKeyName, isLocalDatabaseError, LocalDatabaseError, readSecret, replaceSecret, storeNewSecret, type LocalDatabaseErrorCode,
} from '../secure/encrypted-database';
import { localDatabaseName, localDatabasePrefix } from '../sql/expo-sqlite';

/**
 * Selección y apertura del almacén local oficial (`openAthleteData`, `athlete3-<localUserId>.db`).
 *
 * La capa anterior de la app (legacy, `athlete3.db`) se retiró el 5-nov-2026 sin migración (decisión del
 * propietario: no había usuarios publicados). Si ese archivo existe en un dispositivo de desarrollo, se ignora: este
 * módulo nunca lo abre, lo modifica ni lo borra.
 *
 * Reglas (ver `docs/architecture/seleccion-almacen.md`):
 *  - Antes de abrir se inspecciona el estado (archivos, clave, identidad, marcador). Nada se abre para escribir hasta
 *    que la clasificación lo permite.
 *  - Una base existente nunca se trata como instalación nueva: si hay archivos sin su identidad o sin su clave, o un
 *    marcador que apunta a una base que ya no está (p. ej. iOS conserva el llavero tras desinstalar pero no los
 *    archivos), se detiene con `open-error` y una recuperación explícita.
 *  - Ninguna recuperación borra archivos ni claves: `startNewStore` crea una base nueva con otro nombre y deja las
 *    anteriores registradas en `retained`.
 *  - Las operaciones de este módulo se serializan en el proceso.
 */

export const ACTIVE_STORE_KEY = 'athlete3.active-store.v1';

/**
 * Puerto de archivos. La app lo implementa con `expo-file-system` sobre `SQLite.defaultDatabaseDirectory`
 * (Android: `files/SQLite`; iOS: `Documents/SQLite`). Solo lista: nunca abre ni modifica el directorio de bases.
 */
export interface DatabaseFiles {
  /** Nombres de archivo del directorio de bases. Si el directorio no existe → []. */
  listDatabases(): Promise<string[]>;
}

// ---------------------------------------------------------------------------------------------------------------
// Marcador
// ---------------------------------------------------------------------------------------------------------------

/** Base que dejó de usarse en una recuperación. Se conserva intacta (archivo y clave) para un posible rescate. */
export type RetainedStore = { file: string; keyName: string; reason: string; at: string };

export type ActiveStoreMarker = { v: 1; store: 'official'; at: string; retained: RetainedStore[] };

const NAME = /^[A-Za-z0-9._-]+$/;
const HEX64 = /^[0-9a-f]{64}$/;

function decodeMarker(raw: string): ActiveStoreMarker {
  let p: Record<string, unknown> | null = null;
  try {
    p = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    p = null;
  }
  if (p !== null && p.v === 1 && (p.store === 'legacy' || p.store === 'migrating')) {
    throw new LocalDatabaseError('secret-invalid', 'El marcador pertenece a la capa anterior, que ya no existe. No se modificó nada.');
  }
  const isName = (v: unknown) => typeof v === 'string' && NAME.test(v);
  const retained = (v: unknown) => Array.isArray(v) && v.every((r: Record<string, unknown>) => isName(r?.file) && typeof r?.keyName === 'string' && typeof r?.reason === 'string' && typeof r?.at === 'string');
  const valid = p !== null && p.v === 1 && typeof p.at === 'string' && p.store === 'official' && retained(p.retained);
  if (!valid) throw new LocalDatabaseError('secret-invalid', 'El marcador del almacén activo tiene un formato inválido; no se reemplazó.');
  return { v: 1, store: 'official', at: p!.at as string, retained: p!.retained as RetainedStore[] };
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
  /** Base oficial esperada: la de la identidad. */
  official: { file: string | null; exists: boolean; key: KeyState };
  /** Bases oficiales del ambiente que no corresponden a la identidad ni están en `retained`. */
  orphans: string[];
};

type Raw = { marker: string | null; identity: string | null };

const keyState = (v: string | null): KeyState => (v === null ? 'absent' : HEX64.test(v) ? 'present' : 'invalid');
const present = (files: ReadonlySet<string>, name: string) => files.has(name) || files.has(`${name}-wal`);
const baseName = (n: string) => n.replace(/-(wal|shm|journal)$/, '');

function officialPattern(env: OpenAthleteDataOptions['env']): RegExp {
  return new RegExp(`^${localDatabasePrefix(env).replace(/[.-]/g, '\\$&')}-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\.db$`);
}

async function probe(secure: SecureKeyValueStorage, files: DatabaseFiles, env: OpenAthleteDataOptions['env']): Promise<{ probe: StorageProbe; raw: Raw }> {
  // Lecturas crudas primero: `secure-store-unavailable` se propaga sin haber decidido nada.
  const raw: Raw = { marker: await readSecret(secure, ACTIVE_STORE_KEY), identity: await readSecret(secure, IDENTITY_KEY) };
  const marker = raw.marker === null ? null : decodeMarker(raw.marker);
  const identity = await readIdentity(secure); // valida el formato (secret-invalid)
  const list = new Set(await files.listDatabases());

  const officialFile = identity ? localDatabaseName(identity.localUserId, env) : null;
  const officialKey = officialFile ? keyState(await readSecret(secure, databaseKeyName(officialFile))) : 'absent';

  const retained = new Set(marker?.retained.map((r) => r.file) ?? []);
  const pattern = officialPattern(env);
  const orphans = [...new Set([...list].map(baseName))]
    .filter((n) => pattern.test(n) && n !== officialFile && !retained.has(n)).sort();

  return {
    raw,
    probe: {
      marker,
      identity,
      official: { file: officialFile, exists: officialFile !== null && present(list, officialFile), key: officialKey },
      orphans,
    },
  };
}

export type StoreErrorCode =
  | LocalDatabaseErrorCode
  /** El marcador dice que hay base oficial pero ya no está (p. ej. iOS conservó el llavero, no los archivos). */
  | 'official-missing'
  /** La operación no corresponde al estado actual. */
  | 'not-allowed'
  /** Error inesperado al abrir. */
  | 'open-failed';

/**
 * Acciones de recuperación que la UI puede ofrecer. Ninguna borra datos; `start-new-store` requiere una decisión
 * explícita del usuario.
 */
export type RecoveryAction =
  /** Reintentar más tarde (almacén seguro bloqueado, conflicto transitorio). */
  | 'retry'
  /** Empezar con una base nueva vacía conservando intactas las anteriores (`startNewStore`). Con cuenta, se restaura por sync. */
  | 'start-new-store';

export type StoreSelection =
  | { state: 'fresh-install'; active: 'official' }
  | { state: 'official-existing'; active: 'official' }
  | {
    state: 'open-error'; active: null; store: 'official' | 'unknown'; code: StoreErrorCode; message: string;
    recovery: RecoveryAction[];
    /** Hay una cuenta vinculada: tras `start-new-store`, la sync restaura lo que se haya enviado al servidor. */
    accountLinked: boolean;
  };

export type OpenErrorSelection = Extract<StoreSelection, { state: 'open-error' }>;

function recoveryFor(code: StoreErrorCode): RecoveryAction[] {
  switch (code) {
    case 'secure-store-unavailable':
    case 'secret-conflict':
    case 'open-failed':
      return ['retry'];
    case 'sqlcipher-unavailable':
    case 'not-allowed':
      return []; // compilación incorrecta / estado no recuperable desde la UI: nunca se abre ni crea nada sin cifrado
    default:
      return ['start-new-store'];
  }
}

function openError(store: OpenErrorSelection['store'], code: StoreErrorCode, message: string, accountLinked: boolean, recovery = recoveryFor(code)): OpenErrorSelection {
  return { state: 'open-error', active: null, store, code, message, recovery, accountLinked };
}

/** Clasificación pura del estado inspeccionado. Ver la tabla de decisión en la documentación. */
export function classifyStorage(p: StorageProbe): StoreSelection {
  const linked = p.identity?.accountUserId != null;
  const officialSelection = (): StoreSelection => {
    if (!p.identity) return openError('official', 'identity-missing', 'Hay una base oficial pero falta la identidad del dispositivo. No se creó otra.', false);
    if (!p.official.exists && p.orphans.length > 0) return openError('official', 'identity-missing', 'Hay bases oficiales que no corresponden a la identidad del dispositivo. No se creó otra.', linked);
    if (!p.official.exists) return openError('official', 'official-missing', 'La base oficial registrada ya no está en el dispositivo.', linked);
    if (p.official.key === 'absent') return openError('official', 'database-key-missing', 'Existe la base oficial pero no su clave. No se generó otra ni se modificó nada.', linked);
    if (p.official.key === 'invalid') return openError('official', 'secret-invalid', 'La clave de la base oficial tiene un formato inválido. No se reemplazó.', linked);
    return { state: 'official-existing', active: 'official' };
  };

  if (p.marker) return officialSelection();
  // Sin marcador: o es la primera apertura, o la app se cerró entre crear la base y escribir el marcador.
  if (p.official.exists || p.orphans.length > 0) return officialSelection();
  return { state: 'fresh-install', active: 'official' };
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
/** Serializa selección y recuperación en el proceso: nunca dos a la vez sobre los mismos archivos. */
function exclusive<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(fn, fn);
  queue = run.catch(() => undefined);
  return run;
}

function selectionFromError(error: unknown, store: OpenErrorSelection['store'], linked: boolean): OpenErrorSelection {
  if (error instanceof ActiveStoreError) return openError(store, error.code, error.message, linked, error.recovery);
  if (isLocalDatabaseError(error)) return openError(store, error.code, error.message, linked);
  return openError(store, 'open-failed', error instanceof Error ? error.message : String(error), linked);
}

// ---------------------------------------------------------------------------------------------------------------
// API pública
// ---------------------------------------------------------------------------------------------------------------

export type OpenActiveStoreOptions = OpenAthleteDataOptions & { files: DatabaseFiles };

export type ActiveStore =
  /** Usar los servicios oficiales. */
  | { kind: 'official'; selection: StoreSelection; data: OpenedAthleteData }
  /** No montar ningún almacén: mostrar `selection.recovery`. */
  | { kind: 'blocked'; selection: OpenErrorSelection };

/** Inspecciona sin abrir ninguna base ni escribir nada. */
export function inspectStorage(options: OpenActiveStoreOptions): Promise<StoreSelection> {
  return exclusive(async () => {
    try {
      return classifyStorage((await probe(options.secureStore, options.files, options.env)).probe);
    } catch (error) {
      return selectionFromError(error, 'unknown', false);
    }
  });
}

/** Punto de entrada de la app: clasifica el estado y, si se puede, abre el almacén oficial. Nunca lanza. */
export function openActiveStore(options: OpenActiveStoreOptions): Promise<ActiveStore> {
  return exclusive(async () => {
    let state: Awaited<ReturnType<typeof probe>>;
    try {
      state = await probe(options.secureStore, options.files, options.env);
    } catch (error) {
      return { kind: 'blocked', selection: selectionFromError(error, 'unknown', false) };
    }
    const { probe: p, raw } = state;
    const selection = classifyStorage(p);
    const linked = p.identity?.accountUserId != null;
    if (selection.state === 'open-error') return { kind: 'blocked', selection };

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
        await writeMarker(options.secureStore, raw.marker, { v: 1, store: 'official', at: (options.clock ?? systemClock).now(), retained: [] });
      } catch (error) {
        await data.close().catch(() => undefined);
        return { kind: 'blocked', selection: selectionFromError(error, 'official', linked) };
      }
    }
    return { kind: 'official', selection, data };
  });
}

/**
 * Recuperación explícita: crea una base oficial nueva y vacía con otra identidad local, conservando intactas
 * (archivo y clave) todas las bases existentes, que quedan registradas en `retained`. Solo se permite cuando la
 * clasificación ofrece `start-new-store`, o cuando el marcador o la identidad son ilegibles.
 */
export function startNewStore(options: OpenActiveStoreOptions & { confirm: 'start-new-store' }): Promise<ActiveStore> {
  return exclusive(async () => {
    if (options.confirm !== 'start-new-store') throw new ActiveStoreError('not-allowed', 'Falta la confirmación explícita.', []);
    const secure = options.secureStore;
    const now = (options.clock ?? systemClock).now();
    const raw: Raw = { marker: await readSecret(secure, ACTIVE_STORE_KEY), identity: await readSecret(secure, IDENTITY_KEY) };

    let p: StorageProbe | null = null;
    let reason: string;
    try {
      p = (await probe(secure, options.files, options.env)).probe;
      const selection = classifyStorage(p);
      const allowed = selection.state === 'open-error' && selection.recovery.includes('start-new-store');
      if (!allowed) throw new ActiveStoreError('not-allowed', `No corresponde empezar de nuevo en el estado ${selection.state}.`, []);
      reason = selection.code;
    } catch (error) {
      if (!(isLocalDatabaseError(error) && error.code === 'secret-invalid')) throw error;
      reason = 'secret-invalid'; // marcador o identidad ilegibles: se reemplazan por comparar-y-escribir sobre el valor crudo
    }

    // Todo lo que exista se conserva y se registra.
    const files = new Set((await options.files.listDatabases()).map(baseName));
    const previous = p?.marker?.retained ?? [];
    const known = new Set(previous.map((r) => r.file));
    const retained: RetainedStore[] = [...previous];
    const keep = (file: string) => { if (files.has(file) && !known.has(file)) { known.add(file); retained.push({ file, keyName: databaseKeyName(file), reason, at: now }); } };
    if (p?.official.file) keep(p.official.file);
    for (const f of [...files].filter((n) => officialPattern(options.env).test(n)).sort()) keep(f);

    const ids = createUuidV7Generator(options.randomBytes);
    let localUserId = ids.newId().toLowerCase();
    while (files.has(localDatabaseName(localUserId, options.env))) localUserId = ids.newId().toLowerCase();
    const current = p?.identity ?? null;
    const next: DeviceIdentity = { localUserId, accountUserId: current?.accountUserId ?? null };
    // Identidad (comparar-y-escribir sobre el valor crudo) y después marcador. Si la app se cierra en medio, el
    // estado resultante vuelve a clasificarse como error con la misma recuperación: nunca se pierde nada.
    await replaceIdentity(secure, raw.identity, next);
    await writeMarker(secure, raw.marker, { v: 1, store: 'official', at: now, retained });

    try {
      const data = await openAthleteData({ ...options, expect: 'create-if-missing' });
      return { kind: 'official', selection: { state: 'fresh-install', active: 'official' }, data } as ActiveStore;
    } catch (error) {
      return { kind: 'blocked', selection: selectionFromError(error, 'official', next.accountUserId !== null) };
    }
  });
}
