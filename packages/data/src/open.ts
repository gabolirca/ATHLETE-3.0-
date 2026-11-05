import { appError, type Clock, type SecureKeyValueStorage, type SyncTransport } from '@athlete/contracts';
import { BUNDLED_CATALOG, BUNDLED_CATALOG_VERSION } from './catalog/bundled';
import { buildAthleteData, type AthleteData } from './factory';
import { linkAccount, localOnlyTransport, resolveIdentity, type DeviceIdentity } from './identity';
import { createUuidV7Generator, systemClock } from './ids';
import { importLegacyCodexV1, type LegacyImportResult } from './legacy/codex-v1';
import { DataError, LocalStore } from './local/store';
import type { Logger } from './logging';
import { openEncryptedDatabase } from './secure/encrypted-database';
import type { ExpoSQLiteDatabaseLike } from './sql/expo-sqlite';
import { localDatabaseName } from './sql/expo-sqlite';
import type { SqlDatabase } from './sql/types';
import type { SyncEngineOptions } from './sync/engine';

export type OpenAthleteDataOptions = {
  /** `(name) => SQLite.openDatabaseAsync(name)` de expo-sqlite (con SQLCipher). */
  openDatabase: (name: string) => Promise<ExpoSQLiteDatabaseLike>;
  /** `expo-secure-store` adaptado a `SecureKeyValueStorage`. */
  secureStore: SecureKeyValueStorage;
  /** `expo-crypto.getRandomBytes` (síncrono, criptográfico). */
  randomBytes: (n: number) => Uint8Array;
  /** Transporte para cuando haya cuenta vinculada (p. ej. `SupabaseSyncTransport`). Sin cuenta no se usa. */
  accountTransport?: SyncTransport;
  env?: 'local' | 'development' | 'testing' | 'production';
  clock?: Clock;
  logger?: Logger;
  sync?: SyncEngineOptions;
};

/**
 * Punto de entrada único de la app.
 *
 *  1. Resuelve la identidad del dispositivo (local, sin cuenta, o vinculada a una cuenta).
 *  2. Abre la base cifrada `localDatabaseName(localUserId)` con su clave en el almacén seguro.
 *  3. Migra el esquema local, aplica el catálogo incluido si aún no hay uno y construye los servicios.
 *
 * Sin cuenta, la sync responde `UNAUTHENTICATED` y todo queda pendiente en la outbox (única) hasta vincular una cuenta.
 */
export type OpenedAthleteData = AthleteData & {
  readonly identity: Readonly<DeviceIdentity>;
  adoptLocalData(accountUserId: string): Promise<OpenedAthleteData>;
  importLegacyStore(legacyCopy: SqlDatabase, options: { deviceTimeZone: string; sha256: (text: string) => Promise<string> }): Promise<LegacyImportResult>;
};

