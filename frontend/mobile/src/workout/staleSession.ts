import type { TrainingRepository } from '@/data/TrainingRepository';
import type { Workout } from '@/data/trainingTypes';
import { PAST_WORKOUT_MS } from '@/data/OfficialTrainingRepository';

/**
 * Sesiones olvidadas: si alguien empezó a entrenar y nunca tocó "Terminar", la sesión se quedaba abierta para siempre
 * (y Inicio seguía diciendo "Sesión en curso"). Después de 12 h se cierra sola: con series, se guarda con una duración
 * estimada; vacía, se descarta.
 */
export function isStale(w: Workout | null | undefined, now = Date.now()): w is Workout {
  return Boolean(w && w.state === 'active' && now - Date.parse(w.startedAt) > PAST_WORKOUT_MS);
}

/** ~3 min por serie + calentamiento, entre 15 y 120 min. */
export function estimatedMinutes(setCount: number): number {
  return Math.min(120, Math.max(15, Math.round(setCount * 3 + 10)));
}

export async function closeIfStale(repo: TrainingRepository, w: Workout | null | undefined, now = Date.now()): Promise<'closed' | 'discarded' | null> {
  if (!isStale(w, now)) return null;
  if (w.setCount === 0) { await repo.tombstoneWorkout(w.id); return 'discarded'; }
  await repo.finishWorkout(w.id, { durationMinutes: estimatedMinutes(w.setCount) });
  return 'closed';
}
