/**
 * Puertos (interfaces) de persistencia que consume la app móvil.
 *
 * Reglas (ADR-0002 §2, ADR-0003):
 * - Las pantallas usan estos repositorios; nunca consultan SQLite ni Supabase directamente.
 * - Las implementaciones viven en `packages/data` (SQLite local como fuente de lectura/escritura;
 *   Supabase solo a través del motor de sincronización).
 * - Toda escritura es local primero, encola una `SyncMutation` y devuelve sin esperar la red.
 * - El `userId` sale de la sesión autenticada del adaptador, nunca de la entrada.
 * - No lanzan excepciones esperables: devuelven `Result<T>` con códigos de `errors.ts`.
 */
import type { IsoDateTime, LocalDate, Page, PageRequest, Uuid } from './common';
import type { Result } from './errors';
import type {
  CreateCustomExerciseInput,
  Equipment,
  Exercise,
  ExerciseQuery,
  MuscleGroup,
  UpdateCustomExerciseInput,
} from './exercises';
import type { Profile, UpdateProfileInput } from './profile';
import type {
  CreateTrainingDayExerciseInput,
  CreateTrainingDayInput,
  CreateTrainingPlanInput,
  TrainingDay,
  TrainingDayExercise,
  TrainingPlan,
} from './programs';
import type {
  AddSessionExerciseInput,
  CompleteSessionInput,
  DiscardSessionInput,
  ReorderSessionExercisesInput,
  SessionExercise,
  SessionHistoryQuery,
  StartFromTrainingDayInput,
  StartSessionInput,
  UpdateSessionInput,
  WorkoutSession,
  WorkoutSessionDetail,
  WorkoutSessionSummary,
} from './sessions';
import type { LogSetInput, StrengthSet, UpdateSetInput } from './sets';
import type { CardioSession, LogCardioSessionInput } from './cardio';
import type { BodyMeasurement, BodySite, BodyWeight, LogBodyMeasurementInput, LogBodyWeightInput } from './body';
import type { LogMealEntryInput, MealEntry, NutritionDaySummary, NutritionTarget, SetNutritionTargetInput } from './nutrition';
import type {
  ConflictResolution,
  OutboxEntry,
  PullRequest,
  PullResponse,
  PushRequest,
  PushResponse,
  SyncStatus,
} from './sync';

export type DateRange = { from?: LocalDate; to?: LocalDate };

export interface ProfileRepository {
  /** Perfil del usuario autenticado; `NOT_FOUND` si aún no existe localmente. */
  get(): Promise<Result<Profile>>;
  /** Crea el perfil local si no existe (tras el primer pull). Idempotente. */
  initialize(timeZone: string): Promise<Result<Profile>>;
  update(input: UpdateProfileInput): Promise<Result<Profile>>;
}

export interface ExerciseRepository {
  list(query?: ExerciseQuery): Promise<Result<Exercise[]>>;
  getById(id: Uuid): Promise<Result<Exercise>>;
  listMuscleGroups(): Promise<Result<MuscleGroup[]>>;
  listEquipment(): Promise<Result<Equipment[]>>;
  createCustom(input: CreateCustomExerciseInput): Promise<Result<Exercise>>;
  updateCustom(id: Uuid, input: UpdateCustomExerciseInput): Promise<Result<Exercise>>;
  /** Los ejercicios con historial se archivan, no se borran. */
  archiveCustom(id: Uuid): Promise<Result<Exercise>>;
}

export interface TrainingPlanRepository {
  listPlans(): Promise<Result<TrainingPlan[]>>;
  getPlan(id: Uuid): Promise<Result<{ plan: TrainingPlan; days: Array<TrainingDay & { exercises: TrainingDayExercise[] }> }>>;
  createPlan(input: CreateTrainingPlanInput): Promise<Result<TrainingPlan>>;
  updatePlan(id: Uuid, input: Partial<Omit<CreateTrainingPlanInput, 'id'>>): Promise<Result<TrainingPlan>>;
  deletePlan(id: Uuid): Promise<Result<void>>;
  addDay(input: CreateTrainingDayInput): Promise<Result<TrainingDay>>;
  updateDay(id: Uuid, input: Partial<Omit<CreateTrainingDayInput, 'id' | 'planId'>>): Promise<Result<TrainingDay>>;
  deleteDay(id: Uuid): Promise<Result<void>>;
  addDayExercise(input: CreateTrainingDayExerciseInput): Promise<Result<TrainingDayExercise>>;
  updateDayExercise(
    id: Uuid,
    input: Partial<Omit<CreateTrainingDayExerciseInput, 'id' | 'trainingDayId'>>,
  ): Promise<Result<TrainingDayExercise>>;
  deleteDayExercise(id: Uuid): Promise<Result<void>>;
}

/**
 * Sesiones de fuerza. Cada operación persiste de inmediato (autoguardado) para que una
 * sesión sobreviva al cierre de la app (especificación §15).
 */
