/**
 * Funciones visibles en ATHLETE. (El código viene compartido con Mundo Fit, donde varias van apagadas.)
 * - foodPhoto: comida por foto con IA (Cloudflare/Groq) + tabla SMAE.
 * - nutritionCalc: plan de comida calculado por la app.
 * - hybrid: programas híbridos, bloques, WOD y modo alberca.
 */
export const FEATURES = {
  foodPhoto: true,
  nutritionCalc: true,
  hybrid: true,
} as const;
