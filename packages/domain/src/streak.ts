import { addDays, dayOfWeek } from './time';

/**
 * Rachas pensadas para entrenamiento (no para hacer algo TODOS los días como Duolingo):
 * - Con programa: un día "cuenta" si entrenaste o si tu programa no tenía nada ese día (descanso planeado).
 *   Un día con sesión planeada y sin entrenar rompe la racha.
 * - Sin programa: se permite UN día de descanso seguido; dos días seguidos sin entrenar rompen la racha.
 * - Hoy no rompe la racha mientras no termine: si aún no entrenas, la racha sigue viva desde ayer.
 * Los días de descanso cuentan para la racha (te mantienen en ella), igual que en el programa.
 */
export type StreakInput = {
  /** Fechas locales (YYYY-MM-DD) con al menos una sesión terminada (fuerza o cardio). */
  activeDates: ReadonlySet<string>;
  today: string;
  /** Días ISO (1 = lunes … 7 = domingo) con sesión planeada. Null = sin programa. */
  plannedWeekdays: ReadonlySet<number> | null;
  /** No se cuenta antes de esta fecha (p. ej. el primer entrenamiento registrado). */
  since?: string;
};
export type Streak = {
  current: number;
  best: number;
  /** Hoy ya entrenaste. */
  todayDone: boolean;
  /** Hoy tienes sesión planeada y aún no la haces: si no entrenas hoy, mañana se pierde la racha. */
  atRisk: boolean;
  /** Días desde el último entrenamiento (0 = hoy). Null si nunca. */
  daysSinceLast: number | null;
};

const isoWeekday = (d: string) => ((dayOfWeek(d) + 6) % 7) + 1;

export function computeStreak({ activeDates, today, plannedWeekdays, since }: StreakInput): Streak {
  const sorted = [...activeDates].filter((d) => d <= today).sort();
  if (!sorted.length) return { current: 0, best: 0, todayDone: false, atRisk: Boolean(plannedWeekdays?.has(isoWeekday(today))), daysSinceLast: null };
  const start = since && since < sorted[0]! ? since : sorted[0]!;
  // Recorre del primer día al de hoy y cuenta tramos.
  let run = 0, best = 0, gap = 0;
  const days: Array<{ date: string; kept: boolean }> = [];
  for (let d = start; d <= today; d = addDays(d, 1)) {
    const trained = activeDates.has(d);
    let kept: boolean;
    if (trained) { kept = true; gap = 0; }
    else if (plannedWeekdays) kept = !plannedWeekdays.has(isoWeekday(d));
    else { gap += 1; kept = gap <= 1; }
    days.push({ date: d, kept });
  }
  // Hoy sin entrenar no rompe todavía: se evalúa sin él.
  const todayDone = activeDates.has(today);
  const evaluated = todayDone ? days : days.slice(0, -1);
  for (const day of evaluated) {
    run = day.kept ? run + 1 : 0;
    best = Math.max(best, run);
  }
  let current = run;
  // Un tramo que solo tiene descansos (sin ningún entrenamiento) no es racha.
  const tail = evaluated.slice(evaluated.length - current);
  if (!tail.some((d) => activeDates.has(d.date))) current = 0;
  // Si hoy es descanso planeado (o el día libre permitido) y no entrenaste, también suma.
  const last = sorted[sorted.length - 1]!;
  const daysSinceLast = Math.round((Date.parse(`${today}T12:00:00Z`) - Date.parse(`${last}T12:00:00Z`)) / 86_400_000);
  const plannedToday = plannedWeekdays ? plannedWeekdays.has(isoWeekday(today)) : daysSinceLast >= 1;
  return { current, best: Math.max(best, current), todayDone, atRisk: !todayDone && current > 0 && plannedToday, daysSinceLast };
}

/** Semanas seguidas (terminadas) cumpliendo al menos `threshold` del programa. La semana en curso suma si ya se cumplió. */
export function weeksStreak(weeks: ReadonlyArray<{ done: number; planned: number }>, threshold = 0.8): { current: number; best: number } {
  const ok = (w: { done: number; planned: number }) => w.planned > 0 && w.done / w.planned >= threshold;
  let run = 0, best = 0;
  const finished = weeks.slice(0, -1);
  for (const w of finished) { run = ok(w) ? run + 1 : 0; best = Math.max(best, run); }
  const current = weeks.length && ok(weeks[weeks.length - 1]!) ? run + 1 : run;
  return { current, best: Math.max(best, current) };
}
