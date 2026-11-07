/**
 * Fechas locales (YYYY-MM-DD) en la zona horaria del teléfono. Sin librerías: solo Date local.
 * Se usan para elegir el día de comidas y actividades.
 */
const pad = (n: number) => String(n).padStart(2, '0');

export function localDateOfDevice(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function parseLocalDate(localDate: string): { year: number; month: number; day: number } {
  const [year, month, day] = localDate.split('-').map(Number) as [number, number, number];
  return { year, month, day };
}

export const isLocalDate = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);

export function shiftDay(localDate: string, days: number): string {
  const { year, month, day } = parseLocalDate(localDate);
  return localDateOfDevice(new Date(year, month - 1, day + days));
}

/** Fecha local + hora HH:MM → instante (en la zona del teléfono). */
export function atLocalTime(localDate: string, hours: number, minutes: number): Date {
  const { year, month, day } = parseLocalDate(localDate);
  return new Date(year, month - 1, day, hours, minutes, 0, 0);
}

export const WEEKDAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
export const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/** "Hoy", "Ayer" o "martes 3 nov". */
export function dayLabel(localDate: string, today: string): string {
  if (localDate === today) return 'Hoy';
  if (shiftDay(today, -1) === localDate) return 'Ayer';
  const { year, month, day } = parseLocalDate(localDate);
  const date = new Date(year, month - 1, day);
  const label = `${WEEKDAYS[date.getDay()]} ${day} ${MONTHS[month - 1]!.slice(0, 3)}`;
  return year === parseLocalDate(today).year ? label : `${label} ${year}`;
}

/**
 * Semanas del mes (lunes a domingo). Cada celda es la fecha local o null fuera del mes.
 * `month` es 1–12.
 */
export function monthGrid(year: number, month: number): Array<Array<string | null>> {
  const first = new Date(year, month - 1, 1);
  const daysInMonth = new Date(year, month, 0).getDate();
  const offset = (first.getDay() + 6) % 7; // lunes = 0
  const cells: Array<string | null> = Array.from({ length: offset }, () => null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(`${year}-${pad(month)}-${pad(d)}`);
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: Array<Array<string | null>> = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}
