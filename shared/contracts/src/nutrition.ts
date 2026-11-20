import { z } from 'zod';
import { DataSource, IsoDateTime, LocalDate, Notes, SyncedRecord, TimeZone, Uuid } from './common';

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

/**
 * Plan nutricional por equivalentes del SMAE (contratos 0.8.0).
 * Grupos: los mismos ids que `@athlete/domain` (SMAE_GROUPS) y que `athlete3_private.smae_groups()` en el servidor.
 */
export const SmaeGroupId = z.enum([
  'verduras', 'frutas', 'cereales_sin_grasa', 'cereales_con_grasa', 'leguminosas',
  'aoa_muy_bajo', 'aoa_bajo', 'aoa_moderado', 'aoa_alto',
  'leche_descremada', 'leche_semidescremada', 'leche_entera', 'leche_con_azucar',
  'grasas_sin_proteina', 'grasas_con_proteina', 'azucares_sin_grasa', 'azucares_con_grasa', 'libres',
]);
export type SmaeGroupId = z.infer<typeof SmaeGroupId>;

/** Raciones por grupo: de 0.5 a 20, en pasos de ½ (igual que el servidor). */
export const PlanEquivalents = z.partialRecord(SmaeGroupId, z.number().min(0.5).max(20).refine((n) => Number.isInteger(n * 2), 'Pasos de ½'));
export type PlanEquivalents = z.infer<typeof PlanEquivalents>;

/** Un tiempo de comida del plan: "Desayuno 08:00 → 2 cereales, 1 fruta…". */
export const NutritionPlanMeal = z.strictObject({
  label: z.string().trim().min(1).max(40),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable().default(null),
  equivalents: PlanEquivalents,
  note: z.string().max(300).nullable().default(null),
});
export type NutritionPlanMeal = z.infer<typeof NutritionPlanMeal>;

/** `self`: lo capturó el usuario. `assigned`: se lo asignó su nutriólogo (solo el servidor lo marca). */
export const NutritionPlanSource = z.enum(['self', 'assigned']);
export type NutritionPlanSource = z.infer<typeof NutritionPlanSource>;

/** Plan vigente desde una fecha local (uno por día). La meta diaria (kcal y macros) vive en `NutritionTarget`. */
export const NutritionPlan = SyncedRecord.extend({
  effectiveFrom: LocalDate,
  name: z.string().trim().min(1).max(80),
  meals: z.array(NutritionPlanMeal).min(1).max(10),
  notes: Notes.nullable(),
  source: NutritionPlanSource,
  assignedBy: Uuid.nullable(),
  assignedByName: z.string().nullable(),
});
export type NutritionPlan = z.infer<typeof NutritionPlan>;

/** Guarda el plan propio del día `effectiveFrom`. Reemplaza el que haya ese día (si era asignado, queda uno propio nuevo). */
export const SaveNutritionPlanInput = z.object({
  id: NutritionPlan.shape.id,
  effectiveFrom: LocalDate,
  name: NutritionPlan.shape.name,
  meals: NutritionPlan.shape.meals,
  notes: Notes.nullable().default(null),
});
export type SaveNutritionPlanInput = z.input<typeof SaveNutritionPlanInput>;
