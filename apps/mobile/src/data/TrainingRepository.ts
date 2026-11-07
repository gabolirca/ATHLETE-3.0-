import type { CardioDraft } from '@/cardio/cardioForm';
import type { BodyMeasurement, CardioEntry, Exercise, LocalAthletePreferences, ProgressSummary, Routine, RoutineDraft, TrainingOverview, Workout, WorkoutDetail } from './trainingTypes';
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
  finishWorkout(sessionId: string, options?: { durationMinutes?: number }): Promise<void>;
  tombstoneWorkout(sessionId: string): Promise<void>;
  getWorkout(sessionId: string): Promise<WorkoutDetail | null>;
  listHistory(): Promise<Workout[]>;
  getOverview(): Promise<TrainingOverview>;
  getProgress(): Promise<ProgressSummary>;
  addBodyMeasurement(input: BodyMeasurementInput): Promise<string>;
  listBodyMeasurements(): Promise<BodyMeasurement[]>;
  tombstoneBodyMeasurement(measurementId: string): Promise<void>;
  getPreferences(): Promise<LocalAthletePreferences>;
  savePreferences(input: LocalAthletePreferencesInput): Promise<void>;
  logCardio(input: CardioDraft): Promise<string>;
  /** Más recientes primero. */
  listCardio(): Promise<CardioEntry[]>;
  getCardio(id: string): Promise<CardioEntry | null>;
  tombstoneCardio(id: string): Promise<void>;
}
