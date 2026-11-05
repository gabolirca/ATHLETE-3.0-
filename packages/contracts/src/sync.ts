import { z } from 'zod';
import { IsoDateTime, Uuid } from './common';
import { AppError } from './errors';

/**
 * Contrato de sincronización (docs/contracts/README.md §8, especificación §9).
 * Diseño detallado y justificación en docs/decisions/0003-persistencia-y-sincronizacion.md.
 *
 * Resumen:
 * - Toda escritura local genera una `SyncMutation` con `mutationId` único → idempotencia.
 * - `baseRevision` es la revisión de servidor sobre la que se editó → detección de conflictos.
 * - Los borrados son tombstones (`op: 'delete'`), nunca desaparición silenciosa.
 * - Pull incremental por cursor; nunca reemplaza el almacenamiento local completo.
 */
export const SyncEntity = z.enum([
  'profile',
  'exercise',
  'training_plan',
  'training_day',
  'training_day_exercise',
  'workout_session',
  'session_exercise',
  'strength_set',
  'cardio_session',
  'body_weight',
  'body_measurement',
  'meal_entry',
  'nutrition_target',
]);
export type SyncEntity = z.infer<typeof SyncEntity>;

export const SyncOperation = z.enum(['upsert', 'delete']);
export type SyncOperation = z.infer<typeof SyncOperation>;

export const SyncMutation = z.object({
  mutationId: Uuid,
  deviceId: Uuid,
  entity: SyncEntity,
  entityId: Uuid,
  op: SyncOperation,
  /** Revisión de servidor conocida al editar. Null = creación (o registro nunca sincronizado). */
  baseRevision: z.int().nonnegative().nullable(),
  /**
   * Instantánea completa de los campos escribibles por el cliente (sin campos de servidor).
   * El servidor la valida con el esquema de la entidad. Null cuando `op = 'delete'`.
   */
  payload: z.record(z.string(), z.unknown()).nullable(),
  clientRecordedAt: IsoDateTime,
}).refine((m) => (m.op === 'delete') === (m.payload === null), {
  message: 'delete no lleva payload; upsert lo requiere',
  path: ['payload'],
});
export type SyncMutation = z.infer<typeof SyncMutation>;

export const MAX_PUSH_BATCH = 100;

export const PushRequest = z.object({
  deviceId: Uuid,
  /** Se aplican en orden; el orden importa para dependencias padre → hijo. */
  mutations: z.array(SyncMutation).min(1).max(MAX_PUSH_BATCH),
});
export type PushRequest = z.infer<typeof PushRequest>;

export const MutationResult = z.discriminatedUnion('status', [
  /** Aplicada ahora. */
  z.object({ status: z.literal('applied'), mutationId: Uuid, revision: z.int().nonnegative() }),
  /** Ya se había aplicado antes (reintento): mismo resultado, sin efectos nuevos. */
  z.object({ status: z.literal('duplicate'), mutationId: Uuid, revision: z.int().nonnegative() }),
  /** `baseRevision` no coincide con la revisión actual: requiere resolución explícita. */
  z.object({
    status: z.literal('conflict'),
    mutationId: Uuid,
    serverRevision: z.int().nonnegative(),
    serverDeleted: z.boolean(),
    serverRecord: z.record(z.string(), z.unknown()).nullable(),
  }),
  /** Inválida o no autorizada. No se reintenta sin cambios. */
  z.object({ status: z.literal('rejected'), mutationId: Uuid, error: AppError }),
]);
export type MutationResult = z.infer<typeof MutationResult>;

export const PushResponse = z.object({
  results: z.array(MutationResult),
});
export type PushResponse = z.infer<typeof PushResponse>;

export const PullRequest = z.object({
  /** Cursor opaco devuelto por el último pull. Null = primera sincronización del dispositivo. */
  cursor: z.string().min(1).nullable(),
  limit: z.int().min(1).max(500).default(200),
  entities: z.array(SyncEntity).optional(),
});
export type PullRequest = z.input<typeof PullRequest>;

export const RemoteChange = z.object({
  entity: SyncEntity,
  entityId: Uuid,
  revision: z.int().nonnegative(),
  /** Tombstone: el registro fue eliminado; `record` es null. */
  deleted: z.boolean(),
  record: z.record(z.string(), z.unknown()).nullable(),
  /** Mutación que produjo el cambio; permite al dispositivo reconocer sus propios ecos. */
  lastMutationId: Uuid.nullable(),
});
export type RemoteChange = z.infer<typeof RemoteChange>;

export const PullResponse = z.object({
  changes: z.array(RemoteChange),
  nextCursor: z.string().min(1),
  hasMore: z.boolean(),
});
export type PullResponse = z.infer<typeof PullResponse>;

// ---------- Estado local (outbox) ----------

export const OutboxStatus = z.enum(['pending', 'in_flight', 'failed', 'conflict', 'rejected']);
export type OutboxStatus = z.infer<typeof OutboxStatus>;

export const OutboxEntry = z.object({
  mutation: SyncMutation,
  status: OutboxStatus,
  attempts: z.int().nonnegative(),
  lastError: AppError.nullable(),
  enqueuedAt: IsoDateTime,
  nextAttemptAt: IsoDateTime.nullable(),
});
export type OutboxEntry = z.infer<typeof OutboxEntry>;

/** Resolución explícita de un conflicto, decidida por el usuario o por una regla documentada. */
export const ConflictResolution = z.enum([
  /** Reenviar la versión local tomando la revisión del servidor como base. */
  'keep_local',
  /** Descartar el cambio local y adoptar el registro del servidor. */
  'keep_remote',
]);
export type ConflictResolution = z.infer<typeof ConflictResolution>;

export const SyncStatus = z.object({
  pendingCount: z.int().nonnegative(),
  conflictCount: z.int().nonnegative(),
  rejectedCount: z.int().nonnegative(),
  lastPushAt: IsoDateTime.nullable(),
  lastPullAt: IsoDateTime.nullable(),
  online: z.boolean(),
});
export type SyncStatus = z.infer<typeof SyncStatus>;
