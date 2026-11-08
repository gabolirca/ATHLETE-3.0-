import {
  CreateCustomExerciseInput,
  CreateTrainingDayExerciseInput,
  CreateTrainingDayInput,
  CreateTrainingPlanInput,
  ExerciseQuery,
  TimeZone,
  UpdateCustomExerciseInput,
  UpdateProfileInput,
  type Equipment,
  type Exercise,
  type ExerciseRepository,
  type MuscleGroup,
  type Profile,
  type ProfileRepository,
  type Result,
  type TrainingDay,
  type TrainingDayExercise,
  type TrainingPlan,
  type TrainingPlanRepository,
} from '@athlete/contracts';
import { fail } from '../local/store';
import type { SqlExecutor } from '../sql/types';
import { Repository, checkPosition, guard, input, toServerScale } from './base';

// ---------------- Ejercicios ----------------

/** Minúsculas y sin acentos, para buscar como escribe la gente en el teléfono. */
export function foldText(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

export class LocalExerciseRepository extends Repository implements ExerciseRepository {
  list(query: ExerciseQuery = {}): Promise<Result<Exercise[]>> {
    return guard(async () => {
      const q = input(ExerciseQuery, query);
      const where = ['deleted_at IS NULL', '(user_id IS NULL OR user_id = ?)'];
      const params: string[] = [this.store.ctx.userId];
      if (!q.includeArchived) where.push('archived_at IS NULL');
      if (q.modality) { where.push('modality = ?'); params.push(q.modality); }
      if (q.movementPattern) { where.push('movement_pattern = ?'); params.push(q.movementPattern); }
      if (q.accessTier) { where.push('access_tier = ?'); params.push(q.accessTier); }
      if (q.equipmentId) { where.push('equipment_ids LIKE ?'); params.push(`%"${q.equipmentId}"%`); }
      if (q.muscleGroupId) {
        where.push('(primary_muscle_group_ids LIKE ? OR secondary_muscle_group_ids LIKE ?)');
        params.push(`%"${q.muscleGroupId}"%`, `%"${q.muscleGroupId}"%`);
      }
      const rows = (await this.store.select('exercise', `WHERE ${where.join(' AND ')} ORDER BY name`, params))
        .map((r) => this.store.toContract<Exercise>('exercise', r));
      if (!q.search) return rows;
      // Búsqueda sin acentos ni mayúsculas ("jalon" encuentra "Jalón"); todas las palabras deben aparecer.
      const words = foldText(q.search).split(/\s+/).filter(Boolean);
      return rows.filter((e) => { const name = foldText(e.name); return words.every((w) => name.includes(w)); });
    });
  }

  getById(id: string): Promise<Result<Exercise>> {
    return guard(async () => {
      const r = await this.store.get('exercise', id);
      if (!r || r.deleted_at || (r.user_id !== null && r.user_id !== this.store.ctx.userId)) fail('NOT_FOUND', 'El ejercicio no existe.');
      return this.store.toContract<Exercise>('exercise', r!);
    });
  }

  listMuscleGroups(): Promise<Result<MuscleGroup[]>> {
    return guard(async () => (await this.store.db.all('SELECT id, slug, name FROM muscle_groups ORDER BY name')) as MuscleGroup[]);
  }

  listEquipment(): Promise<Result<Equipment[]>> {
    return guard(async () => (await this.store.db.all('SELECT id, slug, name FROM equipment ORDER BY name')) as Equipment[]);
  }

  private async assertRefs(tx: SqlExecutor, ids: string[], table: 'muscle_groups' | 'equipment') {
    for (const id of ids) if (!(await tx.get(`SELECT 1 AS x FROM ${table} WHERE id = ?`, [id]))) fail('VALIDATION_FAILED', 'Referencia inexistente.', { details: { id } });
  }

  private async loadOwn(id: string, tx: SqlExecutor) {
    const r = await this.store.get('exercise', id, tx);
    if (!r || r.deleted_at || r.user_id !== this.store.ctx.userId) fail('NOT_FOUND', 'El ejercicio no existe.');
    return r!;
  }

  createCustom(raw: CreateCustomExerciseInput): Promise<Result<Exercise>> {
    return guard(() => this.store.db.transaction(async (tx) => {
      const i = input(CreateCustomExerciseInput, raw);
      if (await this.store.get('exercise', i.id, tx)) fail('DUPLICATE', 'El ejercicio ya existe.');
      await this.assertRefs(tx, [...i.primaryMuscleGroupIds, ...i.secondaryMuscleGroupIds], 'muscle_groups');
      await this.assertRefs(tx, i.equipmentIds, 'equipment');
      const row = await this.store.upsert('exercise', i.id, {
        slug: null, name: i.name, modality: i.modality, load_type: i.loadType, primary_muscle_group_ids: i.primaryMuscleGroupIds,
        secondary_muscle_group_ids: i.secondaryMuscleGroupIds, equipment_ids: i.equipmentIds, instructions: i.instructions, archived_at: null,
        movement_pattern: i.movementPattern, mechanics: i.mechanics, is_unilateral: i.isUnilateral, access_tier: 'free',
      }, tx);
      return this.store.toContract<Exercise>('exercise', row);
    }));
  }

  updateCustom(id: string, raw: UpdateCustomExerciseInput): Promise<Result<Exercise>> {
    return guard(() => this.store.db.transaction(async (tx) => {
      await this.loadOwn(id, tx);
      const i = input(UpdateCustomExerciseInput, raw);
      const map: Record<string, string> = {
        name: 'name', modality: 'modality', loadType: 'load_type', primaryMuscleGroupIds: 'primary_muscle_group_ids',
        secondaryMuscleGroupIds: 'secondary_muscle_group_ids', equipmentIds: 'equipment_ids', instructions: 'instructions',
        movementPattern: 'movement_pattern', mechanics: 'mechanics', isUnilateral: 'is_unilateral',
      };
      const changes: Record<string, unknown> = {};
      for (const [k, col] of Object.entries(map)) if (k in (raw as object)) changes[col] = (i as Record<string, unknown>)[k];
      await this.assertRefs(tx, [...((changes.primary_muscle_group_ids as string[]) ?? []), ...((changes.secondary_muscle_group_ids as string[]) ?? [])], 'muscle_groups');
      await this.assertRefs(tx, (changes.equipment_ids as string[]) ?? [], 'equipment');
      return this.store.toContract<Exercise>('exercise', await this.store.upsert('exercise', id, changes, tx));
    }));
  }

  archiveCustom(id: string): Promise<Result<Exercise>> {
    return guard(() => this.store.db.transaction(async (tx) => {
      await this.loadOwn(id, tx);
      return this.store.toContract<Exercise>('exercise', await this.store.upsert('exercise', id, { archived_at: this.now }, tx));
    }));
  }
}

// ---------------- Perfil ----------------

export class LocalProfileRepository extends Repository implements ProfileRepository {
  get(): Promise<Result<Profile>> {
    return guard(async () => {
      const r = await this.store.get('profile', this.store.ctx.userId);
      if (!r) fail('NOT_FOUND', 'El perfil aún no existe.');
      return this.store.toContract<Profile>('profile', r!);
    });
  }

  initialize(timeZone: string): Promise<Result<Profile>> {
    return guard(() => this.store.db.transaction(async (tx) => {
      const tz = input(TimeZone, timeZone);
      const existing = await this.store.get('profile', this.store.ctx.userId, tx);
      if (existing) return this.store.toContract<Profile>('profile', existing);
      const row = await this.store.upsert('profile', this.store.ctx.userId, {
        display_name: null, height_cm: null, initial_weight_kg: null, experience_level: null, goals: [], sports: [],
        time_zone: tz, unit_system: 'metric', load_unit: 'kg', week_starts_on: 1,
      }, tx);
      return this.store.toContract<Profile>('profile', row);
    }));
  }

  update(raw: UpdateProfileInput): Promise<Result<Profile>> {
    return guard(() => this.store.db.transaction(async (tx) => {
      const i = input(UpdateProfileInput, raw);
      if (!(await this.store.get('profile', this.store.ctx.userId, tx))) fail('NOT_FOUND', 'El perfil aún no existe.');
      const map: Record<string, string> = {
        displayName: 'display_name', heightCm: 'height_cm', initialWeightKg: 'initial_weight_kg', experienceLevel: 'experience_level',
        goals: 'goals', sports: 'sports', timeZone: 'time_zone', unitSystem: 'unit_system', loadUnit: 'load_unit', weekStartsOn: 'week_starts_on',
      };
      const changes: Record<string, unknown> = {};
      for (const [k, col] of Object.entries(map)) if ((i as Record<string, unknown>)[k] !== undefined) changes[col] = (i as Record<string, unknown>)[k];
      return this.store.toContract<Profile>('profile', await this.store.upsert('profile', this.store.ctx.userId, changes, tx));
    }));
  }
}

// ---------------- Programas ----------------

type PlanDetail = { plan: TrainingPlan; days: Array<TrainingDay & { exercises: TrainingDayExercise[] }> };

export class LocalTrainingPlanRepository extends Repository implements TrainingPlanRepository {
  private async live(entity: 'training_plan' | 'training_day' | 'training_day_exercise', id: string, tx?: SqlExecutor) {
    const r = await this.store.get(entity, id, tx);
    if (!r || r.deleted_at) fail('NOT_FOUND', 'El registro no existe.');
    return r!;
  }

  listPlans(): Promise<Result<TrainingPlan[]>> {
    return guard(async () => (await this.store.select('training_plan', 'WHERE deleted_at IS NULL ORDER BY name'))
      .map((r) => this.store.toContract<TrainingPlan>('training_plan', r)));
  }

  getPlan(id: string): Promise<Result<PlanDetail>> {
    return guard(async () => {
      const plan = this.store.toContract<TrainingPlan>('training_plan', await this.live('training_plan', id));
      const days = await this.store.select('training_day', 'WHERE plan_id = ? AND deleted_at IS NULL ORDER BY position, id', [id]);
      const out: PlanDetail['days'] = [];
      for (const d of days) {
        const ex = await this.store.select('training_day_exercise', 'WHERE training_day_id = ? AND deleted_at IS NULL ORDER BY position, id', [d.id]);
        out.push({ ...this.store.toContract<TrainingDay>('training_day', d), exercises: ex.map((e) => this.store.toContract<TrainingDayExercise>('training_day_exercise', e)) });
      }
      return { plan, days: out };
    });
  }

  createPlan(raw: CreateTrainingPlanInput): Promise<Result<TrainingPlan>> {
    return guard(() => this.store.db.transaction(async (tx) => {
      const i = input(CreateTrainingPlanInput, raw);
      if (await this.store.get('training_plan', i.id, tx)) fail('DUPLICATE', 'El plan ya existe.');
      const row = await this.store.upsert('training_plan', i.id, { name: i.name, description: i.description, status: i.status, starts_on: i.startsOn, ends_on: i.endsOn }, tx);
      return this.store.toContract<TrainingPlan>('training_plan', row);
    }));
  }

  updatePlan(id: string, raw: Partial<Omit<CreateTrainingPlanInput, 'id'>>): Promise<Result<TrainingPlan>> {
    return guard(() => this.store.db.transaction(async (tx) => {
      const current = this.store.toContract<TrainingPlan>('training_plan', await this.live('training_plan', id, tx));
      const i = input(CreateTrainingPlanInput, { ...current, ...raw, id });
      const row = await this.store.upsert('training_plan', id, { name: i.name, description: i.description, status: i.status, starts_on: i.startsOn, ends_on: i.endsOn }, tx);
      return this.store.toContract<TrainingPlan>('training_plan', row);
    }));
  }

  deletePlan(id: string): Promise<Result<void>> {
    return guard(() => this.store.remove('training_plan', id));
  }

  addDay(raw: CreateTrainingDayInput): Promise<Result<TrainingDay>> {
    return guard(() => this.store.db.transaction(async (tx) => {
      const i = input(CreateTrainingDayInput, raw);
      await this.live('training_plan', i.planId, tx);
      if (await this.store.get('training_day', i.id, tx)) fail('DUPLICATE', 'El día ya existe.');
      const row = await this.store.upsert('training_day', i.id, { plan_id: i.planId, position: checkPosition(i.position), name: i.name, kind: i.kind, notes: i.notes }, tx);
      return this.store.toContract<TrainingDay>('training_day', row);
    }));
  }

  updateDay(id: string, raw: Partial<Omit<CreateTrainingDayInput, 'id' | 'planId'>>): Promise<Result<TrainingDay>> {
    return guard(() => this.store.db.transaction(async (tx) => {
      const current = this.store.toContract<TrainingDay>('training_day', await this.live('training_day', id, tx));
      const i = input(CreateTrainingDayInput, { ...current, ...raw, id, planId: current.planId });
      const row = await this.store.upsert('training_day', id, { position: checkPosition(i.position), name: i.name, kind: i.kind, notes: i.notes }, tx);
      return this.store.toContract<TrainingDay>('training_day', row);
    }));
  }

  deleteDay(id: string): Promise<Result<void>> {
    return guard(() => this.store.remove('training_day', id));
  }

  /** Columnas del ejercicio planificado, con las mismas reglas que el servidor aplica (`athlete3.training_day_exercises`). */
  private dayExerciseColumns(i: ReturnType<typeof CreateTrainingDayExerciseInput.parse>) {
    return {
      training_day_id: i.trainingDayId, exercise_id: i.exerciseId, position: checkPosition(i.position), target_sets: i.targetSets,
      target_reps_min: i.targetRepsMin, target_reps_max: i.targetRepsMax, target_weight_kg: toServerScale(i.targetWeightKg, 2), target_rir: i.targetRir,
      target_rest_seconds: i.targetRestSeconds, target_duration_seconds: i.targetDurationSeconds,
      target_distance_m: toServerScale(i.targetDistanceMeters, 2), notes: i.notes,
    };
  }

  private async assertUsableExercise(exerciseId: string, tx: SqlExecutor): Promise<void> {
    const ex = await this.store.get('exercise', exerciseId, tx);
    if (!ex || ex.deleted_at || (ex.user_id !== null && ex.user_id !== this.store.ctx.userId)) fail('NOT_FOUND', 'El ejercicio no existe.');
  }

  addDayExercise(raw: CreateTrainingDayExerciseInput): Promise<Result<TrainingDayExercise>> {
    return guard(() => this.store.db.transaction(async (tx) => {
      const i = input(CreateTrainingDayExerciseInput, raw);
      await this.live('training_day', i.trainingDayId, tx);
      await this.assertUsableExercise(i.exerciseId, tx);
      if (await this.store.get('training_day_exercise', i.id, tx)) fail('DUPLICATE', 'El ejercicio ya está en el día.');
      const row = await this.store.upsert('training_day_exercise', i.id, this.dayExerciseColumns(i), tx);
      return this.store.toContract<TrainingDayExercise>('training_day_exercise', row);
    }));
  }

  updateDayExercise(id: string, raw: Partial<Omit<CreateTrainingDayExerciseInput, 'id' | 'trainingDayId'>>): Promise<Result<TrainingDayExercise>> {
    return guard(() => this.store.db.transaction(async (tx) => {
      const current = this.store.toContract<TrainingDayExercise>('training_day_exercise', await this.live('training_day_exercise', id, tx));
      const i = input(CreateTrainingDayExerciseInput, { ...current, ...raw, id, trainingDayId: current.trainingDayId });
      if (i.exerciseId !== current.exerciseId) await this.assertUsableExercise(i.exerciseId, tx);
      const row = await this.store.upsert('training_day_exercise', id, this.dayExerciseColumns(i), tx);
      return this.store.toContract<TrainingDayExercise>('training_day_exercise', row);
    }));
  }

  deleteDayExercise(id: string): Promise<Result<void>> {
    return guard(() => this.store.remove('training_day_exercise', id));
  }
}
