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
});
export type LogMealEntryInput = z.input<typeof LogMealEntryInput>;

/** Objetivos nutricionales diarios vigentes desde una fecha local. */
export const NutritionTarget = SyncedRecord.extend({
  effectiveFrom: LocalDate,
  ...nutrientFields,
});
export type NutritionTarget = z.infer<typeof NutritionTarget>;

/** Resumen diario calculado (no almacenado). Totales null si ninguna entrada tiene el valor. */
export const NutritionDaySummary = z.object({
  localDate: LocalDate,
  entryCount: z.int().nonnegative(),
  ...nutrientFields,
  /** Entradas sin dato de energía: el total de kcal es un mínimo, no un valor completo. */
  entriesMissingEnergy: z.int().nonnegative(),
});
export type NutritionDaySummary = z.infer<typeof NutritionDaySummary>;
