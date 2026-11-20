import type { BodyMeasurement, ExerciseRecord } from '@/data/trainingTypes';
import { MONTHS, shiftDay } from '@/lib/localDate';

/** Meta de días por semana: la que contestó en la bienvenida ("4 días por semana"); 4 si no la dio. */
export function weeklyGoal(goals: readonly string[]): number {
  for (const g of goals) { const m = /^(\d) días por semana$/.exec(g); if (m) return Number(m[1]); }
  return 4;
}

/** Los récords más recientes primero (los más nuevos motivan más que el más pesado). */
export function recentRecords(records: readonly ExerciseRecord[], n = 4): ExerciseRecord[] {
  return [...records].sort((a, b) => b.measuredAt.localeCompare(a.measuredAt)).slice(0, n);
}

export type Trend = { latest: number; change: number | null; weeks: number; points: number[] };

/** Tendencia de una medida: último valor, cambio contra el primero de la ventana y los puntos para la gráfica. */
export function bodyTrend(measurements: readonly BodyMeasurement[], type: BodyMeasurement['type'], now: Date, weeks = 8): Trend | null {
  const from = now.getTime() - weeks * 7 * 86_400_000;
  const mine = measurements.filter((m) => m.type === type).sort((a, b) => a.measuredAt.localeCompare(b.measuredAt));
  if (!mine.length) return null;
  const window = mine.filter((m) => Date.parse(m.measuredAt) >= from);
  const series = window.length ? window : [mine[mine.length - 1]!];
  const latest = series[series.length - 1]!.value;
  const first = series[0]!;
  const spanWeeks = Math.max(1, Math.round((Date.parse(series[series.length - 1]!.measuredAt) - Date.parse(first.measuredAt)) / (7 * 86_400_000)));
  return { latest, change: series.length > 1 ? Math.round((latest - first.value) * 10) / 10 : null, weeks: spanWeeks, points: series.slice(-12).map((m) => m.value) };
}

/** Coordenadas de la línea (y de la meta) en una caja de `w`×`h`, con margen para que nada toque el borde. */
export function chartPath(points: readonly number[], goal: number | null, w: number, h: number): { line: string; last: { x: number; y: number }; goalY: number | null } {
  const values = goal === null ? points : [...points, goal];
  const min = Math.min(...values), max = Math.max(...values);
  const span = max - min || 1;
  const pad = 8;
  const y = (v: number) => pad + (1 - (v - min) / span) * (h - pad * 2);
  const x = (i: number) => (points.length === 1 ? w / 2 : pad + (i / (points.length - 1)) * (w - pad * 2));
  const coords = points.map((v, i) => ({ x: Math.round(x(i)), y: Math.round(y(v)) }));
  return { line: coords.map((c) => `${c.x},${c.y}`).join(' '), last: coords[coords.length - 1]!, goalY: goal === null ? null : Math.round(y(goal)) };
}

const MONTH_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const mondayOf = (localDate: string) => {
  const [y, m, d] = localDate.split('-').map(Number) as [number, number, number];
  const dow = (new Date(y, m - 1, d).getDay() + 6) % 7; // 0 = lunes
  return shiftDay(localDate, -dow);
};

export type WeekBucket = { start: string; count: number; current: boolean; label: string };

/** Sesiones (fuerza + cardio) por semana, de lunes a domingo; la semana actual al final. */
export function weeklySessions(dates: readonly string[], today: string, weeks = 8): WeekBucket[] {
  const thisMonday = mondayOf(today);
  const buckets: WeekBucket[] = Array.from({ length: weeks }, (_, i) => {
    const start = shiftDay(thisMonday, -7 * (weeks - 1 - i));
    return { start, count: 0, current: i === weeks - 1, label: `${Number(start.slice(8, 10))} ${MONTH_SHORT[Number(start.slice(5, 7)) - 1]}` };
  });
  const first = buckets[0]!.start;
  for (const d of dates) {
    if (d < first || d > shiftDay(thisMonday, 6)) continue;
    const b = buckets.find((x) => x.start === mondayOf(d));
    if (b) b.count += 1;
  }
  return buckets;
}

/** Resumen del mes en curso para el encabezado de Progreso. */
export function monthSummary(input: { workouts: ReadonlyArray<{ localDate: string; sets: number }>; cardioDates: readonly string[]; recordDates: readonly string[] }, today: string) {
  const prefix = today.slice(0, 7);
  const w = input.workouts.filter((x) => x.localDate.startsWith(prefix));
  const cardio = input.cardioDates.filter((d) => d.startsWith(prefix)).length;
  return {
    sessions: w.length + cardio,
    sets: w.reduce((n, x) => n + x.sets, 0),
    records: input.recordDates.filter((d) => d.startsWith(prefix)).length,
    monthName: MONTHS[Number(prefix.slice(5, 7)) - 1] ?? '',
  };
}
