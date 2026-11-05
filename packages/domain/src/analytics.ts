import type { CardioSession, LocalDate, MealEntry, NutritionDaySummary, WorkoutSession } from '@athlete/contracts';
import { elapsedSeconds, weekDates } from './time';

export type DayActivity = {
  localDate: LocalDate;
  strengthSessions: number;
  cardioSessions: number;
  activeSeconds: number;
};

export type WeekSummary = {
  weekStart: LocalDate;
  weekEnd: LocalDate;
  completedStrengthSessions: number;
  cardioSessions: number;
  activeSeconds: number;
  activeDays: number;
  /** Sesiones de fuerza completadas sin hora de fin: no suman minutos (no se estiman). */
  strengthSessionsWithoutDuration: number;
  days: DayActivity[];
};

type StrengthLike = Pick<WorkoutSession, 'status' | 'deletedAt' | 'localDate' | 'startedAt' | 'endedAt'>;
type CardioLike = Pick<CardioSession, 'deletedAt' | 'localDate' | 'durationSeconds'>;

/**
 * Actividad semanal para el dashboard (especificación §6.2). Agrupa por `localDate` del
 * registro (ya calculada en la zona del atleta), nunca por fecha UTC.
 */
export function summarizeWeek(
  anyDateInWeek: LocalDate,
  strength: readonly StrengthLike[],
  cardio: readonly CardioLike[],
  weekStartsOn = 1,
): WeekSummary {
  const dates = weekDates(anyDateInWeek, weekStartsOn);
  const days = new Map<LocalDate, DayActivity>(
    dates.map((d) => [d, { localDate: d, strengthSessions: 0, cardioSessions: 0, activeSeconds: 0 }]),
  );
  let strengthSessionsWithoutDuration = 0;

  for (const s of strength) {
    const day = days.get(s.localDate);
    if (!day || s.deletedAt !== null || s.status !== 'completed') continue;
    day.strengthSessions++;
    const secs = elapsedSeconds(s.startedAt, s.endedAt);
    if (secs === null) strengthSessionsWithoutDuration++;
    else day.activeSeconds += secs;
  }
  for (const c of cardio) {
    const day = days.get(c.localDate);
    if (!day || c.deletedAt !== null) continue;
    day.cardioSessions++;
    day.activeSeconds += c.durationSeconds;
  }

  const list = [...days.values()];
  return {
    weekStart: dates[0] as LocalDate,
    weekEnd: dates[6] as LocalDate,
    completedStrengthSessions: list.reduce((n, d) => n + d.strengthSessions, 0),
    cardioSessions: list.reduce((n, d) => n + d.cardioSessions, 0),
    activeSeconds: list.reduce((n, d) => n + d.activeSeconds, 0),
    activeDays: list.filter((d) => d.strengthSessions + d.cardioSessions > 0).length,
    strengthSessionsWithoutDuration,
    days: list,
  };
}

type NutrientKey = 'energyKcal' | 'proteinG' | 'carbsG' | 'fatG';

/** Totales diarios. Cada total es null si ninguna entrada tiene ese valor. */
export function summarizeNutritionDay(
  localDate: LocalDate,
  entries: readonly Pick<MealEntry, 'localDate' | 'deletedAt' | NutrientKey>[],
): NutritionDaySummary {
  const live = entries.filter((e) => e.localDate === localDate && e.deletedAt === null);
  const total = (key: NutrientKey): number | null =>
    live.reduce<number | null>((acc, e) => (e[key] === null ? acc : (acc ?? 0) + e[key]), null);
  return {
    localDate,
    entryCount: live.length,
    energyKcal: total('energyKcal'),
    proteinG: total('proteinG'),
    carbsG: total('carbsG'),
    fatG: total('fatG'),
    entriesMissingEnergy: live.filter((e) => e.energyKcal === null).length,
  };
}
