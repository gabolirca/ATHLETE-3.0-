import { z } from 'zod';
import { DataSource, IsoDateTime, LocalDate, Notes, Position, SyncedRecord, TimeZone, Uuid } from './common';
import { Rpe, StrengthSet } from './sets';
import { BlockFormat } from './programs';

/**
 * Ciclo de vida de una sesión de fuerza:
 *   in_progress → completed
 *   in_progress → discarded
 * Una sesión `completed` puede editarse (series, notas, horas) pero no vuelve a `in_progress`.
 * Las transiciones se validan en `@athlete/domain` (`session.ts`).
 */
export const WorkoutSessionStatus = z.enum(['in_progress', 'completed', 'discarded']);
export type WorkoutSessionStatus = z.infer<typeof WorkoutSessionStatus>;

export const WorkoutSession = SyncedRecord.extend({
  status: WorkoutSessionStatus,
  /** Día planificado que originó la sesión, si existe (planificado ≠ ejecutado). */
  trainingDayId: Uuid.nullable(),
  title: z.string().trim().max(120).nullable(),
  startedAt: IsoDateTime,
  endedAt: IsoDateTime.nullable(),
  /** Zona horaria en la que se entrenó; se conserva para no recalcular el día si el atleta viaja. */
  timeZone: TimeZone,
  /** Fecha deportiva local derivada de `startedAt` + `timeZone` (ver `localDateOf` en domain). */
  localDate: LocalDate,
  source: DataSource,
  notes: Notes.nullable(),
  /** RPE de toda la sesión (1–10) al terminar. Carga de sesión = RPE × minutos (Foster). (0.7.0) */
  sessionRpe: Rpe.nullable(),
});
export type WorkoutSession = z.infer<typeof WorkoutSession>;

export const SessionExercise = SyncedRecord.extend({
  sessionId: Uuid,
  exerciseId: Uuid,
  /** Ejercicio planificado del que proviene, si existe. */
  trainingDayExerciseId: Uuid.nullable(),
  position: Position,
  notes: Notes.nullable(),
});
export type SessionExercise = z.infer<typeof SessionExercise>;

// ---------- Entradas (operaciones conceptuales de docs/contracts/README.md §5) ----------

/** Iniciar sesión. `id` lo genera el cliente; `localDate` lo deriva el repositorio. */
export const StartSessionInput = z.object({
  id: Uuid,
  startedAt: IsoDateTime,
  timeZone: TimeZone,
  trainingDayId: Uuid.nullable().default(null),
  title: z.string().trim().max(120).nullable().default(null),
  notes: Notes.nullable().default(null),
});
export type StartSessionInput = z.input<typeof StartSessionInput>;

/**
 * Iniciar desde un día planificado (rutina): crea la sesión y un ejercicio de sesión por cada ejercicio
 * planificado, en el orden del plan y enlazado con `trainingDayExerciseId`, en una sola operación atómica.
 * No crea series: lo planificado (objetivos) no es lo ejecutado. (0.3.0)
 */
export const StartFromTrainingDayInput = StartSessionInput.extend({ trainingDayId: Uuid });
export type StartFromTrainingDayInput = z.input<typeof StartFromTrainingDayInput>;

export const AddSessionExerciseInput = z.object({
  id: Uuid,
  sessionId: Uuid,
  exerciseId: Uuid,
  trainingDayExerciseId: Uuid.nullable().default(null),
  /** Si se omite, el repositorio lo añade al final. */
  position: Position.optional(),
  notes: Notes.nullable().default(null),
});
export type AddSessionExerciseInput = z.input<typeof AddSessionExerciseInput>;

export const ReorderSessionExercisesInput = z.object({
  sessionId: Uuid,
  orderedSessionExerciseIds: z.array(Uuid).min(1),
});
export type ReorderSessionExercisesInput = z.infer<typeof ReorderSessionExercisesInput>;

export const CompleteSessionInput = z.object({
  sessionId: Uuid,
  endedAt: IsoDateTime,
  notes: Notes.nullable().optional(),
  sessionRpe: Rpe.nullable().optional(),
});
export type CompleteSessionInput = z.infer<typeof CompleteSessionInput>;

export const DiscardSessionInput = z.object({ sessionId: Uuid });
export type DiscardSessionInput = z.infer<typeof DiscardSessionInput>;

/** Edición de metadatos de una sesión (en curso o completada). */
export const UpdateSessionInput = z.object({
  sessionId: Uuid,
  title: z.string().trim().max(120).nullable().optional(),
  startedAt: IsoDateTime.optional(),
  endedAt: IsoDateTime.nullable().optional(),
  notes: Notes.nullable().optional(),
  sessionRpe: Rpe.nullable().optional(),
});
export type UpdateSessionInput = z.infer<typeof UpdateSessionInput>;

export const SessionHistoryQuery = z.object({
  from: LocalDate.optional(),
  to: LocalDate.optional(),
  exerciseId: Uuid.optional(),
  status: z.array(WorkoutSessionStatus).default(['completed']),
});
export type SessionHistoryQuery = z.input<typeof SessionHistoryQuery>;

/**
 * Resultado de un bloque con formato (AMRAP: rondas + reps; por tiempo: segundos; rondas/intervalos: rondas hechas).
 * Las series de cada ejercicio siguen en `StrengthSet`; esto guarda el resultado del bloque como un todo. (0.7.0)
 */
export const SessionBlockResult = SyncedRecord.extend({
  sessionId: Uuid,
  /** Bloque planificado; null si se borró el programa. */
  trainingBlockId: Uuid.nullable(),
  position: Position,
  /** Copia del nombre y formato del bloque: el historial no depende de que el programa siga existiendo. */
  name: z.string().trim().min(1).max(120),
  format: BlockFormat,
  roundsCompleted: z.int().min(0).max(1000).nullable(),
  extraReps: z.int().min(0).max(10_000).nullable(),
  durationSeconds: z.int().min(1).max(86_400).nullable(),
  notes: Notes.nullable(),
});
export type SessionBlockResult = z.infer<typeof SessionBlockResult>;

export const SaveBlockResultInput = SessionBlockResult.omit({ userId: true, createdAt: true, updatedAt: true, deletedAt: true, revision: true });
export type SaveBlockResultInput = z.infer<typeof SaveBlockResultInput>;

// ---------- Lecturas compuestas ----------

export const SessionExerciseDetail = SessionExercise.extend({
  sets: z.array(StrengthSet),
});
export type SessionExerciseDetail = z.infer<typeof SessionExerciseDetail>;

export const WorkoutSessionDetail = WorkoutSession.extend({
  exercises: z.array(SessionExerciseDetail),
});
export type WorkoutSessionDetail = z.infer<typeof WorkoutSessionDetail>;

/** Fila de historial: resumen calculado con `@athlete/domain` (`summarizeStrengthSession`). */
export const WorkoutSessionSummary = z.object({
  sessionId: Uuid,
  status: WorkoutSessionStatus,
  localDate: LocalDate,
  startedAt: IsoDateTime,
  endedAt: IsoDateTime.nullable(),
  title: z.string().nullable(),
  exerciseCount: z.int().nonnegative(),
  workingSetCount: z.int().nonnegative(),
  /** Null si ninguna serie efectiva tiene peso y repeticiones (no se inventa volumen). */
  volumeKg: z.number().nonnegative().nullable(),
});
export type WorkoutSessionSummary = z.infer<typeof WorkoutSessionSummary>;