export async function openAthleteData(options: OpenAthleteDataOptions): Promise<OpenedAthleteData> {
  const clock = options.clock ?? systemClock;
  const ids = createUuidV7Generator(options.randomBytes);
  let identity = await resolveIdentity(options.secureStore, () => ids.newId());
  const db = await openEncryptedDatabase({
    name: localDatabaseName(identity.localUserId, options.env),
    open: options.openDatabase,
    secureStore: options.secureStore,
    randomBytes: options.randomBytes,
  });

  let store: LocalStore;
  try {
    identity = await completeInterruptedAdoption(db, options.secureStore, identity);
    store = await LocalStore.open(db, { userId: identity.accountUserId ?? identity.localUserId, ids, clock });
    await store.applyBundledCatalog(BUNDLED_CATALOG, BUNDLED_CATALOG_VERSION);
  } catch (error) {
    await db.close().catch(() => undefined);
    throw error;
  }

  const transport = identity.accountUserId ? (options.accountTransport ?? localOnlyTransport) : localOnlyTransport;
  const data = buildAthleteData(store, { db, transport, ...(options.logger ? { logger: options.logger } : {}), ...(options.sync ? { sync: options.sync } : {}) });

  return {
    ...data,
    identity: identity as Readonly<DeviceIdentity>,
    /**
     * Adopta los datos locales para la cuenta `accountUserId` (tras iniciar sesión): reasigna la propiedad en una
     * transacción, vincula la identidad y reabre. Devuelve la nueva instancia; la actual queda cerrada.
     * Si ya hay otra cuenta vinculada en este dispositivo → `FORBIDDEN` (multicuenta: pendiente de diseño).
     */
    /**
     * Importa la COPIA de la base de la capa anterior (abrirla con `openLegacyDatabaseCopy`). Transaccional,
     * verificado e idempotente; nunca escribe en la copia. Ver `legacy/codex-v1.ts`.
     */
    importLegacyStore(legacyCopy, importOptions) {
      return importLegacyCodexV1(store, legacyCopy, { ...importOptions, localUserId: identity.localUserId, now: clock.now() });
    },
    async adoptLocalData(accountUserId: string): Promise<OpenedAthleteData> {
      if (!/^[0-9a-f-]{36}$/i.test(accountUserId)) throw new DataError(appError('VALIDATION_FAILED', 'Cuenta no válida.'));
      const account = accountUserId.toLowerCase();
      if (identity.accountUserId === account) {
        await db.close();
        return openAthleteData(options);
      }
      if (identity.accountUserId !== null) throw new DataError(appError('FORBIDDEN', 'Este dispositivo ya está vinculado a otra cuenta.'));
      await store.reassignOwner(account);
      await linkAccount(options.secureStore, identity, account);
      await db.close();
      return openAthleteData(options);
    },
  };
}

/**
 * Si la app se cerró entre reasignar la propiedad en la base y vincular la identidad, la base ya pertenece a la
 * cuenta (`sync_state.user_id`) y registra de qué usuario local se adoptó. Se completa el vínculo; en cualquier otro
 * desajuste se deja que `LocalStore.open` falle sin tocar nada.
 */
async function completeInterruptedAdoption(db: SqlDatabase, store: SecureKeyValueStorage, identity: DeviceIdentity): Promise<DeviceIdentity> {
  if (identity.accountUserId !== null) return identity;
  let owner: string | null = null;
  let adoptedFrom: string | null = null;
  try {
    owner = (await db.get<{ value: string }>("SELECT value FROM sync_state WHERE key = 'user_id'"))?.value ?? null;
    adoptedFrom = (await db.get<{ value: string }>("SELECT value FROM sync_state WHERE key = 'adopted_from_local_user'"))?.value ?? null;
  } catch {
    return identity; // base nueva: aún no hay sync_state
  }
  if (owner && owner !== identity.localUserId && adoptedFrom === identity.localUserId) {
    return linkAccount(store, identity, owner);
  }
  return identity;
}

/** Clave de la base de la capa anterior (`apps/mobile/src/data/database.ts`). Solo se lee; nunca se crea ni se cambia. */
export const LEGACY_DATABASE_KEY_NAME = 'athlete3.sqlite.sqlcipher-key.v1';

/**
 * Abre en solo lectura una COPIA de la base anterior con su clave original. No crea claves, no cambia el modo de
 * diario y falla con `database-key-missing` / `database-unreadable` si no puede leerla.
 * `open` debe abrir el archivo copiado (p. ej. `(name) => SQLite.openDatabaseAsync(name, {}, backupDirectory)`).
 */
export function openLegacyDatabaseCopy(options: { name: string; open: (name: string) => Promise<ExpoSQLiteDatabaseLike>; secureStore: SecureKeyValueStorage }): Promise<SqlDatabase> {
  return openEncryptedDatabase({
    ...options, keyName: LEGACY_DATABASE_KEY_NAME, readOnly: true,
    randomBytes: () => { throw new Error('La copia heredada nunca genera claves'); },
  });
}
