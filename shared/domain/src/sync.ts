import type {
  ConflictResolution,
  MutationResult,
  OutboxEntry,
  RemoteChange,
  SyncMutation,
  Uuid,
} from '@athlete/contracts';

/** Estado local mínimo de un registro para decidir cómo aplicar un cambio remoto. */
export type LocalRecordState = {
  revision: number | null;
  deleted: boolean;
};

export type RemoteApplyDecision =
  /** Escribir el registro remoto en local (alta o actualización). */
  | 'apply'
  /** Guardar el tombstone (marcar `deletedAt`), exista o no localmente: evita resurrecciones. */
  | 'apply_tombstone'
  /** El cambio remoto es igual o más antiguo que lo que ya hay: ignorar. */
  | 'skip_stale'
  /**
   * Hay mutaciones locales sin confirmar: **no** sobrescribir (especificación §9).
   * El push resolverá: se aplicará o devolverá conflicto explícito.
   */
  | 'defer_pending';

/**
 * Decide cómo aplicar un cambio recibido por pull. Nunca pierde datos locales pendientes.
 */
export function decideRemoteApply(
  local: LocalRecordState | null,
  remote: Pick<RemoteChange, 'revision' | 'deleted'>,
  hasPendingLocalMutation: boolean,
): RemoteApplyDecision {
  if (hasPendingLocalMutation) return 'defer_pending';
  if (local !== null && local.revision !== null && remote.revision <= local.revision) return 'skip_stale';
  return remote.deleted ? 'apply_tombstone' : 'apply';
}

export type OutboxAction =
  | { action: 'acknowledge'; revision: number }
  | { action: 'conflict'; serverRevision: number; serverRecord: Record<string, unknown> | null }
  | { action: 'reject'; error: Extract<MutationResult, { status: 'rejected' }>['error'] };

/** Traduce el resultado de push a la acción sobre la outbox. `duplicate` es un éxito idempotente. */
export function outboxActionFor(result: MutationResult): OutboxAction {
  switch (result.status) {
    case 'applied':
    case 'duplicate':
      return { action: 'acknowledge', revision: result.revision };
    case 'conflict':
      return { action: 'conflict', serverRevision: result.serverRevision, serverRecord: result.serverRecord };
    case 'rejected':
      return { action: 'reject', error: result.error };
  }
}

/**
 * Detección en servidor (misma regla que implementará la función SQL/Edge):
 * hay conflicto si la revisión actual existe y no coincide con la base del cliente.
 * Crear un registro que ya existe (baseRevision null) también es conflicto.
 */
export function isConflict(baseRevision: number | null, currentRevision: number | null): boolean {
  if (currentRevision === null) return false;
  return baseRevision !== currentRevision;
}

export type BackoffOptions = { baseMs?: number; maxMs?: number; jitter?: () => number };

/**
 * Espera antes del reintento `attempts` (1 = primer reintento). Exponencial con tope.
 * Con `jitter` (función que devuelve [0,1)) aplica "equal jitter": entre 50 % y 100 % del valor.
 * Sin `jitter` es determinista.
 */
export function retryDelayMs(attempts: number, options: BackoffOptions = {}): number {
  const { baseMs = 1000, maxMs = 5 * 60_000, jitter } = options;
  const exp = Math.min(maxMs, baseMs * 2 ** Math.max(0, attempts - 1));
  return jitter ? Math.round(exp * (0.5 + jitter() * 0.5)) : exp;
}

export type ConflictOutcome =
  | { kind: 'resend'; mutation: SyncMutation }
  | { kind: 'adopt_remote'; record: Record<string, unknown> | null; revision: number };

/**
 * Aplica una resolución explícita a una entrada en conflicto.
 * - `keep_local`: nueva mutación (nuevo `mutationId`) con la revisión del servidor como base.
 * - `keep_remote`: descartar el cambio local y adoptar el registro del servidor.
 */
export function resolveConflict(
  entry: OutboxEntry,
  conflict: { serverRevision: number; serverRecord: Record<string, unknown> | null },
  resolution: ConflictResolution,
  newMutationId: Uuid,
  now: string,
): ConflictOutcome {
  if (resolution === 'keep_remote') {
    return { kind: 'adopt_remote', record: conflict.serverRecord, revision: conflict.serverRevision };
  }
  return {
    kind: 'resend',
    mutation: { ...entry.mutation, mutationId: newMutationId, baseRevision: conflict.serverRevision, clientRecordedAt: now },
  };
}
