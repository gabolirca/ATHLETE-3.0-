import type { TrainingSet } from '@/data/trainingTypes';
import { isLoggedWorkingSet } from './guide';

/**
 * Un ejercicio del plan cambiado a medias (ya llevabas series) queda partido en dos: el original se queda con las
 * series que hiciste y la variante con las que faltan. Así el entrenamiento guiado no se atora en el original.
 * `links[i]` es el ejercicio planificado del que viene `items[i]` (en el orden de la sesión).
 */
export function splitSharedTargets<T extends { setsTarget: number | null; sets: Array<Pick<TrainingSet, 'isWarmup' | 'reps' | 'durationSeconds' | 'distanceMeters'>> }>(items: readonly T[], links: ReadonlyArray<string | null>): T[] {
  const groups = new Map<string, number[]>();
  links.forEach((link, i) => { if (link) groups.set(link, [...(groups.get(link) ?? []), i]); });
  const out = [...items];
  for (const idx of groups.values()) {
    const first = out[idx[0]!]!;
    if (idx.length < 2 || first.setsTarget === null) continue;
    let remaining = first.setsTarget;
    idx.forEach((i, k) => {
      const item = out[i]!;
      const done = item.sets.filter(isLoggedWorkingSet).length;
      const target = k === idx.length - 1 ? Math.max(remaining, 1) : Math.min(done, remaining);
      remaining -= target;
      out[i] = { ...item, setsTarget: target > 0 ? target : null };
    });
  }
  return out;
}
