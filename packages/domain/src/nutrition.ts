/**
 * Plan nutricional PROVISIONAL (estimación de libro, no prescripción):
 *  - Gasto basal: Mifflin-St Jeor (1990).
 *  - Gasto diario: basal × factor de actividad.
 *  - Objetivo: −15 % para bajar, +10 % para subir, con un piso de seguridad.
 *  - Proteína por kg de peso; grasa 25 % de las kcal; carbohidratos = el resto.
 * La app lo presenta como sugerencia que el usuario debe aceptar; no sustituye a un nutriólogo.
 */
export type BiologicalSex = 'male' | 'female';
export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active';
export type NutritionGoal = 'lose' | 'maintain' | 'gain';

export const ACTIVITY_FACTORS: Readonly<Record<ActivityLevel, number>> = {
  sedentary: 1.2, light: 1.375, moderate: 1.55, active: 1.725, very_active: 1.9,
};
const GOAL_ADJUSTMENT: Readonly<Record<NutritionGoal, number>> = { lose: -0.15, maintain: 0, gain: 0.1 };
const PROTEIN_G_PER_KG: Readonly<Record<NutritionGoal, number>> = { lose: 2.0, maintain: 1.8, gain: 1.8 };
/** Piso habitual para no sugerir dietas muy bajas sin supervisión. */
const MIN_KCAL: Readonly<Record<BiologicalSex, number>> = { female: 1200, male: 1500 };

export type NutritionPlanInput = {
  sex: BiologicalSex;
  ageYears: number;
  heightCm: number;
  weightKg: number;
  activity: ActivityLevel;
  goal: NutritionGoal;
};

export type NutritionPlanEstimate = {
  bmrKcal: number;
  tdeeKcal: number;
  energyKcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  /** El objetivo se subió al piso de seguridad. */
  flooredToMinimum: boolean;
};

export type NutritionPlanError = 'age' | 'height' | 'weight';

/** Solo adultos: las fórmulas y el piso no aplican a menores. */
export function validateNutritionPlanInput(i: Pick<NutritionPlanInput, 'ageYears' | 'heightCm' | 'weightKg'>): NutritionPlanError[] {
  const errors: NutritionPlanError[] = [];
  if (!Number.isFinite(i.ageYears) || i.ageYears < 18 || i.ageYears > 90) errors.push('age');
  if (!Number.isFinite(i.heightCm) || i.heightCm < 120 || i.heightCm > 230) errors.push('height');
  if (!Number.isFinite(i.weightKg) || i.weightKg < 35 || i.weightKg > 300) errors.push('weight');
  return errors;
}

export function mifflinStJeorBmr(i: Pick<NutritionPlanInput, 'sex' | 'ageYears' | 'heightCm' | 'weightKg'>): number {
  return 10 * i.weightKg + 6.25 * i.heightCm - 5 * i.ageYears + (i.sex === 'male' ? 5 : -161);
}

const round10 = (n: number) => Math.round(n / 10) * 10;

export function estimateNutritionPlan(i: NutritionPlanInput): NutritionPlanEstimate {
  const invalid = validateNutritionPlanInput(i);
  if (invalid.length) throw new RangeError(`Datos fuera de rango: ${invalid.join(', ')}`);
  const bmr = mifflinStJeorBmr(i);
  const tdee = bmr * ACTIVITY_FACTORS[i.activity];
  const raw = tdee * (1 + GOAL_ADJUSTMENT[i.goal]);
  const floor = MIN_KCAL[i.sex];
  const energyKcal = round10(Math.max(raw, floor));
  const proteinG = Math.round(PROTEIN_G_PER_KG[i.goal] * i.weightKg);
  const fatG = Math.round((energyKcal * 0.25) / 9);
  const carbsG = Math.max(0, Math.round((energyKcal - proteinG * 4 - fatG * 9) / 4));
  return { bmrKcal: Math.round(bmr), tdeeKcal: Math.round(tdee), energyKcal, proteinG, carbsG, fatG, flooredToMinimum: raw < floor };
}
