import type { CardioSession } from '@athlete/contracts';
import type { LoggedSetInput, RoutineInput } from './trainingSchemas';

/**
 * Ejercicio para la UI. `muscleGroup` y `equipment` son los nombres ya unidos para mostrar;
 * `muscles`/`equipmentList` sirven para filtrar. `tier = 'pro'` se marca con la etiqueta PRO.
 */
export type Exercise = {
  id: string; name: string; muscleGroup: string; equipment: string | null; origin: 'sample' | 'server';
  muscles?: string[]; equipmentList?: string[];
  /** Músculos por papel (slug + nombre), para diagnosticar rutinas. */
  muscleRoles?: { primary: Array<{ slug: string; name: string }>; secondary: Array<{ slug: string; name: string }> }; tier?: 'free' | 'pro'; isCustom?: boolean; mechanics?: 'compound' | 'isolation' | null;
};
/** Lo que hiciste en este ejercicio la última vez (series de trabajo, sin calentamiento). */
export type PreviousPerformance = { localDate: string; sets: Array<{ weightKg: number | null; reps: number | null; rir: number | null }> };
export type RoutineExercise = { exerciseId: string; exerciseName: string; sortOrder: number; sets: number | null; reps: number | null; restSeconds: number | null };
export type Routine = { id: string; name: string; exercises: RoutineExercise[]; updatedAt: string };
export type TrainingSet = LoggedSetInput & { id: string; setIndex: number };
/** Récord que esta sesión supera (peso máximo o 1RM estimado). La primera vez que haces un ejercicio no cuenta como récord. */
export type SessionRecord = { kind: 'max_weight' | 'best_e1rm'; value: number; weightKg: number | null; reps: number | null };
export type SessionExercise = { id: string; exerciseId: string; exerciseName: string; sortOrder: number; setsTarget: number | null; repsTarget: number | null; restSeconds: number | null; targetRir?: number | null; sets: TrainingSet[]; newRecords?: SessionRecord[]; previous?: PreviousPerformance | null; /** Incremento para la carga sugerida; null = sin carga externa. */ incrementKg?: number | null };
export type Workout = { id: string; state: 'active' | 'completed'; startedAt: string; completedAt: string | null; localVersion: number | null; serverVersion: number | null; syncStatus: 'pending' | 'synced' | 'conflict' | 'failed'; exerciseCount: number; setCount: number; durationMinutes: number | null };
export type WorkoutDetail = { workout: Workout; exercises: SessionExercise[] };
/** `sessionsThisWeek` = fuerza + cardio. `activityMinutesThisWeek` incluye la duración del cardio. */
export type TrainingOverview = { sessionsThisWeek: number; strengthSessionsThisWeek: number; cardioSessionsThisWeek: number; activityMinutesThisWeek: number; pendingSyncCount: number; latestWorkout: Workout | null };
export type OutboxOperation = { id: string; clientMutationId: string; aggregateType: string; aggregateId: string; operation: string; localVersion: number; baseServerVersion: number | null; payloadJson: string; status: 'pending' | 'syncing' | 'failed' | 'conflict' | 'acked'; attemptCount: number };
export type BodyMeasurement = { id: string; type: 'weight_kg' | 'waist_cm' | 'chest_cm' | 'hip_cm'; value: number; unit: 'kg' | 'cm'; measuredAt: string; localVersion: number | null; serverVersion: number | null; syncStatus: Workout['syncStatus'] };
/**
 * Récords de un ejercicio: el peso más alto que levantaste (con sus reps) y el mejor 1RM estimado (Epley,
 * series de 1 a 12 reps). El estimado NO es una medición: es lo que podrías levantar una vez.
 */
export type ExerciseRecord = {
  exerciseId: string;
  exerciseName: string;
  weightKg: number;
  reps: number | null;
  measuredAt: string;
  e1rm: { valueKg: number; weightKg: number; reps: number; localDate: string } | null;
};
export type ProgressSummary = { weeklyVolumeKg: number; sessionsThisMonth: number; dailyVolumeKg: Array<{ label: string; volumeKg: number }>; records: ExerciseRecord[]; measurements: BodyMeasurement[] };
/**
 * Series efectivas por músculo en los últimos 7 días (incluye la sesión en curso). Principal = 1, secundario = 0.5.
 * `status` compara con una referencia general de hipertrofia; `untracked` = músculo que no se diagnostica.
 */
export type MuscleVolumeItem = { muscle: string; name: string; sets: number; status: 'low' | 'ok' | 'high' | 'untracked'; range: readonly [number, number] | null };
export type WeeklyMuscleVolume = { items: MuscleVolumeItem[]; totalSets: number; sessions: number };
export type LocalAthletePreferences = { displayName: string; unitSystem: 'metric' | 'imperial'; preferredSport: 'strength' | 'hybrid' | 'running' | 'swimming'; sports?: Array<'strength' | 'running' | 'swimming' | 'cycling' | 'rowing' | 'functional_fitness' | 'other'>; timezone: string };

export type RoutineDraft = RoutineInput;

/** Actividad cardiovascular tal como la muestra la app. Ritmo y velocidad se derivan; no se guardan. */
export type CardioEntry = Pick<CardioSession,
  'id' | 'activity' | 'startedAt' | 'localDate' | 'durationSeconds' | 'distanceMeters' | 'rounds' | 'rpe'
  | 'avgHeartRateBpm' | 'maxHeartRateBpm' | 'swim' | 'notes'> & { syncStatus: Workout['syncStatus'] };

/** Elemento del historial unificado de atleta híbrido. */
export type HistoryItem = { kind: 'strength'; startedAt: string; workout: Workout } | { kind: 'cardio'; startedAt: string; cardio: CardioEntry };
