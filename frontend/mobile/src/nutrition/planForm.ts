import type { NutritionPlanMeal } from '@athlete/contracts';
import { SMAE_GROUP_IDS, SMAE_GROUPS, macrosFromEquivalents, sumMacros, type Equivalents, type Macros, type SmaeGroup } from '@athlete/domain';

/**
 * Plan nutricional por equivalentes del SMAE: lógica pura del editor (sin UI).
 * Las kcal y macros salen de la tabla SMAE del dominio; así la meta diaria del plan es coherente con las raciones.
 */
export type EditableMeal = { key: string; label: string; time: string; equivalents: Equivalents; note: string };
export type PlanDraft = { name: string; effectiveFrom: string; notes: string; meals: EditableMeal[] };
export type PlanErrors = Partial<Record<'name' | 'form', string>> & { meals?: Record<string, string> };

let seq = 0;
const key = () => `m${Date.now().toString(36)}${(seq++).toString(36)}`;

export const DEFAULT_MEALS: ReadonlyArray<Pick<EditableMeal, 'label' | 'time'>> = [
  { label: 'Desayuno', time: '08:00' },
  { label: 'Colación', time: '11:00' },
  { label: 'Comida', time: '15:00' },
  { label: 'Colación', time: '18:00' },
  { label: 'Cena', time: '21:00' },
];

export function emptyMeal(label = '', time = ''): EditableMeal {
  return { key: key(), label, time, equivalents: {}, note: '' };
}

export function newPlanDraft(effectiveFrom: string, name = 'Mi plan'): PlanDraft {
  return { name, effectiveFrom, notes: '', meals: DEFAULT_MEALS.map((m) => emptyMeal(m.label, m.time)) };
}

/** Del plan guardado (contrato) al borrador editable. */
export function draftFromPlan(plan: { name: string; notes: string | null; meals: NutritionPlanMeal[] }, effectiveFrom: string): PlanDraft {
  return {
    name: plan.name, effectiveFrom, notes: plan.notes ?? '',
    meals: plan.meals.map((m) => ({ key: key(), label: m.label, time: m.time ?? '', equivalents: { ...(m.equivalents as Equivalents) }, note: m.note ?? '' })),
  };
}

export const STEP = 0.5;
export const MAX_PORTIONS = 20;

/** Suma o resta media ración; en 0 el grupo desaparece del tiempo de comida. */
export function stepPortion(eq: Equivalents, group: SmaeGroup, delta: number): Equivalents {
  const next = Math.min(MAX_PORTIONS, Math.max(0, Math.round(((eq[group] ?? 0) + delta) * 2) / 2));
  const out = { ...eq };
  if (next === 0) delete out[group]; else out[group] = next;
  return out;
}

export function mealMacros(meal: Pick<EditableMeal, 'equivalents'>): Macros {
  return macrosFromEquivalents(meal.equivalents);
}

export function planTotals(meals: ReadonlyArray<Pick<EditableMeal, 'equivalents'>>): Macros {
  return sumMacros(meals.map(mealMacros));
}

export const groupsIn = (eq: Equivalents): SmaeGroup[] => SMAE_GROUP_IDS.filter((g) => (eq[g] ?? 0) > 0);
export const groupsMissing = (eq: Equivalents): SmaeGroup[] => SMAE_GROUP_IDS.filter((g) => !(eq[g] ?? 0));
export const groupLabel = (g: SmaeGroup) => SMAE_GROUPS[g].label;

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
/** Acepta "8:00", "0800" o "08:00" y lo deja como HH:MM; vacío = sin hora. */
export function normalizeTime(raw: string): string | null | undefined {
  const t = raw.trim();
  if (!t) return null;
  const m = /^(\d{1,2}):?(\d{2})$/.exec(t);
  if (!m) return undefined;
  const out = `${m[1]!.padStart(2, '0')}:${m[2]}`;
  return TIME.test(out) ? out : undefined;
}

export const MIN_PLAN_KCAL = 800;

/** Valida y convierte al formato del contrato. Devuelve errores por campo o el plan listo para guardar. */
export function validatePlan(draft: PlanDraft):
  | { ok: true; meals: NutritionPlanMeal[]; totals: Macros; name: string; notes: string | null }
  | { ok: false; errors: PlanErrors } {
  const errors: PlanErrors = {};
  const name = draft.name.trim();
  if (!name) errors.name = 'Ponle un nombre al plan.';
  else if (name.length > 80) errors.name = 'Máximo 80 caracteres.';
  const mealErrors: Record<string, string> = {};
  const meals: NutritionPlanMeal[] = [];
  for (const m of draft.meals) {
    const label = m.label.trim();
    const time = normalizeTime(m.time);
    if (!label) mealErrors[m.key] = 'Escribe el nombre del tiempo (p. ej. Desayuno).';
    else if (label.length > 40) mealErrors[m.key] = 'Nombre de máximo 40 caracteres.';
    else if (time === undefined) mealErrors[m.key] = 'La hora debe ser como 08:30 (o déjala vacía).';
    else if (m.note.length > 300) mealErrors[m.key] = 'La nota es de máximo 300 caracteres.';
    meals.push({ label, time: time ?? null, equivalents: { ...m.equivalents }, note: m.note.trim() || null });
  }
  if (Object.keys(mealErrors).length) errors.meals = mealErrors;
  if (draft.meals.length === 0) errors.form = 'Agrega al menos un tiempo de comida.';
  else if (draft.meals.length > 10) errors.form = 'Máximo 10 tiempos de comida.';
  const totals = planTotals(draft.meals);
  if (!errors.form && totals.kcal < MIN_PLAN_KCAL) errors.form = `El plan suma ${totals.kcal} kcal; agrega las raciones (mínimo ${MIN_PLAN_KCAL} kcal al día).`;
  if (draft.notes.length > 2000) errors.form = 'Las indicaciones son de máximo 2000 caracteres.';
  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, meals, totals, name, notes: draft.notes.trim() || null };
}
