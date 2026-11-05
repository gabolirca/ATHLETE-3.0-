import type { CardioSession } from '@athlete/contracts';
import type { LoggedSetInput, RoutineInput } from './trainingSchemas';

export type Exercise = { id: string; name: string; muscleGroup: string; equipment: string | null; origin: 'sample' | 'server' };
export type RoutineExercise = { exerciseId: string; exerciseName: string; sortOrder: number; sets: number | null; reps: number | null; restSeconds: number | null };
export type Routine = { id: string; name: string; exercises: RoutineExercise[]; updatedAt: string };
export type TrainingSet = LoggedSetInput & { id: string; setIndex: number };
export type SessionExercise = { id: string; exerciseId: string; exerciseName: string; sortOrder: number; setsTarget: number | null; repsTarget: number | null; restSeconds: number | null; sets: TrainingSet[] };
export type Workout = { id: string; state: 'active' | 'completed'; startedAt: string; completedAt: string | null; localVersion: number | null; serverVersion: number | null; syncStatus: 'pending' | 'synced' | 'conflict' | 'failed'; exerciseCount: number; setCount: number; durationMinutes: number | null };
export type WorkoutDetail = { workout: Workout; exercises: SessionExercise[] };
/** `sessionsThisWeek` = fuerza + cardio. `activityMinutesThisWeek` incluye la duración del cardio. */
export type TrainingOverview = { sessionsThisWeek: number; strengthSessionsThisWeek: number; cardioSessionsThisWeek: number; activityMinutesThisWeek: number; pendingSyncCount: number; latestWorkout: Workout | null };
export type OutboxOperation = { id: string; clientMutationId: string; aggregateType: string; aggregateId: string; operation: string; localVersion: number; baseServerVersion: number | null; payloadJson: string; status: 'pending' | 'syncing' | 'failed' | 'conflict' | 'acked'; attemptCount: number };
export type BodyMeasurement = { id: string; type: 'weight_kg' | 'waist_cm' | 'chest_cm' | 'hip_cm'; value: number; unit: 'kg' | 'cm'; measuredAt: string; localVersion: number | null; serverVersion: number | null; syncStatus: Workout['syncStatus'] };
export type ProgressSummary = { weeklyVolumeKg: number; sessionsThisMonth: number; dailyVolumeKg: Array<{ label: string; volumeKg: number }>; records: Array<{ exerciseName: string; weightKg: number; reps: number | null; measuredAt: string }>; measurements: BodyMeasurement[] };
export type LocalAthletePreferences = { displayName: string; unitSystem: 'metric' | 'imperial'; preferredSport: 'strength' | 'hybrid' | 'running' | 'swimming'; sports?: Array<'strength' | 'running' | 'swimming' | 'cycling' | 'rowing' | 'functional_fitness' | 'other'>; timezone: string };

export type RoutineDraft = RoutineInput;

/** Actividad cardiovascular tal como la muestra la app. Ritmo y velocidad se derivan; no se guardan. */
export type CardioEntry = Pick<CardioSession,
  'id' | 'activity' | 'startedAt' | 'localDate' | 'durationSeconds' | 'distanceMeters' | 'rounds' | 'rpe'
  | 'avgHeartRateBpm' | 'maxHeartRateBpm' | 'swim' | 'notes'> & { syncStatus: Workout['syncStatus'] };

/** Elemento del historial unificado de atleta híbrido. */
export type HistoryItem = { kind: 'strength'; startedAt: string; workout: Workout } | { kind: 'cardio'; startedAt: string; cardio: CardioEntry };
