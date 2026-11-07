import type { CardioActivity, LogCardioSessionInput, SwimStroke } from '@athlete/contracts';
import { atLocalTime, localDateOfDevice } from '@/lib/localDate';
import { formatDuration, pacePer100mSeconds, paceSecondsPerKm, speedKmh, swimDistanceFromLaps } from '@athlete/domain';

/**
 * Lógica pura del registro de cardio: convierte lo que escribe el usuario en la entrada del contrato y da formato a
 * lo guardado. Sin React ni almacenamiento, para poder probarla de forma aislada.
 */

export type UnitSystem = 'metric' | 'imperial';
export type CardioDraft = Omit<LogCardioSessionInput, 'id'>;

const METERS_PER_MILE = 1609.344;

export const ACTIVITIES: ReadonlyArray<{ key: CardioActivity; label: string; icon: string }> = [
  { key: 'run', label: 'Correr', icon: 'walk-outline' },
  { key: 'walk', label: 'Caminar', icon: 'footsteps-outline' },
  { key: 'bike', label: 'Bici', icon: 'bicycle-outline' },
  { key: 'swim', label: 'Nadar', icon: 'water-outline' },
  { key: 'row', label: 'Remo', icon: 'boat-outline' },
  { key: 'circuit', label: 'Circuito', icon: 'repeat-outline' },
  { key: 'hybrid', label: 'Híbrido', icon: 'flash-outline' },
];

export const STROKES: ReadonlyArray<{ key: SwimStroke; label: string }> = [
  { key: 'freestyle', label: 'Libre' },
  { key: 'backstroke', label: 'Dorso' },
  { key: 'breaststroke', label: 'Pecho' },
  { key: 'butterfly', label: 'Mariposa' },
  { key: 'mixed', label: 'Combinado' },
];

export function activityLabel(activity: CardioActivity): string {
  return ACTIVITIES.find((a) => a.key === activity)?.label ?? activity;
}

/** Qué campos tiene sentido pedir para cada actividad. */
export function fieldsFor(activity: CardioActivity) {
  return {
    distance: activity !== 'circuit',
    rounds: activity === 'circuit' || activity === 'hybrid',
    swim: activity === 'swim',
  };
}

export type CardioFormValues = {
  activity: CardioActivity;
  /** Día local (YYYY-MM-DD). Vacío = hoy. */
  date: string;
  /** Hora de inicio `HH:MM` (24 h). Vacía = terminó ahora mismo (solo si el día es hoy). */
  startTime: string;
  hours: string;
  minutes: string;
  seconds: string;
  /** km (métrico) o mi (imperial). En natación, metros. */
  distance: string;
  rounds: string;
  rpe: number | null;
  avgHeartRate: string;
  maxHeartRate: string;
  poolLength: string;
  laps: string;
  stroke: SwimStroke | null;
  openWater: boolean;
  notes: string;
};

export const EMPTY_FORM: CardioFormValues = {
  activity: 'run', date: '', startTime: '', hours: '', minutes: '', seconds: '', distance: '', rounds: '',
  rpe: null, avgHeartRate: '', maxHeartRate: '', poolLength: '25', laps: '', stroke: null, openWater: false, notes: '',
};

export type CardioFormErrors = Partial<Record<keyof CardioFormValues | 'form', string>>;
export type ParseResult = { ok: true; draft: CardioDraft } | { ok: false; errors: CardioFormErrors };

/** Número del usuario: acepta coma o punto decimal. Vacío → null. Texto inválido → NaN. */
export function parseNumber(raw: string): number | null {
  const t = raw.trim().replace(',', '.');
  if (t === '') return null;
  if (!/^\d+(\.\d+)?$/.test(t)) return Number.NaN;
  return Number(t);
}

