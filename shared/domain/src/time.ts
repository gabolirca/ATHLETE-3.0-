import type { IsoDateTime, LocalDate, TimeZone } from '@athlete/contracts';

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: TimeZone): Intl.DateTimeFormat {
  let formatter = formatterCache.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    formatterCache.set(timeZone, formatter);
  }
  return formatter;
}

/**
 * Fecha deportiva local de un instante en la zona del atleta (data-model §7).
 * Nunca usar `instant.slice(0, 10)`: un entrenamiento a las 22:00 en Ciudad de México
 * es el día siguiente en UTC.
 */
export function localDateOf(instant: IsoDateTime, timeZone: TimeZone): LocalDate {
  const date = new Date(instant);
  if (Number.isNaN(date.getTime())) throw new RangeError(`Instante no válido: ${instant}`);
  const parts = formatterFor(timeZone).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function parseLocalDate(localDate: LocalDate): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(localDate);
  if (!match) throw new RangeError(`Fecha local no válida: ${localDate}`);
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function formatUtcDay(epochMs: number): LocalDate {
  return new Date(epochMs).toISOString().slice(0, 10);
}

const DAY_MS = 86_400_000;

/** Aritmética de calendario sobre fechas locales (sin zona: no le afectan cambios de horario). */
export function addDays(localDate: LocalDate, days: number): LocalDate {
  return formatUtcDay(parseLocalDate(localDate) + days * DAY_MS);
}

/** 0 = domingo … 6 = sábado. */
export function dayOfWeek(localDate: LocalDate): number {
  return new Date(parseLocalDate(localDate)).getUTCDay();
}

/**
 * Inicio de la semana que contiene `localDate`. Por defecto lunes (ISO 8601).
 * La especificación no fija el inicio de semana: es un parámetro, no una suposición.
 */
export function startOfWeek(localDate: LocalDate, weekStartsOn = 1): LocalDate {
  const offset = (dayOfWeek(localDate) - weekStartsOn + 7) % 7;
  return addDays(localDate, -offset);
}

export function weekDates(localDate: LocalDate, weekStartsOn = 1): LocalDate[] {
  const start = startOfWeek(localDate, weekStartsOn);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

export function isWithinRange(localDate: LocalDate, from?: LocalDate, to?: LocalDate): boolean {
  return (from === undefined || localDate >= from) && (to === undefined || localDate <= to);
}

/** Segundos entre dos instantes; null si falta el fin o si es anterior al inicio. */
export function elapsedSeconds(start: IsoDateTime, end: IsoDateTime | null): number | null {
  if (end === null) return null;
  const diff = (new Date(end).getTime() - new Date(start).getTime()) / 1000;
  return Number.isFinite(diff) && diff >= 0 ? Math.floor(diff) : null;
}

export function compareInstants(a: IsoDateTime, b: IsoDateTime): number {
  return new Date(a).getTime() - new Date(b).getTime();
}
