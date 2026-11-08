import { z } from 'zod';
import { IsoDateTime, Notes, Uuid } from './common';

/** Modalidad: las métricas de fuerza y cardio no se mezclan (especificación §6.5). */
export const ExerciseModality = z.enum(['strength', 'cardio']);
export type ExerciseModality = z.infer<typeof ExerciseModality>;

/**
 * Cómo se registra la carga de un ejercicio de fuerza. Determina qué campos de la serie
 * son significativos (p. ej. dominadas con peso corporal no exigen `weightKg`).
 */
export const LoadType = z.enum(['external', 'bodyweight', 'assisted', 'time', 'none']);
export type LoadType = z.infer<typeof LoadType>;

/**
 * Patrón de movimiento (contratos 0.6.0). Es el rasgo principal con el que el modelo de carga sugerida
 * generaliza a ejercicios que no ha visto, y con el que se agrupa el volumen.
 */
export const MovementPattern = z.enum([
  'squat', 'hinge', 'lunge', 'horizontal_push', 'vertical_push', 'horizontal_pull', 'vertical_pull',
  'chest_fly', 'shoulder_raise', 'elbow_flexion', 'elbow_extension', 'knee_extension', 'knee_flexion',
  'hip_extension', 'hip_abduction', 'hip_adduction', 'calf_raise', 'shrug', 'wrist',
  'core_anti_extension', 'core_flexion', 'core_rotation', 'carry', 'power',
]);
export type MovementPattern = z.infer<typeof MovementPattern>;

/** Compuesto (varias articulaciones) o aislamiento (0.6.0). */
export const Mechanics = z.enum(['compound', 'isolation']);
export type Mechanics = z.infer<typeof Mechanics>;

/** Plan que da acceso al ejercicio del catálogo global (0.6.0). Los personalizados siempre son `free`. */
export const AccessTier = z.enum(['free', 'pro']);
export type AccessTier = z.infer<typeof AccessTier>;

/** Clave estable legible para catálogos globales (no cambia aunque cambie el nombre). */
export const CatalogSlug = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, { message: 'Slug en minúsculas separado por guiones' })
  .max(80);

export const MuscleGroup = z.object({
  id: Uuid,
  slug: CatalogSlug,
  name: z.string().min(1).max(80),
});
export type MuscleGroup = z.infer<typeof MuscleGroup>;

export const Equipment = z.object({
  id: Uuid,
  slug: CatalogSlug,
  name: z.string().min(1).max(80),
});
export type Equipment = z.infer<typeof Equipment>;

/**
 * Ejercicio del catálogo.
 * - `ownerUserId = null` → ejercicio global (solo lectura para usuarios).
 * - `ownerUserId = <uuid>` → ejercicio personalizado del atleta.
 * Los ejercicios con historial no se borran: se archivan.
 */
export const Exercise = z.object({
  id: Uuid,
  ownerUserId: Uuid.nullable(),
  slug: CatalogSlug.nullable(),
  name: z.string().trim().min(1).max(120),
  modality: ExerciseModality,
  loadType: LoadType,
  primaryMuscleGroupIds: z.array(Uuid),
  secondaryMuscleGroupIds: z.array(Uuid),
  equipmentIds: z.array(Uuid),
  instructions: Notes.nullable(),
  /** 0.6.0: rasgos del ejercicio (null en personalizados que no los indiquen). */
  movementPattern: MovementPattern.nullable(),
  mechanics: Mechanics.nullable(),
  isUnilateral: z.boolean(),
  accessTier: AccessTier,
  archivedAt: IsoDateTime.nullable(),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
  /** Revisión de servidor; solo relevante para ejercicios personalizados (sincronizables). */
  revision: z.int().nonnegative().nullable(),
});
export type Exercise = z.infer<typeof Exercise>;

export const CreateCustomExerciseInput = z.object({
  id: Uuid,
  name: z.string().trim().min(1).max(120),
  modality: ExerciseModality,
  loadType: LoadType,
  primaryMuscleGroupIds: z.array(Uuid).default([]),
  secondaryMuscleGroupIds: z.array(Uuid).default([]),
  equipmentIds: z.array(Uuid).default([]),
  instructions: Notes.nullable().default(null),
  movementPattern: MovementPattern.nullable().default(null),
  mechanics: Mechanics.nullable().default(null),
  isUnilateral: z.boolean().default(false),
});
export type CreateCustomExerciseInput = z.input<typeof CreateCustomExerciseInput>;

export const UpdateCustomExerciseInput = CreateCustomExerciseInput.omit({ id: true }).partial();
export type UpdateCustomExerciseInput = z.input<typeof UpdateCustomExerciseInput>;

export const ExerciseQuery = z.object({
  search: z.string().trim().max(120).optional(),
  modality: ExerciseModality.optional(),
  muscleGroupId: Uuid.optional(),
  equipmentId: Uuid.optional(),
  movementPattern: MovementPattern.optional(),
  accessTier: AccessTier.optional(),
  includeArchived: z.boolean().default(false),
});
export type ExerciseQuery = z.input<typeof ExerciseQuery>;
