export * from './sql/types';
export { fromExpoSqlite, localDatabaseName, type ExpoSQLiteDatabaseLike, type ExpoSqliteOptions } from './sql/expo-sqlite';
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
export { openAthleteData, openLegacyDatabaseCopy, LEGACY_DATABASE_KEY_NAME, type OpenAthleteDataOptions, type OpenedAthleteData } from './open';
export { LegacyImportError, LEGACY_SOURCE, planLegacyImport, readLegacySnapshot, type LegacyImportReport, type LegacyImportResult, type ImportErrorCode } from './legacy/codex-v1';
export { resolveIdentity, linkAccount, localOnlyTransport, IDENTITY_KEY, LEGACY_OWNER_KEY, type DeviceIdentity } from './identity';
export {
  openEncryptedDatabase, databaseKeyName, LocalDatabaseError, isLocalDatabaseError,
  type LocalDatabaseErrorCode, type OpenEncryptedDatabaseOptions,
} from './secure/encrypted-database';
export { BUNDLED_CATALOG, BUNDLED_CATALOG_VERSION, CATALOG_EXERCISE_ID } from './catalog/bundled';
export { createUuidV7Generator, systemClock } from './ids';
export { fromSupabaseError } from './supabase/errors';
