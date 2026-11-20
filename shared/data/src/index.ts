export * from './sql/types';
export { fromExpoSqlite, localDatabaseName, localDatabasePrefix, type ExpoSQLiteDatabaseLike, type ExpoSqliteOptions } from './sql/expo-sqlite';
export { LocalStore, DataError, type StoreContext } from './local/store';
export { ENTITIES, metaFor, type EntityMeta, type LocalRow } from './local/entities';
export { LOCAL_SCHEMA_VERSION, migrateLocalDatabase } from './local/schema';
export { SyncEngine, type SyncEngineOptions } from './sync/engine';
export { LocalWorkoutSessionRepository } from './repositories/workout-sessions';
export { LocalCardioRepository, LocalBodyRepository } from './repositories/cardio-body';
export { LocalExerciseRepository, LocalProfileRepository, LocalTrainingPlanRepository } from './repositories/catalog-profile-plans';
export * from './supabase/client';
export * from './supabase/transport';
export * from './supabase/auth';
export * from './config/environment';
export * from './logging';
export { createAthleteData, type AthleteData } from './factory';
export { openAthleteData, type OpenAthleteDataOptions, type OpenedAthleteData } from './open';
export { resolveIdentity, readIdentity, linkAccount, localOnlyTransport, IDENTITY_KEY, type DeviceIdentity } from './identity';
export {
  openEncryptedDatabase, databaseKeyName, LocalDatabaseError, isLocalDatabaseError,
  type LocalDatabaseErrorCode, type OpenEncryptedDatabaseOptions,
} from './secure/encrypted-database';
export { BUNDLED_CATALOG, BUNDLED_CATALOG_VERSION, CATALOG_EXERCISE_ID } from './catalog/bundled';
export { createUuidV7Generator, systemClock } from './ids';
export { fromSupabaseError } from './supabase/errors';
export {
  openActiveStore, inspectStorage, classifyStorage, startNewStore, ActiveStoreError, ACTIVE_STORE_KEY,
  type DatabaseFiles, type ActiveStore, type StoreSelection, type OpenErrorSelection, type StoreErrorCode, type RecoveryAction,
  type ActiveStoreMarker, type RetainedStore, type StorageProbe, type KeyState, type OpenActiveStoreOptions,
} from './storage/active-store';
