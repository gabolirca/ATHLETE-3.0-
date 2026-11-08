import type { SessionExercise, TrainingSet } from '@/data/trainingTypes';

/**
 * Entrenamiento guiado: en qué ejercicio vas, cuántas series llevas y qué sigue.
 * Una serie "cuenta" si es de trabajo (no calentamiento) y ya tiene repeticiones.
 */
export const isLoggedWorkingSet = (set: Pick<TrainingSet, 'isWarmup' | 'reps'>) => !set.isWarmup && set.reps !== null;

export type ExerciseProgress = { done: number; target: number | null; complete: boolean };

export function exerciseProgress(exercise: Pick<SessionExercise, 'sets' | 'setsTarget'>): ExerciseProgress {
  const done = exercise.sets.filter(isLoggedWorkingSet).length;
  const target = exercise.setsTarget && exercise.setsTarget > 0 ? exercise.setsTarget : null;
  return { done, target, complete: target !== null && done >= target };
}

export type ExerciseStatus = 'done' | 'current' | 'upcoming' | 'free';

export type WorkoutGuide = {
  /** false en sesiones libres (sin series objetivo): no hay orden que seguir. */
  guided: boolean;
  statuses: ExerciseStatus[];
  currentIndex: number | null;
  allComplete: boolean;
  setsDone: number;
  setsTarget: number;
};

export function workoutGuide(exercises: ReadonlyArray<Pick<SessionExercise, 'sets' | 'setsTarget'>>): WorkoutGuide {
  const progress = exercises.map(exerciseProgress);
  const guided = progress.some((p) => p.target !== null);
  if (!guided) {
    return { guided, statuses: progress.map(() => 'free'), currentIndex: null, allComplete: false, setsDone: progress.reduce((n, p) => n + p.done, 0), setsTarget: 0 };
  }
  // El actual es el primero sin terminar; los ejercicios sin objetivo (agregados a mano) nunca bloquean el avance.
  const currentIndex = progress.findIndex((p) => p.target !== null && !p.complete);
  const statuses: ExerciseStatus[] = progress.map((p, i) => {
    if (p.target === null) return 'free';
    if (p.complete) return 'done';
    return i === currentIndex ? 'current' : 'upcoming';
  });
  return {
    guided,
    statuses,
    currentIndex: currentIndex === -1 ? null : currentIndex,
    allComplete: currentIndex === -1,
    setsDone: progress.reduce((n, p) => n + (p.target === null ? 0 : Math.min(p.done, p.target)), 0),
    setsTarget: progress.reduce((n, p) => n + (p.target ?? 0), 0),
  };
}

/**
 * Qué decir en el temporizador después de guardar una serie del ejercicio `index`.
 * `exercises` debe reflejar ya la serie recién guardada.
 */
export function nextStepLabel(exercises: ReadonlyArray<Pick<SessionExercise, 'sets' | 'setsTarget' | 'exerciseName'>>, index: number): string {
  const exercise = exercises[index];
  if (!exercise) return '';
  const p = exerciseProgress(exercise);
  if (p.target === null) return `Siguiente: ${exercise.exerciseName}`;
  if (!p.complete) return `Siguiente: serie ${p.done + 1} de ${p.target} · ${exercise.exerciseName}`;
  const next = exercises.findIndex((e, i) => i !== index && (() => { const q = exerciseProgress(e); return q.target !== null && !q.complete; })());
  return next === -1 ? '¡Rutina completa! Finaliza y guarda' : `Siguiente ejercicio: ${exercises[next]!.exerciseName}`;
}
