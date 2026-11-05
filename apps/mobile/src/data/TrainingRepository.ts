import type { BodyMeasurement, Exercise, LocalAthletePreferences, ProgressSummary, Routine, RoutineDraft, TrainingOverview, Workout, WorkoutDetail } from './trainingTypes';
import type { BodyMeasurementInput, LocalAthletePreferencesInput, LoggedSetInput } from './trainingSchemas';

export interface TrainingRepository {
  searchExercises(query?: string): Promise<Exercise[]>;
  listRoutines(): Promise<Routine[]>;
  createRoutine(input: RoutineDraft): Promise<string>;
  tombstoneRoutine(routineId: string): Promise<void>;
  startWorkout(routineId?: string): Promise<string>;
  addExercise(sessionId: string, exerciseId: string): Promise<void>;
  addSet(sessionId: string, sessionExerciseId: string): Promise<string>;
  saveSet(sessionId: string, setId: string, input: LoggedSetInput): Promise<void>;
  finishWorkout(sessionId: string): Promise<void>;
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
}
