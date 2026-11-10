import { z } from 'zod';
import { DataSource, IsoDateTime, LocalDate, Notes, SyncedRecord, TimeZone } from './common';

/**
 * Nutrición — registro manual (especificación §6.7). La estimación por IA es posterior;
 * cuando exista, sus registros usarán `source = 'ai_generated'` o `'estimated'`.
 * Calorías y macros son opcionales: no se inventan valores.
 */
export const MealType = z.enum(['breakfast', 'lunch', 'dinner', 'snack', 'other']);
export type MealType = z.infer<typeof MealType>;

const nutrientFields = {
  energyKcal: z.number().min(0).max(20_000).nullable(),
  proteinG: z.number().min(0).max(2_000).nullable(),
  carbsG: z.number().min(0).max(2_000).nullable(),
  fatG: z.number().min(0).max(2_000).nullable(),
};

export const MealEntry = SyncedRecord.extend({
  consumedAt: IsoDateTime,
  timeZone: TimeZone,
  localDate: LocalDate,
  mealType: MealType,
  description: z.string().trim().min(1).max(500),
  ...nutrientFields,
  source: DataSource,
  notes: Notes.nullable(),
  /** Nutrición Pro: lo que reconoció la IA sin corregir (platillos, equivalentes SMAE, confianza, modelo). */
  aiEstimate: z.record(z.string(), z.unknown()).nullable().optional(),
});
export type MealEntry = z.infer<typeof MealEntry>;

export const LogMealEntryInput = z.object({
  id: MealEntry.shape.id,
  consumedAt: IsoDateTime,
  timeZone: TimeZone,
  mealType: MealType,
  description: MealEntry.shape.description,
  energyKcal: nutrientFields.energyKcal.default(null),
  proteinG: nutrientFields.proteinG.default(null),
  carbsG: nutrientFields.carbsG.default(null),
  fatG: nutrientFields.fatG.default(null),
  source: DataSource.default('manual'),
  notes: Notes.nullable().default(null),
  aiEstimate: z.record(z.string(), z.unknown()).nullable().default(null),
});
export type LogMealEntryInput = z.input<typeof LogMealEntryInput>;

/**
 * De dónde viene una meta diaria (contratos 0.5.0):
 *  - `estimated`: plan provisional calculado por la app (Mifflin-St Jeor); es una sugerencia, no prescripción.
 *  - `professional`: capturado por el usuario a partir del plan de su nutriólogo.
 *  - `manual`: el usuario fija sus propias metas.
 */
export const NutritionTargetSource = z.enum(['estimated', 'professional', 'manual']);
export type NutritionTargetSource = z.infer<typeof NutritionTargetSource>;

/** Objetivos nutricionales diarios vigentes desde una fecha local. */
export const NutritionTarget = SyncedRecord.extend({
  effectiveFrom: LocalDate,
  ...nutrientFields,
  source: NutritionTargetSource,
});
export type NutritionTarget = z.infer<typeof NutritionTarget>;

/**
 * Fija la meta vigente desde `effectiveFrom`. Si ya hay una para ese día, se reemplaza (una por día).
 * Al menos las kcal son obligatorias: una meta sin energía no sirve para comparar el día.
 */
export const SetNutritionTargetInput = z.object({
  id: NutritionTarget.shape.id,
  effectiveFrom: LocalDate,
  energyKcal: z.number().min(800).max(10_000),
  proteinG: nutrientFields.proteinG.default(null),
  carbsG: nutrientFields.carbsG.default(null),
  fatG: nutrientFields.fatG.default(null),
  source: NutritionTargetSource,
});
export type SetNutritionTargetInput = z.input<typeof SetNutritionTargetInput>;

/** Resumen diario calculado (no almacenado). Totales null si ninguna entrada tiene el valor. */
export const NutritionDaySummary = z.object({
  localDate: LocalDate,
  entryCount: z.int().nonnegative(),
  ...nutrientFields,
  /** Entradas sin dato de energía: el total de kcal es un mínimo, no un valor completo. */
  entriesMissingEnergy: z.int().nonnegative(),
});
export type NutritionDaySummary = z.infer<typeof NutritionDaySummary>;
