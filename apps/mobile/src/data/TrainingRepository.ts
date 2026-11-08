import type { CardioDraft } from '@/cardio/cardioForm';
import type { BodyMeasurement, CardioEntry, Exercise, LocalAthletePreferences, Program, ProgramWeekStatus, ProgressSummary, Routine, WeeklyLoad, WeeklyMuscleVolume, RoutineDraft, TrainingOverview, Workout, WorkoutDetail } from './trainingTypes';
import type { BodyMeasurementInput, LocalAthletePreferencesInput, LoggedSetInput } from './trainingSchemas';

export interface TrainingRepository {
  searchExercises(query?: string): Promise<Exercise[]>;
  listRoutines(): Promise<Routine[]>;
  createRoutine(input: RoutineDraft): Promise<string>;
  tombstoneRoutine(routineId: string): Promise<void>;
  /** Sin `startedAt` empieza ahora (o retoma la sesión en curso). Con `startedAt` registra un entrenamiento pasado. */
  startWorkout(routineId?: string, options?: { startedAt?: string }): Promise<string>;
  addExercise(sessionId: string, exerciseId: string): Promise<void>;
  addSet(sessionId: string, sessionExerciseId: string): Promise<string>;
  saveSet(sessionId: string, setId: string, input: LoggedSetInput): Promise<void>;
  /** En un entrenamiento pasado, `durationMinutes` fija la hora de fin (inicio + duración). */
  finishWorkout(sessionId: string, options?: { durationMinutes?: number; sessionRpe?: number | null }): Promise<void>;
  // ---- Programa híbrido (0.7.0) ----
  listPrograms(): Promise<Program[]>;
  /** Crea el programa del usuario a partir de una plantilla (p. ej. `hybrid-athlete-1-0`). Devuelve su id. */
  adoptProgramTemplate(slug: string): Promise<string>;
  deleteProgram(planId: string): Promise<void>;
  programWeekStatus(planId: string): Promise<ProgramWeekStatus>;
  /** Inicia (o retoma) la sesión de un día del programa con sus ejercicios. */
  startProgramDay(dayId: string): Promise<string>;
  saveBlockResult(sessionId: string, blockId: string, result: { roundsCompleted: number | null; extraReps: number | null; durationSeconds: number | null }): Promise<void>;
  /** Carga de sesión (RPE × minutos) por semana: fuerza, acondicionamiento y cardio. */
  getWeeklyLoad(weeks?: number): Promise<WeeklyLoad>;
  tombstoneWorkout(sessionId: string): Promise<void>;
  getWorkout(sessionId: string): Promise<WorkoutDetail | null>;
  listHistory(): Promise<Workout[]>;
  getOverview(): Promise<TrainingOverview>;
  getProgress(): Promise<ProgressSummary>;
  /** Series por músculo de los últimos 7 días (incluye la sesión en curso). */
  getWeeklyMuscleVolume(): Promise<WeeklyMuscleVolume>;
  addBodyMeasurement(input: BodyMeasurementInput): Promise<string>;
  listBodyMeasurements(): Promise<BodyMeasurement[]>;
  tombstoneBodyMeasurement(measurementId: string): Promise<void>;
  getPreferences(): Promise<LocalAthletePreferences>;
  savePreferences(input: LocalAthletePreferencesInput): Promise<void>;
  logCardio(input: CardioDraft): Promise<string>;
  updateCardio(id: string, input: CardioDraft): Promise<void>;
  /** Más recientes primero. */
  listCardio(): Promise<CardioEntry[]>;
  getCardio(id: string): Promise<CardioEntry | null>;
  tombstoneCardio(id: string): Promise<void>;
}
