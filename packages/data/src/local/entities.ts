import {
  BodyMeasurement,
  BodyWeight,
  CardioSession,
  Exercise,
  MealEntry,
  NutritionPlan,
  NutritionTarget,
  Profile,
  SessionExercise,
  StrengthSet,
  SessionBlockResult,
  TrainingBlock,
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
/** `bool` se guarda como INTEGER 0/1 en SQLite y se lee como boolean. */
export type ColumnKind = 'text' | 'int' | 'real' | 'json' | 'bool';

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

export const ENTITIES: Readonly<Record<SyncEntity, EntityMeta>> = {
  profile: {
    entity: 'profile',
    table: 'profiles',
    columns: {
      display_name: 'text', height_cm: 'real', initial_weight_kg: 'real', experience_level: 'text', goals: 'json', sports: 'json',
      time_zone: 'text', unit_system: 'text', load_unit: 'text', week_starts_on: 'int',
      goal_weight_kg: 'real', goal_waist_cm: 'real', goal_chest_cm: 'real', goal_hip_cm: 'real',
    },
    toContract: parseWith(Profile),
  },
  exercise: {
    entity: 'exercise',
    table: 'exercises',
    columns: {
      slug: 'text', name: 'text', modality: 'text', load_type: 'text', primary_muscle_group_ids: 'json',
      secondary_muscle_group_ids: 'json', equipment_ids: 'json', instructions: 'text', archived_at: 'text',
      movement_pattern: 'text', mechanics: 'text', is_unilateral: 'bool', access_tier: 'text',
    },
    // Valores seguros si una fila llega sin los rasgos de 0.6.0 (p. ej. un servidor aún sin migrar):
    // una fila incompleta no debe romper toda la lista de ejercicios.
    toContract: (row) => parseWith(Exercise, { user_id: 'ownerUserId' })({
      ...row, is_unilateral: row.is_unilateral ?? false, access_tier: row.access_tier ?? 'free',
    }),
  },
  training_plan: {
    entity: 'training_plan',
    table: 'training_plans',
    columns: { name: 'text', description: 'text', status: 'text', starts_on: 'text', ends_on: 'text', kind: 'text', template_slug: 'text' },
    children: [{ entity: 'training_day', fk: 'plan_id' }],
    // Filas anteriores a 0.7.0 (o de un servidor sin migrar) son rutinas.
    toContract: (row) => parseWith(TrainingPlan)({ ...row, kind: row.kind ?? 'routine', template_slug: row.template_slug ?? null }),
  },
  training_day: {
    entity: 'training_day',
    table: 'training_days',
    columns: {
      plan_id: 'text', position: 'int', name: 'text', kind: 'text', notes: 'text',
      weekday: 'int', modality: 'text', target_rpe: 'real', target_duration_minutes: 'int',
    },
    children: [{ entity: 'training_day_exercise', fk: 'training_day_id' }, { entity: 'training_block', fk: 'training_day_id' }],
    toContract: (row) => parseWith(TrainingDay)({
      ...row, weekday: row.weekday ?? null, modality: row.modality ?? null, target_rpe: row.target_rpe ?? null, target_duration_minutes: row.target_duration_minutes ?? null,
    }),
  },
  training_block: {
    entity: 'training_block',
    table: 'training_blocks',
    columns: {
      training_day_id: 'text', position: 'int', name: 'text', kind: 'text', format: 'text', rounds: 'int',
      time_cap_seconds: 'int', rest_seconds: 'int', target_rpe: 'real', notes: 'text',
    },
    toContract: parseWith(TrainingBlock),
  },
  training_day_exercise: {
    entity: 'training_day_exercise',
    table: 'training_day_exercises',
    columns: {
      training_day_id: 'text', exercise_id: 'text', position: 'int', target_sets: 'int', target_reps_min: 'int',
      target_reps_max: 'int', target_weight_kg: 'real', target_rir: 'real', target_rest_seconds: 'int',
      target_duration_seconds: 'int', target_distance_m: 'real', notes: 'text', block_id: 'text', per_side: 'bool', target_rpe: 'real',
    },
    toContract: (row) => parseWith(TrainingDayExercise, { target_distance_m: 'targetDistanceMeters' })({
      ...row, block_id: row.block_id ?? null, per_side: row.per_side ?? false, target_rpe: row.target_rpe ?? null,
    }),
  },
  workout_session: {
    entity: 'workout_session',
    table: 'workout_sessions',
    columns: {
      status: 'text', training_day_id: 'text', title: 'text', started_at: 'text', ended_at: 'text',
      time_zone: 'text', local_date: 'text', source: 'text', notes: 'text', session_rpe: 'real',
    },
    children: [{ entity: 'session_exercise', fk: 'session_id' }, { entity: 'session_block_result', fk: 'session_id' }],
    toContract: (row) => parseWith(WorkoutSession)({ ...row, session_rpe: row.session_rpe ?? null }),
  },
  session_block_result: {
    entity: 'session_block_result',
    table: 'session_block_results',
    columns: {
      session_id: 'text', training_block_id: 'text', position: 'int', name: 'text', format: 'text',
      rounds_completed: 'int', extra_reps: 'int', duration_seconds: 'int', notes: 'text',
    },
    toContract: parseWith(SessionBlockResult),
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
  meal_entry: {
    entity: 'meal_entry',
    table: 'meal_entries',
    columns: {
      consumed_at: 'text', time_zone: 'text', local_date: 'text', meal_type: 'text', description: 'text',
      energy_kcal: 'real', protein_g: 'real', carbs_g: 'real', fat_g: 'real', source: 'text', notes: 'text',
      ai_estimate: 'json',
    },
    toContract: parseWith(MealEntry),
  },
  nutrition_target: {
    entity: 'nutrition_target',
    table: 'nutrition_targets',
    columns: { effective_from: 'text', energy_kcal: 'real', protein_g: 'real', carbs_g: 'real', fat_g: 'real', source: 'text' },
    toContract: parseWith(NutritionTarget),
  },
  nutrition_plan: {
    entity: 'nutrition_plan',
    table: 'nutrition_plans',
    columns: {
      effective_from: 'text', name: 'text', meals: 'json', notes: 'text', source: 'text', assigned_by: 'text', assigned_by_name: 'text',
    },
    toContract: parseWith(NutritionPlan),
  },
};

export type SupportedEntity = keyof typeof ENTITIES;

export function metaFor(entity: SyncEntity): EntityMeta | null {
  return (ENTITIES as Record<string, EntityMeta>)[entity] ?? null;
}

export function allColumns(meta: EntityMeta): Record<string, ColumnKind> {
  return { ...COMMON_COLUMNS, ...meta.columns };
}
