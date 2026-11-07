import type { MealEntry, NutritionDaySummary, NutritionRepository, NutritionTarget, NutritionTargetSource, Result } from '@athlete/contracts';
import { useMemo } from 'react';
import { useAthleteData } from '@/data/AthleteDataProvider';
import { emitLocalChange } from '@/data/localChanges';
import type { MealDraft } from './mealForm';

/**
 * Nutrición para la UI: convierte `Result` en excepciones con mensaje claro y avisa de cada escritura
 * para que la sincronización automática la suba (igual que el entrenamiento).
 */
export type MobileNutrition = {
  loadDay(localDate: string): Promise<{ meals: MealEntry[]; summary: NutritionDaySummary }>;
  getMeal(id: string, localDate: string): Promise<MealEntry | null>;
  logMeal(draft: MealDraft): Promise<MealEntry>;
  updateMeal(id: string, draft: MealDraft): Promise<MealEntry>;
  deleteMeal(id: string): Promise<void>;
  getTarget(localDate: string): Promise<NutritionTarget | null>;
  setTarget(target: TargetDraft): Promise<NutritionTarget>;
};

export type TargetDraft = {
  effectiveFrom: string;
  energyKcal: number;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
  source: NutritionTargetSource;
};

function value<T>(r: Result<T>): T {
  if (!r.ok) throw new Error(r.error.message);
  return r.value;
}

export function createMobileNutrition(repo: NutritionRepository, newId: () => string, notify: () => void = emitLocalChange): MobileNutrition {
  const write = async <T>(op: () => Promise<Result<T>>) => { const out = value(await op()); notify(); return out; };
  return {
    async loadDay(localDate) {
      const [meals, summary] = await Promise.all([repo.listMeals(localDate), repo.getDaySummary(localDate)]);
      return { meals: value(meals), summary: value(summary) };
    },
    async getMeal(id, localDate) {
      return value(await repo.listMeals(localDate)).find((m) => m.id === id) ?? null;
    },
    logMeal: (draft) => write(() => repo.logMeal({ ...draft, id: newId() })),
    updateMeal: (id, draft) => write(() => repo.updateMeal(id, draft)),
    deleteMeal: (id) => write(() => repo.deleteMeal(id)),
    getTarget: async (localDate) => value(await repo.getTargetFor(localDate)),
    setTarget: (target) => write(() => repo.setTarget({ ...target, id: newId() })),
  };
}

export function useNutrition(): MobileNutrition | null {
  const { data, newId } = useAthleteData();
  return useMemo(() => (data ? createMobileNutrition(data.nutrition, newId) : null), [data, newId]);
}
