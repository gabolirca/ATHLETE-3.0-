import { effectiveDistance, pacePer100mSeconds, type CardioStatInput } from './cardio';
import { addDays, startOfWeek } from './time';

/** Resultado de un bloque en una fecha (AMRAP, por tiempo, rondas, EMOM). */
export type BlockResultPoint = {
  blockKey: string; name: string; format: string; localDate: string;
  roundsCompleted: number | null; extraReps: number | null; durationSeconds: number | null;
};
export type Benchmark = {
  key: string; name: string; format: string;
  points: BlockResultPoint[];
  best: BlockResultPoint; last: BlockResultPoint; previous: BlockResultPoint | null;
  /** Último contra el anterior: mejor, igual o peor. Null con un solo resultado. */
  trend: 'up' | 'same' | 'down' | null;
};

/** Mayor es mejor: AMRAP por rondas + reps; por tiempo, menos segundos; rondas/EMOM, más rondas. */
export function benchmarkScore(p: BlockResultPoint): number | null {
  if (p.format === 'for_time') return p.durationSeconds ? -p.durationSeconds : null;
  if (p.roundsCompleted === null) return null;
  return p.format === 'amrap' ? p.roundsCompleted * 10_000 + (p.extraReps ?? 0) : p.roundsCompleted;
}

/** Agrupa los resultados por bloque (el mismo bloque del programa a lo largo de las semanas). */
export function benchmarks(points: readonly BlockResultPoint[]): Benchmark[] {
  const groups = new Map<string, BlockResultPoint[]>();
  for (const p of points) if (benchmarkScore(p) !== null) groups.set(p.blockKey, [...(groups.get(p.blockKey) ?? []), p]);
  return [...groups.entries()].map(([key, list]): Benchmark => {
    const sorted = [...list].sort((a, b) => a.localDate.localeCompare(b.localDate));
    const best = sorted.reduce((a, b) => (benchmarkScore(b)! > benchmarkScore(a)! ? b : a));
    const last = sorted[sorted.length - 1]!;
    const previous = sorted.length > 1 ? sorted[sorted.length - 2]! : null;
    const diff = previous ? benchmarkScore(last)! - benchmarkScore(previous)! : null;
    return { key, name: last.name, format: last.format, points: sorted, best, last, previous, trend: diff === null ? null : diff > 0 ? 'up' : diff < 0 ? 'down' : 'same' };
  }).sort((a, b) => b.last.localDate.localeCompare(a.last.localDate));
}

/** Metros por semana (lunes a domingo) de una actividad en las últimas `weeks` semanas, de la más antigua a la actual. */
export function weeklyMeters(sessions: readonly CardioStatInput[], activity: CardioStatInput['activity'], today: string, weeks = 8): Array<{ weekStart: string; meters: number }> {
  const current = startOfWeek(today, 1);
  const starts = Array.from({ length: weeks }, (_, i) => addDays(current, -7 * (weeks - 1 - i)));
  const out = new Map(starts.map((w) => [w, 0]));
  for (const s of sessions) {
    if (s.activity !== activity) continue;
    const w = startOfWeek(s.localDate, 1);
    if (out.has(w)) out.set(w, out.get(w)! + (effectiveDistance(s) ?? 0));
  }
  return starts.map((w) => ({ weekStart: w, meters: Math.round(out.get(w)!) }));
}

/** Ritmo por 100 m de cada sesión de natación con distancia (≥ 200 m), de la más antigua a la más reciente. */
export function swimPaces(sessions: readonly CardioStatInput[]): Array<{ localDate: string; pace: number; meters: number }> {
  return sessions.filter((s) => s.activity === 'swim').flatMap((s) => {
    const m = effectiveDistance(s);
    const pace = m !== null && m >= 200 ? pacePer100mSeconds(s.durationSeconds, m) : null;
    return pace === null ? [] : [{ localDate: s.localDate, pace, meters: m! }];
  }).sort((a, b) => a.localDate.localeCompare(b.localDate));
}

/** Número de semana del programa (desde que se empezó) y su lugar en un ciclo de `cycle` semanas (la última es de descarga). */
export function programCycle(startedOn: string, today: string, cycle = 6): { week: number; cycleWeek: number; cycleLength: number; deloadWeek: boolean } {
  const diff = Math.round((Date.parse(`${startOfWeek(today, 1)}T12:00:00Z`) - Date.parse(`${startOfWeek(startedOn, 1)}T12:00:00Z`)) / (7 * 86_400_000));
  const week = Math.max(1, diff + 1);
  const cycleWeek = ((week - 1) % cycle) + 1;
  return { week, cycleWeek, cycleLength: cycle, deloadWeek: cycleWeek === cycle };
}