export interface WorkoutSessionRepository {
  /** `INVALID_STATE` si ya hay una sesión `in_progress` (una a la vez por usuario). */
  start(input: StartSessionInput): Promise<Result<WorkoutSession>>;
  /**
   * Inicia desde un día planificado, de forma atómica (0.3.0). Mismos errores que `start`, más `NOT_FOUND` si el día,
   * o un ejercicio planificado, no existe. No crea series.
   */
  startFromTrainingDay(input: StartFromTrainingDayInput): Promise<Result<WorkoutSessionDetail>>;
  /** Sesión en curso para recuperar tras reiniciar la app; null si no hay. */
  getActive(): Promise<Result<WorkoutSessionDetail | null>>;
  getDetail(sessionId: Uuid): Promise<Result<WorkoutSessionDetail>>;
  listHistory(query: SessionHistoryQuery, page?: PageRequest): Promise<Result<Page<WorkoutSessionSummary>>>;
  update(input: UpdateSessionInput): Promise<Result<WorkoutSession>>;
  complete(input: CompleteSessionInput): Promise<Result<WorkoutSession>>;
  discard(input: DiscardSessionInput): Promise<Result<WorkoutSession>>;
  /** Borrado lógico de una sesión completa (genera tombstones). */
  delete(sessionId: Uuid): Promise<Result<void>>;

  addExercise(input: AddSessionExerciseInput): Promise<Result<SessionExercise>>;
  reorderExercises(input: ReorderSessionExercisesInput): Promise<Result<SessionExercise[]>>;
  removeExercise(sessionExerciseId: Uuid): Promise<Result<void>>;

  logSet(input: LogSetInput): Promise<Result<StrengthSet>>;
  updateSet(input: UpdateSetInput): Promise<Result<StrengthSet>>;
  deleteSet(setId: Uuid): Promise<Result<void>>;

  /** Series efectivas históricas de un ejercicio (para récords y comparación entre sesiones). */
  listSetsForExercise(exerciseId: Uuid, range?: DateRange): Promise<Result<Array<StrengthSet & { sessionId: Uuid; localDate: LocalDate }>>>;
}

export interface CardioRepository {
  log(input: LogCardioSessionInput): Promise<Result<CardioSession>>;
  update(id: Uuid, input: Partial<Omit<LogCardioSessionInput, 'id'>>): Promise<Result<CardioSession>>;
  delete(id: Uuid): Promise<Result<void>>;
  getById(id: Uuid): Promise<Result<CardioSession>>;
  list(range: DateRange, page?: PageRequest): Promise<Result<Page<CardioSession>>>;
}

export interface BodyRepository {
  logWeight(input: LogBodyWeightInput): Promise<Result<BodyWeight>>;
  deleteWeight(id: Uuid): Promise<Result<void>>;
  listWeights(range: DateRange): Promise<Result<BodyWeight[]>>;
  logMeasurement(input: LogBodyMeasurementInput): Promise<Result<BodyMeasurement>>;
  deleteMeasurement(id: Uuid): Promise<Result<void>>;
  listMeasurements(range: DateRange, site?: BodySite): Promise<Result<BodyMeasurement[]>>;
}

export interface NutritionRepository {
  logMeal(input: LogMealEntryInput): Promise<Result<MealEntry>>;
  updateMeal(id: Uuid, input: Partial<Omit<LogMealEntryInput, 'id'>>): Promise<Result<MealEntry>>;
  deleteMeal(id: Uuid): Promise<Result<void>>;
  listMeals(localDate: LocalDate): Promise<Result<MealEntry[]>>;
  getDaySummary(localDate: LocalDate): Promise<Result<NutritionDaySummary>>;
  /** Crea o reemplaza la meta del día `effectiveFrom` (0.5.0). */
  setTarget(input: SetNutritionTargetInput): Promise<Result<NutritionTarget>>;
  /** Meta vigente en `localDate`: la más reciente con `effectiveFrom <= localDate`, o null (0.5.0). */
  getTargetFor(localDate: LocalDate): Promise<Result<NutritionTarget | null>>;
}

// ---------- Puertos de sincronización ----------

/** Catálogo global (solo lectura) para uso sin conexión. */
export type CatalogSnapshot = {
  muscleGroups: MuscleGroup[];
  equipment: Equipment[];
  /** Ejercicios globales en formato de cable (snake_case), igual que `RemoteChange.record`. */
  exercises: Record<string, unknown>[];
};

/** Transporte remoto (implementación Supabase: RPC `athlete3.sync_push` / `athlete3.sync_pull`). */
export interface SyncTransport {
  push(request: PushRequest): Promise<Result<PushResponse>>;
  pull(request: PullRequest): Promise<Result<PullResponse>>;
  pullCatalog(): Promise<Result<CatalogSnapshot>>;
}

/** Fachada que la app usa para observar y disparar la sincronización. */
export interface SyncService {
  status(): Promise<SyncStatus>;
  /** Push seguido de pull. Idempotente y seguro de llamar repetidamente. */
  syncNow(): Promise<Result<SyncStatus>>;
  listConflicts(): Promise<OutboxEntry[]>;
  resolveConflict(mutationId: Uuid, resolution: ConflictResolution): Promise<Result<void>>;
}

// ---------- Puertos de infraestructura ----------

export interface Clock {
  now(): IsoDateTime;
}

export interface IdGenerator {
  /** UUID nuevo (propuesta: v7, ordenable por tiempo). */
  newId(): Uuid;
}
