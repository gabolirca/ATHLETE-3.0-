/**
 * Sistema Mexicano de Alimentos Equivalentes (SMAE): cada grupo tiene un aporte promedio por equivalente.
 * Nutrición Pro usa la IA SOLO para reconocer el platillo y su porción en equivalentes; las kcal y los macros
 * se calculan aquí, con estos valores por grupo. Así la cuenta es nuestra, coherente y más fiel a la comida
 * mexicana que los números que inventa un modelo.
 */
export type SmaeGroupInfo = { label: string; kcal: number; proteinG: number; carbsG: number; fatG: number; example: string };

export const SMAE_GROUPS = {
  verduras: { label: 'Verduras', kcal: 25, proteinG: 2, carbsG: 4, fatG: 0, example: '½ taza de verdura cocida o 1 taza cruda' },
  frutas: { label: 'Frutas', kcal: 60, proteinG: 0, carbsG: 15, fatG: 0, example: '1 manzana chica o 1 taza de papaya' },
  cereales_sin_grasa: { label: 'Cereales sin grasa', kcal: 70, proteinG: 2, carbsG: 15, fatG: 0, example: '1 tortilla de maíz, ⅓ taza de arroz cocido o ½ bolillo' },
  cereales_con_grasa: { label: 'Cereales con grasa', kcal: 115, proteinG: 2, carbsG: 15, fatG: 5, example: '1 tortilla de harina, ½ pan dulce chico o 2 galletas' },
  leguminosas: { label: 'Leguminosas', kcal: 120, proteinG: 8, carbsG: 20, fatG: 1, example: '½ taza de frijol, lenteja o garbanzo cocido' },
  aoa_muy_bajo: { label: 'Origen animal muy bajo en grasa', kcal: 40, proteinG: 7, carbsG: 0, fatG: 1, example: '40 g de pechuga sin piel, atún en agua o 2 claras' },
  aoa_bajo: { label: 'Origen animal bajo en grasa', kcal: 55, proteinG: 7, carbsG: 0, fatG: 3, example: '30 g de bistec de res, 40 g de queso fresco' },
  aoa_moderado: { label: 'Origen animal moderado en grasa', kcal: 75, proteinG: 7, carbsG: 0, fatG: 5, example: '1 huevo, 30 g de carne molida o queso Oaxaca' },
  aoa_alto: { label: 'Origen animal alto en grasa', kcal: 100, proteinG: 7, carbsG: 0, fatG: 8, example: '30 g de chorizo, longaniza, chicharrón o queso amarillo' },
  leche_descremada: { label: 'Leche descremada', kcal: 95, proteinG: 9, carbsG: 12, fatG: 2, example: '1 taza de leche descremada o yogur natural light' },
  leche_semidescremada: { label: 'Leche semidescremada', kcal: 110, proteinG: 9, carbsG: 12, fatG: 4, example: '1 taza de leche semidescremada' },
  leche_entera: { label: 'Leche entera', kcal: 150, proteinG: 9, carbsG: 12, fatG: 8, example: '1 taza de leche entera' },
  leche_con_azucar: { label: 'Leche con azúcar', kcal: 200, proteinG: 8, carbsG: 30, fatG: 5, example: '1 taza de leche con chocolate o yogur de sabor' },
  grasas_sin_proteina: { label: 'Aceites y grasas', kcal: 45, proteinG: 0, carbsG: 0, fatG: 5, example: '1 cdita de aceite, ⅓ de aguacate o 1 cda de crema' },
  grasas_con_proteina: { label: 'Grasas con proteína', kcal: 70, proteinG: 3, carbsG: 3, fatG: 5, example: '10 cacahuates, 14 almendras o 1 cda de crema de cacahuate' },
  azucares_sin_grasa: { label: 'Azúcares', kcal: 40, proteinG: 0, carbsG: 10, fatG: 0, example: '2 cditas de azúcar, ½ taza de refresco o agua de sabor' },
  azucares_con_grasa: { label: 'Azúcares con grasa', kcal: 85, proteinG: 0, carbsG: 10, fatG: 5, example: '1 cda de cajeta o un chocolate chico' },
  libres: { label: 'Libres de energía', kcal: 0, proteinG: 0, carbsG: 0, fatG: 0, example: 'agua, café o té sin azúcar, salsa, limón' },
} as const satisfies Record<string, SmaeGroupInfo>;

export type SmaeGroup = keyof typeof SMAE_GROUPS;
export const SMAE_GROUP_IDS = Object.keys(SMAE_GROUPS) as SmaeGroup[];
export type Equivalents = Partial<Record<SmaeGroup, number>>;
export type Macros = { kcal: number; proteinG: number; carbsG: number; fatG: number };

const r0 = (n: number) => Math.round(n);
const r1 = (n: number) => Math.round(n * 10) / 10;

export const isSmaeGroup = (g: string): g is SmaeGroup => Object.prototype.hasOwnProperty.call(SMAE_GROUPS, g);

/** Limpia lo que devuelva la IA: solo grupos válidos, números de 0 a 20 en pasos de ½. */
export function cleanEquivalents(raw: Record<string, unknown> | null | undefined): Equivalents {
  const out: Equivalents = {};
  for (const [g, v] of Object.entries(raw ?? {})) {
    const n = typeof v === 'number' ? v : Number(v);
    if (!isSmaeGroup(g) || !Number.isFinite(n) || n <= 0) continue;
    out[g] = Math.min(20, Math.round(n * 2) / 2);
  }
  return out;
}

export function macrosFromEquivalents(eq: Equivalents): Macros {
  let kcal = 0, proteinG = 0, carbsG = 0, fatG = 0;
  for (const g of SMAE_GROUP_IDS) {
    const n = eq[g] ?? 0;
    if (!n) continue;
    const info = SMAE_GROUPS[g];
    kcal += n * info.kcal; proteinG += n * info.proteinG; carbsG += n * info.carbsG; fatG += n * info.fatG;
  }
  return { kcal: r0(kcal), proteinG: r1(proteinG), carbsG: r1(carbsG), fatG: r1(fatG) };
}

export function sumMacros(list: readonly Macros[]): Macros {
  const t = list.reduce((a, m) => ({ kcal: a.kcal + m.kcal, proteinG: a.proteinG + m.proteinG, carbsG: a.carbsG + m.carbsG, fatG: a.fatG + m.fatG }), { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 });
  return { kcal: r0(t.kcal), proteinG: r1(t.proteinG), carbsG: r1(t.carbsG), fatG: r1(t.fatG) };
}

/** "2 Cereales sin grasa · 1 Origen animal moderado en grasa". */
export function describeEquivalents(eq: Equivalents): string {
  return SMAE_GROUP_IDS.filter((g) => eq[g]).map((g) => `${eq[g]} ${SMAE_GROUPS[g].label}`).join(' · ');
}
