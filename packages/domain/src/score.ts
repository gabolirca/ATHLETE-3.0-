import { estimateE1rm, isEffectiveSet, type SetLike } from './strength';

/**
 * Calificación de una sesión de fuerza (0–100), transparente: cada parte dice cuánto aportó y por qué.
 * Solo cuentan las partes que aplican (sin plan no hay "cumplimiento"; sin RIR no hay "esfuerzo"; sin
 * historial no hay "progreso") y el total se reescala sobre lo que sí aplica.
 */
export type ScoreSet = SetLike & { rir: number | null };
export type ScoreExercise = {
  setsTarget: number | null;
  targetRir: number | null;
  sets: readonly ScoreSet[];
  /** Mejor 1RM estimado de la vez anterior en este ejercicio (null si no hay historial comparable). */
  previousBestE1rm: number | null;
};
export type ScoreComponentKey = 'completion' | 'effort' | 'progress' | 'volume';
export type ScoreComponent = { key: ScoreComponentKey; label: string; points: number; max: number; detail: string };
export type SessionScore = { score: number; grade: 'Excelente' | 'Sólida' | 'Aceptable' | 'Ligera'; components: ScoreComponent[] };

export const SCORE_WEIGHTS: Record<ScoreComponentKey, number> = { completion: 40, effort: 25, progress: 20, volume: 15 };
/** Series efectivas con las que la parte de volumen queda completa. */
export const FULL_VOLUME_SETS = 12;
/** Igualar la vez pasada cuenta como progreso si el 1RM estimado no cae más de 2.5 %. */
export const PROGRESS_TOLERANCE = 0.975;

const round1 = (n: number) => Math.round(n * 10) / 10;

export function scoreSession(exercises: readonly ScoreExercise[]): SessionScore | null {
  const effective = exercises.map((e) => e.sets.filter(isEffectiveSet));
  const total = effective.reduce((n, s) => n + s.length, 0);
  if (!total) return null;
  const components: ScoreComponent[] = [];

  const planned = exercises.map((e, i) => ({ target: e.setsTarget ?? 0, done: effective[i]!.length })).filter((p) => p.target > 0);
  if (planned.length) {
    const target = planned.reduce((n, p) => n + p.target, 0);
    const done = planned.reduce((n, p) => n + Math.min(p.done, p.target), 0);
    components.push({ key: 'completion', label: 'Cumplimiento', max: SCORE_WEIGHTS.completion, points: round1((SCORE_WEIGHTS.completion * done) / target), detail: `${done} de ${target} series del plan` });
  }

  const rated = exercises.flatMap((e, i) => effective[i]!.filter((s) => s.rir !== null).map((s) => ({ rir: s.rir!, limit: (e.targetRir ?? 2) + 1 })));
  if (rated.length) {
    const inZone = rated.filter((r) => r.rir <= Math.min(4, r.limit)).length;
    components.push({ key: 'effort', label: 'Esfuerzo', max: SCORE_WEIGHTS.effort, points: round1((SCORE_WEIGHTS.effort * inZone) / rated.length), detail: `${inZone} de ${rated.length} series cerca de tu objetivo de esfuerzo` });
  }

  const compared = exercises.flatMap((e, i) => {
    if (e.previousBestE1rm === null) return [];
    const best = Math.max(0, ...effective[i]!.map((s) => estimateE1rm(s.weightKg, s.reps) ?? 0));
    return best > 0 ? [best >= e.previousBestE1rm * PROGRESS_TOLERANCE] : [];
  });
  if (compared.length) {
    const kept = compared.filter(Boolean).length;
    components.push({ key: 'progress', label: 'Progreso', max: SCORE_WEIGHTS.progress, points: round1((SCORE_WEIGHTS.progress * kept) / compared.length), detail: `${kept} de ${compared.length} ejercicios igualaron o superaron la vez pasada` });
  }

  components.push({ key: 'volume', label: 'Volumen', max: SCORE_WEIGHTS.volume, points: round1(SCORE_WEIGHTS.volume * Math.min(1, total / FULL_VOLUME_SETS)), detail: `${total} ${total === 1 ? 'serie efectiva' : 'series efectivas'}` });

  const max = components.reduce((n, c) => n + c.max, 0);
  const score = Math.round((100 * components.reduce((n, c) => n + c.points, 0)) / max);
  const grade = score >= 85 ? 'Excelente' : score >= 70 ? 'Sólida' : score >= 50 ? 'Aceptable' : 'Ligera';
  return { score, grade, components };
}
