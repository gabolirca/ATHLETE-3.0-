import { describe, expect, it } from 'vitest';
import { cleanEquivalents, describeEquivalents, macrosFromEquivalents, sumMacros } from './smae';

describe('SMAE', () => {
  it('3 tacos de bistec: 3 cereales sin grasa + 3 AOA bajo + 1 grasa', () => {
    const m = macrosFromEquivalents({ cereales_sin_grasa: 3, aoa_bajo: 3, grasas_sin_proteina: 1 });
    expect(m).toEqual({ kcal: 3 * 70 + 3 * 55 + 45, proteinG: 27, carbsG: 45, fatG: 14 });
  });
  it('limpia lo que inventa la IA: grupos desconocidos, negativos, texto y medios', () => {
    expect(cleanEquivalents({ cereales_sin_grasa: '2.3', pizza: 4, frutas: -1, verduras: 0.7, libres: 99 })).toEqual({ cereales_sin_grasa: 2.5, verduras: 0.5, libres: 20 });
  });
  it('suma platillos y describe', () => {
    expect(sumMacros([{ kcal: 100, proteinG: 1.25, carbsG: 2, fatG: 3 }, { kcal: 50, proteinG: 1, carbsG: 0, fatG: 0 }])).toEqual({ kcal: 150, proteinG: 2.3, carbsG: 2, fatG: 3 });
    expect(describeEquivalents({ leguminosas: 1, cereales_sin_grasa: 2 })).toBe('2 Cereales sin grasa · 1 Leguminosas');
  });
});
