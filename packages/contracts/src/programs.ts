import { z } from 'zod';
import { LocalDate, Notes, Position, SyncedRecord, Uuid } from './common';
import { Rir } from './sets';

/**
 * Planificación (especificación §6.3). Representa lo **planificado**; lo ejecutado vive en
 * `WorkoutSession`/`CardioSession`, que referencian opcionalmente al día planificado.
 *
 * Pendiente: calendario concreto (asignación de días del plan a fechas) y bloques/mesociclos.
 * Se añadirán como entidades nuevas (cambio menor) cuando se definan sus requisitos.
 */
export const TrainingPlanStatus = z.enum(['draft', 'active', 'archived']);
export type TrainingPlanStatus = z.infer<typeof TrainingPlanStatus>;

export const TrainingPlan = SyncedRecord.extend({
  name: z.string().trim().min(1).max(120),
  description: Notes.nullable(),
  status: TrainingPlanStatus,
  startsOn: LocalDate.nullable(),
  endsOn: LocalDate.nullable(),
});
export type TrainingPlan = z.infer<typeof TrainingPlan>;

export const TrainingDayKind = z.enum(['training', 'rest']);
export type TrainingDayKind = z.infer<typeof TrainingDayKind>;

export const TrainingDay = SyncedRecord.extend({
  planId: Uuid,
  /** Posición del día dentro del ciclo del plan (0..1000). */
  position: Position,
  name: z.string().trim().min(1).max(120),
  kind: TrainingDayKind,
  notes: Notes.nullable(),
});
export type TrainingDay = z.infer<typeof TrainingDay>;

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
});
export type TrainingDayExercise = z.infer<typeof TrainingDayExercise>;

export const CreateTrainingPlanInput = TrainingPlan.pick({
  id: true,
  name: true,
  description: true,
  status: true,
  startsOn: true,
  endsOn: true,
}).refine((p) => !p.startsOn || !p.endsOn || p.startsOn <= p.endsOn, {
  message: 'La fecha de fin no puede ser anterior a la de inicio',
  path: ['endsOn'],
});
export type CreateTrainingPlanInput = z.infer<typeof CreateTrainingPlanInput>;

export const CreateTrainingDayInput = TrainingDay.pick({
  id: true,
  planId: true,
  position: true,
  name: true,
  kind: true,
  notes: true,
});
export type CreateTrainingDayInput = z.infer<typeof CreateTrainingDayInput>;

export const CreateTrainingDayExerciseInput = TrainingDayExercise.omit({
  userId: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
  revision: true,
}).refine(
  (e) => e.targetRepsMin == null || e.targetRepsMax == null || e.targetRepsMin <= e.targetRepsMax,
  { message: 'El mínimo de repeticiones no puede superar el máximo', path: ['targetRepsMax'] },
);
export type CreateTrainingDayExerciseInput = z.infer<typeof CreateTrainingDayExerciseInput>;
