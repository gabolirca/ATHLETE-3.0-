import { z } from 'zod';
import { IsoDateTime, Notes, Position, SyncedRecord, Uuid } from './common';

/**
 * Tipo de serie (especificación §6.4: calentamiento y trabajo).
 * El calentamiento nunca cuenta como serie efectiva (data-model §6).
 * Nuevos tipos (drop, cluster…) serían un cambio menor.
 */
export const SetType = z.enum(['warmup', 'working']);
export type SetType = z.infer<typeof SetType>;

/** RIR 0–10 en pasos de 0.5. Opcional y nunca inferido (especificación §10). */
export const Rir = z.number().min(0).max(10).multipleOf(0.5);
/** RPE 1–10 en pasos de 0.5. Opcional. */
export const Rpe = z.number().min(1).max(10).multipleOf(0.5);

/**
 * Serie registrada. Todos los valores medidos son opcionales: se guarda solo lo registrado.
 * `weightKg` se almacena siempre en kg; la conversión a lb ocurre en la presentación.
 * Precisión: `weightKg` y `distanceMeters` se guardan con 2 decimales (escala `numeric(…, 2)` del servidor);
 * `@athlete/data` redondea al escribir y devuelve el valor guardado (p. ej. 225 lb → 102.06 kg).
 * Para ejercicios `bodyweight`, `weightKg` representa la carga **añadida** (null = sin lastre).
 */
export const StrengthSet = SyncedRecord.extend({
  sessionExerciseId: Uuid,
  position: Position,
  setType: SetType,
  weightKg: z.number().min(0).max(1000).nullable(),
  reps: z.int().min(0).max(1000).nullable(),
  rir: Rir.nullable(),
  rpe: Rpe.nullable(),
  restSeconds: z.int().min(0).max(3600).nullable(),
  durationSeconds: z.int().min(0).max(86_400).nullable(),
  distanceMeters: z.number().min(0).max(1_000_000).nullable(),
  /** Momento en que se marcó como hecha; null = serie preparada pero no ejecutada. */
  completedAt: IsoDateTime.nullable(),
  notes: Notes.nullable(),
});
export type StrengthSet = z.infer<typeof StrengthSet>;

const setValues = {
  setType: SetType.default('working'),
  weightKg: StrengthSet.shape.weightKg.default(null),
  reps: StrengthSet.shape.reps.default(null),
  rir: StrengthSet.shape.rir.default(null),
  rpe: StrengthSet.shape.rpe.default(null),
  restSeconds: StrengthSet.shape.restSeconds.default(null),
  durationSeconds: StrengthSet.shape.durationSeconds.default(null),
  distanceMeters: StrengthSet.shape.distanceMeters.default(null),
  completedAt: StrengthSet.shape.completedAt.default(null),
  notes: StrengthSet.shape.notes.default(null),
};

export const LogSetInput = z.object({
  id: Uuid,
  sessionExerciseId: Uuid,
  /** Si se omite, el repositorio la coloca al final. */
  position: Position.optional(),
  ...setValues,
});
export type LogSetInput = z.input<typeof LogSetInput>;

export const UpdateSetInput = z.object({
  setId: Uuid,
  setType: SetType.optional(),
  weightKg: StrengthSet.shape.weightKg.optional(),
  reps: StrengthSet.shape.reps.optional(),
  rir: StrengthSet.shape.rir.optional(),
  rpe: StrengthSet.shape.rpe.optional(),
  restSeconds: StrengthSet.shape.restSeconds.optional(),
  durationSeconds: StrengthSet.shape.durationSeconds.optional(),
  distanceMeters: StrengthSet.shape.distanceMeters.optional(),
  completedAt: StrengthSet.shape.completedAt.optional(),
  notes: StrengthSet.shape.notes.optional(),
});
export type UpdateSetInput = z.infer<typeof UpdateSetInput>;
