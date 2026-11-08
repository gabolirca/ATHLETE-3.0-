import { formatDuration } from '@athlete/domain';
import type { CardioActivity } from '@athlete/contracts';
import type { ProgramBlock, ProgramDay, ProgramExercise, SessionModality } from '@/data/trainingTypes';

export const WEEKDAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'] as const;
export const weekdayLabel = (n: number | null) => (n ? WEEKDAYS[n - 1] ?? '' : 'Sin día');
export const weekdayShort = (n: number | null) => weekdayLabel(n).slice(0, 3);
/** Día ISO de hoy en el teléfono: 1 = lunes … 7 = domingo. */
export const todayWeekday = (now = new Date()) => ((now.getDay() + 6) % 7) + 1;

export const MODALITY: Record<SessionModality, { label: string; icon: string; color: string }> = {
  strength: { label: 'Fuerza', icon: 'barbell-outline', color: '#1769FF' },
  conditioning: { label: 'Funcional', icon: 'flash-outline', color: '#F5B841' },
  swim: { label: 'Natación', icon: 'water-outline', color: '#3CC8E6' },
  run: { label: 'Carrera', icon: 'walk-outline', color: '#55D6A2' },
  bike: { label: 'Bici', icon: 'bicycle-outline', color: '#55D6A2' },
  row: { label: 'Remo', icon: 'boat-outline', color: '#55D6A2' },
  mobility: { label: 'Movilidad', icon: 'leaf-outline', color: '#9B7BFF' },
  rest: { label: 'Descanso', icon: 'moon-outline', color: '#626C7C' },
};
export const modalityInfo = (m: SessionModality | null) => MODALITY[m ?? 'strength'];

/** Las sesiones de nado/carrera/bici/remo se registran como una actividad de cardio; las demás, como entrenamiento por bloques. */
export function cardioActivityFor(m: SessionModality | null): CardioActivity | null {
  return m === 'swim' ? 'swim' : m === 'run' ? 'run' : m === 'bike' ? 'bike' : m === 'row' ? 'row' : null;
}

const seconds = (s: number) => (s >= 60 && s % 60 === 0 ? `${s / 60} min` : s >= 60 ? formatDuration(s) : `${s} s`);
const meters = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(m % 1000 ? 1 : 0)} km` : `${m} m`);

/** "3 × 5–6", "3 × 8 por lado", "3 × 40 s", "4 × 50 m", "400 m", "12", "5 min". */
export function formatPrescription(e: Pick<ProgramExercise, 'sets' | 'repsMin' | 'repsMax' | 'durationSeconds' | 'distanceMeters' | 'perSide'>): string {
  const reps = e.repsMin !== null ? (e.repsMax !== null && e.repsMax !== e.repsMin ? `${e.repsMin}–${e.repsMax}` : `${e.repsMin}`) : null;
  const what = reps ?? (e.distanceMeters !== null ? meters(e.distanceMeters) : e.durationSeconds !== null ? seconds(e.durationSeconds) : null);
  const side = e.perSide ? ' por lado' : '';
  if (e.sets && what) return `${e.sets} × ${what}${side}`;
  if (e.sets) return `${e.sets} series`;
  return what ? `${what}${side}` : '';
}

/** "AMRAP 15 min", "3 rondas · descanso 90 s", "Por tiempo · tope 20 min", "Continuo", y el RPE objetivo. */
export function formatBlock(b: Pick<ProgramBlock, 'format' | 'rounds' | 'timeCapSeconds' | 'restSeconds' | 'targetRpe'>): string {
  const cap = b.timeCapSeconds ? seconds(b.timeCapSeconds) : null;
  const parts: string[] = [];
  switch (b.format) {
    case 'amrap': parts.push(`AMRAP ${cap ?? ''}`.trim()); break;
    case 'emom': parts.push(`EMOM ${cap ?? ''}`.trim()); break;
    case 'for_time': parts.push(cap ? `Por tiempo · tope ${cap}` : 'Por tiempo'); break;
    case 'rounds': parts.push(b.rounds ? `${b.rounds} rondas` : 'Rondas'); break;
    case 'intervals': parts.push('Intervalos'); break;
    case 'continuous': parts.push('Continuo'); break;
    default: parts.push('Series');
  }
  if (b.restSeconds && b.format === 'rounds') parts.push(`descanso ${seconds(b.restSeconds)} entre rondas`);
  if (b.targetRpe) parts.push(`RPE ${b.targetRpe}`);
  return parts.join(' · ');
}

/** Metros planeados del día (natación y carrera). */
export function plannedMeters(day: ProgramDay): number {
  return day.blocks.flatMap((b) => b.exercises.map((e) => (e.distanceMeters ?? 0) * (e.sets ?? 1) * (b.format === 'rounds' ? b.rounds ?? 1 : 1)))
    .reduce((a, n) => a + n, 0);
}

/** Resumen de una sesión: "70 min · RPE 7.5" o "1,400 m · 50 min". */
export function daySummary(day: ProgramDay): string {
  const parts: string[] = [];
  const m = plannedMeters(day);
  if (cardioActivityFor(day.modality) && m) parts.push(`${m.toLocaleString('es-MX')} m`);
  if (day.targetDurationMinutes) parts.push(`${day.targetDurationMinutes} min`);
  if (day.targetRpe) parts.push(`RPE ${day.targetRpe}`);
  return parts.join(' · ');
}

/** Texto plano del plan de una sesión de cardio, para tenerlo a la mano en la alberca. */
export function cardioPlanText(day: ProgramDay): string[] {
  return day.blocks.map((b) => `${b.name}: ${b.exercises.map((e) => `${formatPrescription(e)}${e.restSeconds ? ` (desc. ${seconds(e.restSeconds)})` : ''}`).join(', ')}`);
}
