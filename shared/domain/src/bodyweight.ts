/**
 * Peso corporal: el peso diario sube y baja por agua y comida, así que el plan se basa en el promedio de 7 días
 * y en su cambio contra la semana anterior. Más adelante es una variable del modelo de carga (Random Forest).
 */
export type WeightPoint = { localDate: string; kg: number };
export type WeightTrend = {
  /** Promedio de los últimos 7 días (incluye hoy); null sin pesajes en ese rango. */
  avg7: number | null;
  /** Promedio de los 7 días anteriores. */
  prevAvg7: number | null;
  /** avg7 − prevAvg7 en kg (positivo = subiendo). */
  weeklyChange: number | null;
  count7: number;
  latest: WeightPoint | null;
};

const dayNumber = (d: string) => Math.round(Date.parse(`${d}T12:00:00Z`) / 86_400_000);
const round1 = (n: number) => Math.round(n * 10) / 10;
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

export function weightTrend(points: readonly WeightPoint[], today: string): WeightTrend {
  const t = dayNumber(today);
  const ago = (p: WeightPoint) => t - dayNumber(p.localDate);
  const last7 = points.filter((p) => ago(p) >= 0 && ago(p) < 7).map((p) => p.kg);
  const prev7 = points.filter((p) => ago(p) >= 7 && ago(p) < 14).map((p) => p.kg);
  const a = mean(last7); const b = mean(prev7);
  const latest = [...points].filter((p) => ago(p) >= 0).sort((x, y) => y.localDate.localeCompare(x.localDate))[0] ?? null;
  return {
    avg7: a === null ? null : round1(a), prevAvg7: b === null ? null : round1(b),
    weeklyChange: a === null || b === null ? null : round1(a - b), count7: last7.length, latest,
  };
}

/** Cuánto falta para la meta (positivo = falta bajar si la meta es menor). null sin meta o sin dato. */
export function toGoal(current: number | null, goal: number | null): { remaining: number; direction: 'down' | 'up' | 'done' } | null {
  if (current === null || goal === null) return null;
  const diff = round1(current - goal);
  if (Math.abs(diff) < 0.1) return { remaining: 0, direction: 'done' };
  return { remaining: Math.abs(diff), direction: diff > 0 ? 'down' : 'up' };
}
