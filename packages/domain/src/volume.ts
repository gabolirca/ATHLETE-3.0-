import { isEffectiveSet, type SetLike } from './strength';

/**
 * Volumen semanal por músculo, medido en SERIES EFECTIVAS (de trabajo, hechas y con reps).
 * Cada serie cuenta 1 para los músculos principales del ejercicio y 0.5 para los secundarios
 * (conteo fraccional: el press de banca suma 1 a pecho y 0.5 a hombros y tríceps).
 */
export type ExerciseMuscles = { primary: readonly string[]; secondary: readonly string[] };
export type VolumeSession = { exercises: ReadonlyArray<{ exerciseId: string; sets: readonly SetLike[] }> };

export const SECONDARY_SET_WEIGHT = 0.5;

export function weeklySetsByMuscle(
  sessions: readonly VolumeSession[],
  musclesOf: (exerciseId: string) => ExerciseMuscles | undefined,
): Map<string, number> {
  const out = new Map<string, number>();
  const add = (muscle: string, amount: number) => out.set(muscle, (out.get(muscle) ?? 0) + amount);
  for (const session of sessions) {
    for (const exercise of session.exercises) {
      const muscles = musclesOf(exercise.exerciseId);
      if (!muscles) continue;
      const sets = exercise.sets.filter(isEffectiveSet).length;
      if (!sets) continue;
      for (const m of muscles.primary) add(m, sets);
      for (const m of muscles.secondary) if (!muscles.primary.includes(m)) add(m, sets * SECONDARY_SET_WEIGHT);
    }
  }
  return out;
}

/**
 * Series por semana como REFERENCIA GENERAL de hipertrofia (no es una prescripción): por debajo del mínimo
 * el estímulo suele quedarse corto; por encima del máximo cuesta recuperarse. Los músculos sin rango
 * (antebrazos, espalda baja, aductores, abductores) reciben trabajo indirecto y no se diagnostican.
 */
export const WEEKLY_SET_RANGES: Readonly<Record<string, readonly [min: number, max: number]>> = {
  chest: [10, 20], back: [10, 20], shoulders: [8, 20], quadriceps: [10, 20], hamstrings: [8, 16], glutes: [8, 16],
  biceps: [6, 16], triceps: [6, 16], calves: [6, 16], core: [6, 16], traps: [4, 12],
};

export type VolumeStatus = 'low' | 'ok' | 'high' | 'untracked';
export type MuscleVolume = { muscle: string; sets: number; status: VolumeStatus; range: readonly [number, number] | null };

export function volumeStatus(muscle: string, sets: number): VolumeStatus {
  const range = WEEKLY_SET_RANGES[muscle];
  if (!range) return 'untracked';
  return sets < range[0] ? 'low' : sets > range[1] ? 'high' : 'ok';
}

/**
 * Diagnóstico de la semana: todos los músculos con rango (aunque tengan 0 series, para avisar que faltan)
 * más los que tuvieron series. Ordenado de más a menos series. Las series se redondean a 0.5.
 */
export function diagnoseWeeklyVolume(setsByMuscle: ReadonlyMap<string, number>): MuscleVolume[] {
  const muscles = new Set([...Object.keys(WEEKLY_SET_RANGES), ...setsByMuscle.keys()]);
  return [...muscles]
    .map((muscle) => {
      const sets = Math.round((setsByMuscle.get(muscle) ?? 0) * 2) / 2;
      return { muscle, sets, status: volumeStatus(muscle, sets), range: WEEKLY_SET_RANGES[muscle] ?? null };
    })
    .filter((m) => m.sets > 0 || m.range !== null)
    .sort((a, b) => b.sets - a.sets || a.muscle.localeCompare(b.muscle));
}

/**
 * Series PLANEADAS por músculo de una rutina (lo que pide el plan, antes de entrenar), multiplicadas por
 * cuántas veces a la semana se hace. Mismo conteo que el volumen real: principal 1, secundario 0.5.
 */
export function plannedSetsByMuscle(
  items: ReadonlyArray<{ exerciseId: string; sets: number | null }>,
  musclesOf: (exerciseId: string) => ExerciseMuscles | undefined,
  timesPerWeek = 1,
): Map<string, number> {
  const out = new Map<string, number>();
  const add = (muscle: string, amount: number) => out.set(muscle, (out.get(muscle) ?? 0) + amount);
  for (const item of items) {
    const muscles = musclesOf(item.exerciseId);
    const sets = (item.sets ?? 0) * timesPerWeek;
    if (!muscles || sets <= 0) continue;
    for (const m of muscles.primary) add(m, sets);
    for (const m of muscles.secondary) if (!muscles.primary.includes(m)) add(m, sets * SECONDARY_SET_WEIGHT);
  }
  return out;
}
