import {
  appError,
  err,
  ok,
  type IsoDateTime,
  type Result,
  type WorkoutSession,
  type WorkoutSessionStatus,
} from '@athlete/contracts';
import { compareInstants } from './time';

const TRANSITIONS: Readonly<Record<WorkoutSessionStatus, readonly WorkoutSessionStatus[]>> = {
  in_progress: ['completed', 'discarded'],
  completed: [],
  discarded: [],
};

export function canTransition(from: WorkoutSessionStatus, to: WorkoutSessionStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export function assertTransition(from: WorkoutSessionStatus, to: WorkoutSessionStatus): Result<void> {
  return canTransition(from, to)
    ? ok(undefined)
    : err(appError('INVALID_STATE', 'La sesión no admite este cambio de estado.', { details: { from, to } }));
}

/** Se pueden editar ejercicios y series en sesiones en curso y completadas (especificación §6.4). */
export function canEditContent(status: WorkoutSessionStatus): boolean {
  return status !== 'discarded';
}

export function validateSessionTimes(startedAt: IsoDateTime, endedAt: IsoDateTime | null): Result<void> {
  if (endedAt !== null && compareInstants(endedAt, startedAt) < 0) {
    return err(
      appError('VALIDATION_FAILED', 'La hora de fin no puede ser anterior a la de inicio.', {
        details: { field: 'endedAt' },
      }),
    );
  }
  return ok(undefined);
}

/** Regla de negocio: como máximo una sesión de fuerza en curso por usuario. */
export function findActiveSession<T extends Pick<WorkoutSession, 'status' | 'deletedAt'>>(sessions: readonly T[]): T | null {
  return sessions.find((s) => s.status === 'in_progress' && s.deletedAt === null) ?? null;
}

export function assertCanStart(sessions: readonly Pick<WorkoutSession, 'id' | 'status' | 'deletedAt'>[]): Result<void> {
  const active = findActiveSession(sessions);
  return active === null
    ? ok(undefined)
    : err(appError('INVALID_STATE', 'Ya hay una sesión en curso.', { details: { activeSessionId: active.id } }));
}

/** Siguiente posición al final de una lista ordenada (ignora elementos eliminados). */
export function nextPosition(items: readonly { position: number; deletedAt: string | null }[]): number {
  let max = -1;
  for (const item of items) if (item.deletedAt === null && item.position > max) max = item.position;
  return max + 1;
}

/**
 * Valida un reordenamiento: debe contener exactamente los ids vivos actuales, sin duplicados.
 * Devuelve el mapa id → nueva posición.
 */
export function planReorder(
  currentIds: readonly string[],
  orderedIds: readonly string[],
): Result<Map<string, number>> {
  const current = new Set(currentIds);
  const ordered = new Set(orderedIds);
  if (ordered.size !== orderedIds.length || ordered.size !== current.size || [...ordered].some((id) => !current.has(id))) {
    return err(appError('VALIDATION_FAILED', 'El nuevo orden no coincide con los elementos actuales.'));
  }
  return ok(new Map(orderedIds.map((id, i) => [id, i])));
}
