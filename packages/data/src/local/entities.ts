import {
  BodyMeasurement,
  BodyWeight,
  CardioSession,
  Exercise,
  Profile,
  SessionExercise,
  StrengthSet,
  TrainingDay,
  TrainingDayExercise,
  TrainingPlan,
  WorkoutSession,
  type SyncEntity,
} from '@athlete/contracts';
import type { z } from 'zod';

/**
 * Metadatos de cada entidad sincronizable: tabla local (= tabla remota en `athlete3`),
 * columnas de negocio escribibles por el cliente y conversión fila ↔ contrato.
 *
 * El formato "de cable" (payload de push y `record` de pull) es la fila en snake_case.
 * Es interno de @athlete/data: la UI solo ve los tipos camelCase de @athlete/contracts.
 * Una prueba de integración verifica que `columns` coincide exactamente con
 * `athlete3_private.sync_writable_columns` de cada tabla del servidor.
 */
export type ColumnKind = 'text' | 'int' | 'real' | 'json';

/** Fila local decodificada (valores JS; arrays ya parseados). */
export type LocalRow = Record<string, unknown> & { id: string };

export type EntityMeta = {
  entity: SyncEntity;
  table: string;
  columns: Readonly<Record<string, ColumnKind>>;
  /** Hijos que reciben el tombstone en cascada (igual que el servidor). */
  children?: ReadonlyArray<{ entity: SyncEntity; fk: string }>;
  toContract: (row: LocalRow) => unknown;
};

export const COMMON_COLUMNS: Readonly<Record<string, ColumnKind>> = {
  id: 'text',
  user_id: 'text',
  created_at: 'text',
  updated_at: 'text',
  deleted_at: 'text',
  revision: 'int',
};

const camel = (s: string) => s.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());

/** snake → camel con renombres explícitos (p. ej. `distance_m` → `distanceMeters`). */
function camelize(row: LocalRow, renames: Record<string, string> = {}): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) out[renames[k] ?? camel(k)] = v;
  return out;
}

const parseWith = <S extends z.ZodType>(schema: S, renames?: Record<string, string>) => (row: LocalRow) =>
  schema.parse(camelize(row, renames));

export const ENTITIES: Readonly<Record<Exclude<SyncEntity, 'meal_entry' | 'nutrition_target'>, EntityMeta>> = {
  profile: {
    entity: 'profile',
    table: 'profiles',
    columns: {
      display_name: 'text', height_cm: 'real', initial_weight_kg: 'real', experience_level: 'text', goals: 'json', sports: 'json',
      time_zone: 'text', unit_system: 'text', load_unit: 'text', week_starts_on: 'int',
    },
    toContract: parseWith(Profile),
  },
  exercise: {
    entity: 'exercise',
    table: 'exercises',
    columns: {
      slug: 'text', name: 'text', modality: 'text', load_type: 'text', primary_muscle_group_ids: 'json',
      secondary_muscle_group_ids: 'json', equipment_ids: 'json', instructions: 'text', archived_at: 'text',
    },
    toContract: parseWith(Exercise, { user_id: 'ownerUserId' }),
  },
  training_plan: {
    entity: 'training_plan',
    table: 'training_plans',
    columns: { name: 'text', description: 'text', status: 'text', starts_on: 'text', ends_on: 'text' },
    children: [{ entity: 'training_day', fk: 'plan_id' }],
    toContract: parseWith(TrainingPlan),
  },
  training_day: {
    entity: 'training_day',
    table: 'training_days',
    columns: { plan_id: 'text', position: 'int', name: 'text', kind: 'text', notes: 'text' },
    children: [{ entity: 'training_day_exercise', fk: 'training_day_id' }],
    toContract: parseWith(TrainingDay),
  },
  training_day_exercise: {
    entity: 'training_day_exercise',
    table: 'training_day_exercises',
    columns: {
      training_day_id: 'text', exercise_id: 'text', position: 'int', target_sets: 'int', target_reps_min: 'int',
      target_reps_max: 'int', target_weight_kg: 'real', target_rir: 'real', target_rest_seconds: 'int',
      target_duration_seconds: 'int', target_distance_m: 'real', notes: 'text',
    },
    toContract: parseWith(TrainingDayExercise, { target_distance_m: 'targetDistanceMeters' }),
  },
  workout_session: {
    entity: 'workout_session',
    table: 'workout_sessions',
    columns: {
      status: 'text', training_day_id: 'text', title: 'text', started_at: 'text', ended_at: 'text',
      time_zone: 'text', local_date: 'text', source: 'text', notes: 'text',
    },
    children: [{ entity: 'session_exercise', fk: 'session_id' }],
    toContract: parseWith(WorkoutSession),
  },
  session_exercise: {
    entity: 'session_exercise',
    table: 'session_exercises',
    columns: { session_id: 'text', exercise_id: 'text', training_day_exercise_id: 'text', position: 'int', notes: 'text' },
    children: [{ entity: 'strength_set', fk: 'session_exercise_id' }],
    toContract: parseWith(SessionExercise),
  },
  strength_set: {
    entity: 'strength_set',
    table: 'strength_sets',
    columns: {
      session_exercise_id: 'text', position: 'int', set_type: 'text', weight_kg: 'real', reps: 'int', rir: 'real',
      rpe: 'real', rest_seconds: 'int', duration_seconds: 'int', distance_m: 'real', completed_at: 'text', notes: 'text',
    },
    toContract: parseWith(StrengthSet, { distance_m: 'distanceMeters' }),
  },
  cardio_session: {
    entity: 'cardio_session',
    table: 'cardio_sessions',
    columns: {
      activity: 'text', training_day_id: 'text', started_at: 'text', time_zone: 'text', local_date: 'text',
      duration_seconds: 'int', distance_m: 'real', rounds: 'int', reps: 'int', rpe: 'real',
      avg_heart_rate_bpm: 'int', max_heart_rate_bpm: 'int', swim_pool_type: 'text', swim_pool_length_m: 'real',
      swim_laps: 'int', swim_stroke: 'text', source: 'text', notes: 'text',
    },
    toContract: (row) => {
      const { swim_pool_type, swim_pool_length_m, swim_laps, swim_stroke, ...rest } = row;
      const swim = swim_pool_type == null ? null
        : { poolType: swim_pool_type, poolLengthMeters: swim_pool_length_m ?? null, laps: swim_laps ?? null, stroke: swim_stroke ?? null };
      return CardioSession.parse({ ...camelize(rest as LocalRow, { distance_m: 'distanceMeters' }), swim });
    },
  },
  body_weight: {
    entity: 'body_weight',
    table: 'body_weights',
    columns: { measured_at: 'text', time_zone: 'text', local_date: 'text', weight_kg: 'real', input_unit: 'text', source: 'text', notes: 'text' },
    toContract: parseWith(BodyWeight),
  },
  body_measurement: {
    entity: 'body_measurement',
    table: 'body_measurements',
    columns: {
      measured_at: 'text', time_zone: 'text', local_date: 'text', site: 'text', value_cm: 'real',
      input_unit: 'text', source: 'text', notes: 'text',
    },
    toContract: parseWith(BodyMeasurement),
  },
};

export type SupportedEntity = keyof typeof ENTITIES;

export function metaFor(entity: SyncEntity): EntityMeta | null {
  return (ENTITIES as Record<string, EntityMeta>)[entity] ?? null;
}

export function allColumns(meta: EntityMeta): Record<string, ColumnKind> {
  return { ...COMMON_COLUMNS, ...meta.columns };
}
