import { z } from 'zod';
import { LocalDate, Notes, Position, SyncedRecord, Uuid } from './common';
import { Rir, Rpe } from './sets';

/**
 * Planificación (especificación §6.3). Representa lo **planificado**; lo ejecutado vive en
 * `WorkoutSession`/`CardioSession`, que referencian opcionalmente al día planificado.
 *
 * 0.7.0 (motor híbrido): un plan puede ser una **rutina** (un día, como hasta ahora) o un **programa** con semana
 * tipo: cada día lleva día de la semana y modalidad, y se divide en **bloques** (calentamiento, fuerza, WOD…) con
 * formato (series, rondas, AMRAP, EMOM, por tiempo, intervalos, continuo). Todo es aditivo y opcional.
 */
export const TrainingPlanStatus = z.enum(['draft', 'active', 'archived']);
export type TrainingPlanStatus = z.infer<typeof TrainingPlanStatus>;

/** `routine` = un día suelto (Fuerza); `program` = semana tipo con varios días (Híbrido). (0.7.0) */
export const TrainingPlanKind = z.enum(['routine', 'program']);
export type TrainingPlanKind = z.infer<typeof TrainingPlanKind>;

export const TrainingPlan = SyncedRecord.extend({
  name: z.string().trim().min(1).max(120),
  kind: TrainingPlanKind,
  /** Plantilla de la que se creó (p. ej. `hybrid-athlete-1-0`). Null si es propia. (0.7.0) */
  templateSlug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(80).nullable(),
  description: Notes.nullable(),
  status: TrainingPlanStatus,
  startsOn: LocalDate.nullable(),
  endsOn: LocalDate.nullable(),
  /** Coach que lo asignó (0.9.0). Solo el servidor lo marca; null si es propio. */
  assignedBy: Uuid.nullable().default(null),
  assignedByName: z.string().nullable().default(null),
});
export type TrainingPlan = z.infer<typeof TrainingPlan>;

export const TrainingDayKind = z.enum(['training', 'rest']);
export type TrainingDayKind = z.infer<typeof TrainingDayKind>;

/** Día de la semana ISO: 1 = lunes … 7 = domingo. (0.7.0) */
export const Weekday = z.int().min(1).max(7);
export type Weekday = z.infer<typeof Weekday>;

/** Modalidad de una sesión del programa: decide cómo se registra (fuerza, cardio por bloques o actividad de cardio). (0.7.0) */
export const SessionModality = z.enum(['strength', 'conditioning', 'swim', 'run', 'bike', 'row', 'mobility', 'rest']);
export type SessionModality = z.infer<typeof SessionModality>;

export const TrainingDay = SyncedRecord.extend({
  planId: Uuid,
  /** Posición del día dentro del ciclo del plan (0..1000). Con dos sesiones el mismo día, ordena cuál va primero. */
  position: Position,
  name: z.string().trim().min(1).max(120),
  kind: TrainingDayKind,
  notes: Notes.nullable(),
  weekday: Weekday.nullable(),
  modality: SessionModality.nullable(),
  targetRpe: Rpe.nullable(),
  targetDurationMinutes: z.int().min(1).max(600).nullable(),
});
export type TrainingDay = z.infer<typeof TrainingDay>;

export const BlockKind = z.enum(['warmup', 'strength', 'conditioning', 'wod', 'cardio', 'swim', 'cooldown', 'mobility']);
export type BlockKind = z.infer<typeof BlockKind>;
/**
 * Formato del bloque:
 * - `sets`: series × reps de cada ejercicio (fuerza clásica).
 * - `rounds`: N rondas del circuito (`rounds`), con `restSeconds` entre rondas.
 * - `amrap`: tantas rondas como puedas en `timeCapSeconds`. Resultado: rondas + reps.
 * - `emom`: cada minuto durante `timeCapSeconds`.
 * - `for_time`: terminar lo antes posible (tope opcional `timeCapSeconds`). Resultado: tiempo.
 * - `intervals`: repeticiones de distancia o tiempo (natación 4×50 m, remo 3×400 m).
 * - `continuous`: un esfuerzo continuo (zona 2 10–15 min, 800 m suaves).
 */
export const BlockFormat = z.enum(['sets', 'rounds', 'amrap', 'emom', 'for_time', 'intervals', 'continuous']);
export type BlockFormat = z.infer<typeof BlockFormat>;