function parseInteger(raw: string): number | null {
  const n = parseNumber(raw);
  return n === null || Number.isNaN(n) ? n : Number.isInteger(n) ? n : Number.NaN;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function parseCardioForm(values: CardioFormValues, context: { now: Date; unitSystem: UnitSystem; timeZone: string }): ParseResult {
  const errors: CardioFormErrors = {};
  const fields = fieldsFor(values.activity);

  // Duración
  const h = parseInteger(values.hours) ?? 0;
  const m = parseInteger(values.minutes) ?? 0;
  const s = parseInteger(values.seconds) ?? 0;
  let durationSeconds = 0;
  if ([h, m, s].some((v) => Number.isNaN(v)) || m >= 60 || s >= 60) errors.minutes = 'Escribe horas, minutos (0–59) y segundos (0–59) con números enteros.';
  else {
    durationSeconds = h * 3600 + m * 60 + s;
    if (durationSeconds < 1) errors.minutes = 'La duración es obligatoria.';
    else if (durationSeconds > 86_400) errors.minutes = 'La duración no puede superar 24 horas.';
  }

  // Momento de inicio
  let startedAt: Date | null = null;
  const today = localDateOfDevice(context.now);
  const date = values.date || today;
  const time = values.startTime.trim();
  if (date > today) errors.startTime = 'No puedes registrar días futuros.';
  else if (time === '') {
    if (date !== today) errors.startTime = 'Indica a qué hora empezaste.';
    else if (!errors.minutes) startedAt = new Date(context.now.getTime() - durationSeconds * 1000);
  } else {
    const match = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(time);
    if (!match) errors.startTime = 'Usa el formato HH:MM, por ejemplo 07:30.';
    else {
      startedAt = atLocalTime(date, Number(match[1]), Number(match[2]));
      if (startedAt.getTime() > context.now.getTime()) {
        errors.startTime = date === today ? 'Esa hora todavía no llega hoy. Si fue ayer, cambia el día.' : 'La hora de inicio no puede estar en el futuro.';
      }
    }
  }

  // Distancia
  let distanceMeters: number | null = null;
  if (fields.distance) {
    const d = parseNumber(values.distance);
    if (Number.isNaN(d) || (d !== null && d <= 0)) errors.distance = 'Escribe una distancia mayor que cero o déjala vacía.';
    else if (d !== null) {
      distanceMeters = values.activity === 'swim' ? d : round2(d * (context.unitSystem === 'imperial' ? METERS_PER_MILE : 1000));
      if (distanceMeters > 1_000_000) errors.distance = 'La distancia es demasiado grande.';
    }
  }

  // Rondas
  let rounds: number | null = null;
  if (fields.rounds) {
    rounds = parseInteger(values.rounds);
    if (Number.isNaN(rounds) || (rounds !== null && (rounds < 0 || rounds > 10_000))) { errors.rounds = 'Las rondas deben ser un número entero.'; rounds = null; }
  }

  // Frecuencia cardiaca
  const avg = parseInteger(values.avgHeartRate);
  const max = parseInteger(values.maxHeartRate);
  const hrOk = (v: number | null) => v === null || (!Number.isNaN(v) && v >= 25 && v <= 250);
  if (!hrOk(avg)) errors.avgHeartRate = 'La frecuencia cardiaca debe estar entre 25 y 250.';
  if (!hrOk(max)) errors.maxHeartRate = 'La frecuencia cardiaca debe estar entre 25 y 250.';
  if (hrOk(avg) && hrOk(max) && avg !== null && max !== null && avg > max) errors.avgHeartRate = 'La media no puede ser mayor que la máxima.';

  // Natación
  let swim: CardioDraft['swim'] = null;
  if (fields.swim) {
    if (values.openWater) swim = { poolType: 'open_water', poolLengthMeters: null, laps: null, stroke: values.stroke };
    else {
      const pool = parseNumber(values.poolLength);
      const laps = parseInteger(values.laps);
      if (Number.isNaN(pool) || (pool !== null && (pool <= 0 || pool > 100))) errors.poolLength = 'El largo de la alberca debe estar entre 1 y 100 m.';
      if (Number.isNaN(laps) || (laps !== null && laps < 0)) errors.laps = 'Los largos deben ser un número entero.';
      if (!errors.poolLength && !errors.laps) swim = { poolType: 'pool', poolLengthMeters: pool, laps, stroke: values.stroke };
    }
  }

  if (values.notes.length > 2000) errors.notes = 'Las notas no pueden superar 2000 caracteres.';
  if (Object.keys(errors).length > 0 || startedAt === null) return { ok: false, errors };

  return {
    ok: true,
    draft: {
      activity: values.activity,
      startedAt: startedAt.toISOString(),
      timeZone: context.timeZone,
      durationSeconds,
      distanceMeters,
      rounds,
      rpe: values.rpe,
      avgHeartRateBpm: avg,
      maxHeartRateBpm: max,
      swim,
      notes: values.notes.trim() === '' ? null : values.notes.trim(),
    },
  };
}

export type CardioLike = {
  activity: CardioActivity;
  durationSeconds: number;
  distanceMeters?: number | null;
  swim?: CardioDraft['swim'] | null;
};

/** Textos para mostrar una actividad guardada. Nunca inventa un valor que no se registró. */
export function describeCardio(c: CardioLike, unitSystem: UnitSystem) {
  const distanceMeters = c.activity === 'swim' ? swimDistanceFromLaps({ distanceMeters: c.distanceMeters ?? null, swim: c.swim ?? null }) : (c.distanceMeters ?? null);
  const imperial = unitSystem === 'imperial';
  let distance: string | null = null;
  let pace: string | null = null;
  if (distanceMeters !== null) {
    if (c.activity === 'swim') {
      distance = `${Math.round(distanceMeters)} m`;
      const p = pacePer100mSeconds(c.durationSeconds, distanceMeters);
      pace = p === null ? null : `${formatDuration(p)} /100 m`;
    } else {
      const value = imperial ? distanceMeters / METERS_PER_MILE : distanceMeters / 1000;
      distance = `${value.toFixed(2)} ${imperial ? 'mi' : 'km'}`;
      if (c.activity === 'bike') {
        const kmh = speedKmh(c.durationSeconds, distanceMeters);
        pace = kmh === null ? null : imperial ? `${(kmh / 1.609344).toFixed(1)} mi/h` : `${kmh.toFixed(1)} km/h`;
      } else {
        const perKm = paceSecondsPerKm(c.durationSeconds, distanceMeters);
        pace = perKm === null ? null : imperial ? `${formatDuration(perKm * 1.609344)} /mi` : `${formatDuration(perKm)} /km`;
      }
    }
  }
  return { label: activityLabel(c.activity), duration: formatDuration(c.durationSeconds), distance, pace };
}
