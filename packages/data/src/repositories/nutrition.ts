import {
  LocalDate,
  LogMealEntryInput,
  type MealEntry,
  type NutritionDaySummary,
  type NutritionRepository,
  type Result,
} from '@athlete/contracts';
import { localDateOf, summarizeNutritionDay } from '@athlete/domain';
import { fail } from '../local/store';
import { Repository, checkStartedAt, guard, input, toServerScale } from './base';

type MealInput = ReturnType<typeof LogMealEntryInput.parse>;

/**
 * Nutrición — registro manual. Calorías y macros son opcionales: no se inventan valores
 * (el resumen del día marca cuántas comidas no tienen kcal).
 * Escalas iguales al servidor: kcal y gramos con 1 decimal (`numeric(7,1)` / `numeric(6,1)`).
 */
function mealColumns(i: MealInput) {
  return {
    consumed_at: i.consumedAt, time_zone: i.timeZone, local_date: localDateOf(i.consumedAt, i.timeZone),
    meal_type: i.mealType, description: i.description,
    energy_kcal: toServerScale(i.energyKcal, 1), protein_g: toServerScale(i.proteinG, 1),
    carbs_g: toServerScale(i.carbsG, 1), fat_g: toServerScale(i.fatG, 1),
    source: i.source, notes: i.notes,
  };
}

export class LocalNutritionRepository extends Repository implements NutritionRepository {
  logMeal(raw: LogMealEntryInput): Promise<Result<MealEntry>> {
    return guard(() => this.store.db.transaction(async (tx) => {
      const i = input(LogMealEntryInput, raw);
      checkStartedAt(i.consumedAt, this.now, 'consumedAt', 'La hora de la comida');
      if (await this.store.get('meal_entry', i.id, tx)) fail('DUPLICATE', 'La comida ya existe.');
      return this.store.toContract<MealEntry>('meal_entry', await this.store.upsert('meal_entry', i.id, mealColumns(i), tx));
    }));
  }

  updateMeal(id: string, raw: Partial<Omit<LogMealEntryInput, 'id'>>): Promise<Result<MealEntry>> {
    return guard(() => this.store.db.transaction(async (tx) => {
      const row = await this.store.get('meal_entry', id, tx);
      if (!row || row.deleted_at) fail('NOT_FOUND', 'La comida no existe.');
      const current = this.store.toContract<MealEntry>('meal_entry', row!);
      const merged = input(LogMealEntryInput, { ...current, ...raw, id });
      checkStartedAt(merged.consumedAt, this.now, 'consumedAt', 'La hora de la comida');
      return this.store.toContract<MealEntry>('meal_entry', await this.store.upsert('meal_entry', id, mealColumns(merged), tx));
    }));
  }

  deleteMeal(id: string): Promise<Result<void>> {
    return guard(() => this.store.remove('meal_entry', id));
  }

  listMeals(localDate: LocalDate): Promise<Result<MealEntry[]>> {
    return guard(async () => {
      const day = input(LocalDate, localDate);
      return (await this.store.select('meal_entry', 'WHERE deleted_at IS NULL AND local_date = ? ORDER BY consumed_at, id', [day]))
        .map((r) => this.store.toContract<MealEntry>('meal_entry', r));
    });
  }

  getDaySummary(localDate: LocalDate): Promise<Result<NutritionDaySummary>> {
    return guard(async () => {
      const day = input(LocalDate, localDate);
      const rows = await this.store.select('meal_entry', 'WHERE deleted_at IS NULL AND local_date = ?', [day]);
      return summarizeNutritionDay(day, rows.map((r) => this.store.toContract<MealEntry>('meal_entry', r)));
    });
  }
}