/** Bloque de un día del programa. Los ejercicios del día se asignan a un bloque con `blockId`. (0.7.0) */
export const TrainingBlock = SyncedRecord.extend({
  trainingDayId: Uuid,
  position: Position,
  name: z.string().trim().min(1).max(120),
  kind: BlockKind,
  format: BlockFormat,
  rounds: z.int().min(1).max(100).nullable(),
  timeCapSeconds: z.int().min(1).max(86_400).nullable(),
  restSeconds: z.int().min(0).max(3600).nullable(),
  targetRpe: Rpe.nullable(),
  notes: Notes.nullable(),
});
export type TrainingBlock = z.infer<typeof TrainingBlock>;

export const CreateTrainingBlockInput = TrainingBlock.omit({ userId: true, createdAt: true, updatedAt: true, deletedAt: true, revision: true })
  .refine((b) => b.format !== 'amrap' && b.format !== 'emom' || b.timeCapSeconds !== null, {
    message: 'AMRAP y EMOM necesitan la duración del bloque', path: ['timeCapSeconds'],
  });
export type CreateTrainingBlockInput = z.infer<typeof CreateTrainingBlockInput>;

/** Objetivos planificados por ejercicio. Todos opcionales: no se inventan objetivos. */
export const TrainingDayExercise = SyncedRecord.extend({
  trainingDayId: Uuid,
  exerciseId: Uuid,
  position: Position,
  targetSets: z.int().min(1).max(50).nullable(),
  targetRepsMin: z.int().min(1).max(1000).nullable(),
  targetRepsMax: z.int().min(1).max(1000).nullable(),
  targetWeightKg: z.number().min(0).max(1000).nullable(),
  /** Mismas reglas que el RIR registrado: 0–10 en pasos de 0.5 (0.3.0). */
  targetRir: Rir.nullable(),
  targetRestSeconds: z.int().min(0).max(3600).nullable(),
  targetDurationSeconds: z.int().min(1).max(86_400).nullable(),
  targetDistanceMeters: z.number().positive().max(1_000_000).nullable(),
  notes: Notes.nullable(),
  /** Bloque al que pertenece (0.7.0). Null en rutinas sin bloques. */
  blockId: Uuid.nullable(),
  /** Las reps/tiempo son por lado (búlgara 3×8 por pierna). (0.7.0) */
  perSide: z.boolean(),
  targetRpe: Rpe.nullable(),
});
export type TrainingDayExercise = z.infer<typeof TrainingDayExercise>;

export const CreateTrainingPlanInput = TrainingPlan.pick({
  id: true,
  name: true,
  description: true,
  status: true,
  startsOn: true,
  endsOn: true,
}).extend({
  kind: TrainingPlanKind.default('routine'),
  templateSlug: TrainingPlan.shape.templateSlug.default(null),
}).refine((p) => !p.startsOn || !p.endsOn || p.startsOn <= p.endsOn, {
  message: 'La fecha de fin no puede ser anterior a la de inicio',
  path: ['endsOn'],
});
export type CreateTrainingPlanInput = z.input<typeof CreateTrainingPlanInput>;

export const CreateTrainingDayInput = TrainingDay.pick({
  id: true,
  planId: true,
  position: true,
  name: true,
  kind: true,
  notes: true,
}).extend({
  weekday: Weekday.nullable().default(null),
  modality: SessionModality.nullable().default(null),
  targetRpe: Rpe.nullable().default(null),
  targetDurationMinutes: TrainingDay.shape.targetDurationMinutes.default(null),
});
export type CreateTrainingDayInput = z.input<typeof CreateTrainingDayInput>;

export const CreateTrainingDayExerciseInput = TrainingDayExercise.omit({
  userId: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
  revision: true,
}).extend({
  blockId: Uuid.nullable().default(null),
  perSide: z.boolean().default(false),
  targetRpe: Rpe.nullable().default(null),
}).refine(
  (e) => e.targetRepsMin == null || e.targetRepsMax == null || e.targetRepsMin <= e.targetRepsMax,
  { message: 'El mínimo de repeticiones no puede superar el máximo', path: ['targetRepsMax'] },
);
export type CreateTrainingDayExerciseInput = z.input<typeof CreateTrainingDayExerciseInput>;
