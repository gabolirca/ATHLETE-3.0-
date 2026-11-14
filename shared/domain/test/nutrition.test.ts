import { describe, expect, it } from 'vitest';
import { estimateNutritionPlan, mifflinStJeorBmr, validateNutritionPlanInput } from '../src/nutrition';

describe('plan nutricional provisional', () => {
  it('Mifflin-St Jeor con los valores de referencia', () => {
    // Hombre 30 años, 180 cm, 80 kg: 800 + 1125 − 150 + 5 = 1780
    expect(mifflinStJeorBmr({ sex: 'male', ageYears: 30, heightCm: 180, weightKg: 80 })).toBe(1780);
    // Mujer 25 años, 165 cm, 60 kg: 600 + 1031.25 − 125 − 161 = 1345.25
    expect(mifflinStJeorBmr({ sex: 'female', ageYears: 25, heightCm: 165, weightKg: 60 })).toBe(1345.25);
  });

  it('mantener: gasto diario redondeado y macros que suman las kcal', () => {
    const p = estimateNutritionPlan({ sex: 'male', ageYears: 30, heightCm: 180, weightKg: 80, activity: 'moderate', goal: 'maintain' });
    expect(p).toMatchObject({ bmrKcal: 1780, tdeeKcal: 2759, energyKcal: 2760, proteinG: 144, fatG: 77, flooredToMinimum: false });
    const total = p.proteinG * 4 + p.carbsG * 4 + p.fatG * 9;
    expect(Math.abs(total - p.energyKcal)).toBeLessThan(10);
  });

  it('bajar: −15 % y más proteína; subir: +10 %', () => {
    const base = { sex: 'female' as const, ageYears: 25, heightCm: 165, weightKg: 60, activity: 'light' as const };
    const keep = estimateNutritionPlan({ ...base, goal: 'maintain' });
    const lose = estimateNutritionPlan({ ...base, goal: 'lose' });
    const gain = estimateNutritionPlan({ ...base, goal: 'gain' });
    const tdee = 1345.25 * 1.375; // 1849.72
    expect(keep.energyKcal).toBe(1850);
    expect(lose.energyKcal).toBe(Math.round((tdee * 0.85) / 10) * 10); // 1570
    expect(gain.energyKcal).toBe(Math.round((tdee * 1.1) / 10) * 10); // 2030
    expect(lose.proteinG).toBe(120);
  });

  it('nunca sugiere menos del piso de seguridad', () => {
    const p = estimateNutritionPlan({ sex: 'female', ageYears: 70, heightCm: 150, weightKg: 45, activity: 'sedentary', goal: 'lose' });
    expect(p).toMatchObject({ energyKcal: 1200, flooredToMinimum: true });
  });

  it('solo adultos y rangos razonables', () => {
    expect(validateNutritionPlanInput({ ageYears: 16, heightCm: 170, weightKg: 60 })).toEqual(['age']);
    expect(validateNutritionPlanInput({ ageYears: 30, heightCm: 1.7, weightKg: 600 })).toEqual(['height', 'weight']);
    expect(() => estimateNutritionPlan({ sex: 'male', ageYears: 15, heightCm: 170, weightKg: 60, activity: 'light', goal: 'gain' })).toThrow(RangeError);
  });
});
