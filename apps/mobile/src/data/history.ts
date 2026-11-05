import type { CardioEntry, HistoryItem, Workout } from './trainingTypes';

/** Historial unificado de fuerza y cardio, del más reciente al más antiguo. */
export function mergeHistory(workouts: readonly Workout[], cardio: readonly CardioEntry[]): HistoryItem[] {
  const items: HistoryItem[] = [
    ...workouts.map((workout) => ({ kind: 'strength' as const, startedAt: workout.startedAt, workout })),
    ...cardio.map((entry) => ({ kind: 'cardio' as const, startedAt: entry.startedAt, cardio: entry })),
  ];
  return items.sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt));
}
