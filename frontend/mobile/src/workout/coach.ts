import { estimateE1rm, scoreSession, suggestLoad, type LoadSuggestion, type SessionScore } from '@athlete/domain';
import type { SessionExercise, TrainingSet, WorkoutDetail } from '@/data/trainingTypes';

/** Serie de la UI → forma que entiende el dominio (una serie con reps cuenta como hecha). */
function toScoreSet(set: TrainingSet) {
  return { setType: set.isWarmup ? 'warmup' as const : 'working' as const, weightKg: set.weightKg, reps: set.reps, rir: set.rir, completedAt: set.reps !== null ? 'done' : null, deletedAt: null };
}

/** Mejor 1RM estimado de la vez pasada (solo series con peso y 1–12 reps). */
export function previousBestE1rm(exercise: SessionExercise): number | null {
  const values = (exercise.previous?.sets ?? []).map((s) => estimateE1rm(s.weightKg, s.reps)).filter((v): v is number => v !== null);
  return values.length ? Math.max(...values) : null;
}

/** Calificación 0–100 de la sesión (null si no tiene series efectivas). */
export function workoutScore(detail: WorkoutDetail): SessionScore | null {
  return scoreSession(detail.exercises.map((e) => ({
    setsTarget: e.setsTarget, targetRir: e.targetRir ?? null, sets: e.sets.map(toScoreSet), previousBestE1rm: previousBestE1rm(e),
  })));
}

/** Carga sugerida para hoy en este ejercicio, a partir de la vez pasada. */
export function exerciseSuggestion(exercise: SessionExercise): LoadSuggestion | null {
  const lastSets = exercise.previous?.sets ?? [];
  if (!lastSets.length) return null;
  return suggestLoad({ lastSets, targetReps: exercise.repsTarget, targetRir: exercise.targetRir ?? null, incrementKg: exercise.incrementKg ?? 2.5 });
}

/** "82.5 kg × 5" o "13 reps" (peso corporal). */
export function formatSuggestion(s: Pick<LoadSuggestion, 'weightKg' | 'reps'>): string {
  return s.weightKg === null ? `${s.reps} reps` : `${s.weightKg} kg × ${s.reps}`;
}
