import type { StrengthSet, WorkoutSessionDetail } from '@athlete/contracts';

/** Campos de serie que necesita la lógica de fuerza (permite usar filas parciales). */
export type SetLike = Pick<StrengthSet, 'setType' | 'weightKg' | 'reps' | 'completedAt' | 'deletedAt'>;

/**
 * Serie efectiva: de trabajo, ejecutada (`completedAt`), no eliminada y con al menos una repetición.
 * El calentamiento nunca cuenta (data-model §6).
 */
export function isEffectiveSet(set: SetLike): boolean {
  return (
    set.deletedAt === null &&
    set.setType === 'working' &&
    set.completedAt !== null &&
    set.reps !== null &&
    set.reps > 0
  );
}

/** Volumen de una serie (kg × reps). Null si falta peso o repeticiones: no se infiere. */
export function setVolumeKg(set: SetLike): number | null {
  if (set.weightKg === null || set.reps === null) return null;
  return set.weightKg * set.reps;
}

export type E1rmFormula = 'epley' | 'brzycki';

export type E1rmOptions = {
  formula?: E1rmFormula;
  /** Por encima de este número de repeticiones la estimación pierde fiabilidad → null. */
  maxReps?: number;
};

/**
 * 1RM estimado. Es una **estimación** (especificación §3): nunca se almacena como medición.
 * - Epley: w × (1 + r/30). Brzycki: w × 36 / (37 − r).
 * - Con 1 repetición devuelve el peso levantado.
 */
export function estimateE1rm(weightKg: number | null, reps: number | null, options: E1rmOptions = {}): number | null {
  const { formula = 'epley', maxReps = 12 } = options;
  if (weightKg === null || reps === null || weightKg <= 0 || reps < 1 || reps > maxReps) return null;
  if (reps === 1) return weightKg;
  return formula === 'epley' ? weightKg * (1 + reps / 30) : (weightKg * 36) / (37 - reps);
}

export type StrengthSessionSummary = {
  exerciseCount: number;
  workingSetCount: number;
  warmupSetCount: number;
  totalReps: number;
  /** Null si ninguna serie efectiva tiene peso y repeticiones. */
  volumeKg: number | null;
  /** Series efectivas sin peso registrado (no suman volumen; se informa para transparencia). */
  effectiveSetsWithoutLoad: number;
};

export function summarizeSets(sets: readonly SetLike[]): Omit<StrengthSessionSummary, 'exerciseCount'> {
  let workingSetCount = 0;
  let warmupSetCount = 0;
  let totalReps = 0;
  let volume: number | null = null;
  let effectiveSetsWithoutLoad = 0;

  for (const set of sets) {
    if (set.deletedAt !== null) continue;
    if (set.setType === 'warmup') {
      if (set.completedAt !== null) warmupSetCount++;
      continue;
    }
    if (!isEffectiveSet(set)) continue;
    workingSetCount++;
    totalReps += set.reps ?? 0;
    const v = setVolumeKg(set);
    if (v === null) effectiveSetsWithoutLoad++;
    else volume = (volume ?? 0) + v;
  }

  return { workingSetCount, warmupSetCount, totalReps, volumeKg: volume, effectiveSetsWithoutLoad };
}

export function summarizeStrengthSession(session: Pick<WorkoutSessionDetail, 'exercises'>): StrengthSessionSummary {
  const exercises = session.exercises.filter((e) => e.deletedAt === null);
  return {
    exerciseCount: exercises.length,
    ...summarizeSets(exercises.flatMap((e) => e.sets)),
  };
}
