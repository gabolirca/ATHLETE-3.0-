import { addDays, startOfWeek } from './time';

/**
 * Carga de sesión (método de Foster): RPE de la sesión (1–10) × minutos = unidades arbitrarias (UA).
 * Es la métrica que permite sumar fuerza, WOD, natación y carrera en una sola gráfica semanal.
 * Sin RPE no hay carga: no se inventa.
 */
export type LoadKind = 'strength' | 'conditioning' | 'cardio';
export type LoadItem = { localDate: string; minutes: number; rpe: number | null; kind: LoadKind };

export function sessionLoad(rpe: number | null, minutes: number): number | null {
  if (rpe === null || !(minutes > 0)) return null;
  return Math.round(rpe * minutes);
}

/** Lunes de la semana de una fecha local `YYYY-MM-DD`. */
export const weekStartOf = (localDate: string): string => startOfWeek(localDate, 1);

export type WeekLoad = { weekStart: string; total: number; byKind: Record<LoadKind, number>; sessions: number; missingRpe: number };

/** Carga por semana (lunes a domingo), de la más antigua a la actual. `weeks` incluye la semana en curso. */
export function weeklyLoads(items: readonly LoadItem[], today: string, weeks = 4): WeekLoad[] {
  const current = weekStartOf(today);
  const starts = Array.from({ length: weeks }, (_, i) => addDays(current, -7 * (weeks - 1 - i)));
  const out = new Map(starts.map((w) => [w, { weekStart: w, total: 0, byKind: { strength: 0, conditioning: 0, cardio: 0 }, sessions: 0, missingRpe: 0 } as WeekLoad]));
  for (const item of items) {
    const w = out.get(weekStartOf(item.localDate));
    if (!w) continue;
    w.sessions += 1;
    const load = sessionLoad(item.rpe, item.minutes);
    if (load === null) { w.missingRpe += 1; continue; }
    w.total += load;
    w.byKind[item.kind] += load;
  }
  return starts.map((w) => out.get(w)!);
}

export type LoadTrend = { ratio: number | null; status: 'low_data' | 'ok' | 'spike' };

/**
 * Semana actual contra el promedio de las anteriores con carga (aguda : crónica). Por encima de 1.5 hay un pico de
 * carga (riesgo de fatiga): conviene bajar o planear una descarga. Referencia general, no un diagnóstico.
 * Solo avisa de picos: la semana en curso aún no termina, así que una cifra baja no significa que vaya ligera.
 */
export function loadTrend(weeks: readonly WeekLoad[]): LoadTrend {
  if (weeks.length < 3) return { ratio: null, status: 'low_data' };
  const current = weeks[weeks.length - 1]!;
  const previous = weeks.slice(0, -1).filter((w) => w.total > 0);
  if (previous.length < 2) return { ratio: null, status: 'low_data' };
  const avg = previous.reduce((n, w) => n + w.total, 0) / previous.length;
  const ratio = Math.round((current.total / avg) * 100) / 100;
  return { ratio, status: ratio > 1.5 ? 'spike' : 'ok' };
}
