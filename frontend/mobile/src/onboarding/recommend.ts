import type { Sport } from '@athlete/contracts';

/** Respuestas del asistente de bienvenida. */
export type Goal = 'strength' | 'hybrid' | 'endurance' | 'hyrox' | 'health';
export type Access = 'gym' | 'pool' | 'run';
export type OnboardingAnswers = {
  name: string; goal: Goal | null; level: 'beginner' | 'intermediate' | 'advanced' | null; days: 3 | 4 | 5 | 6 | null;
  access: Access[]; heightCm: string; weightKg: string; estimateNutrition: boolean;
};
export const EMPTY_ANSWERS: OnboardingAnswers = { name: '', goal: null, level: null, days: null, access: ['gym'], heightCm: '', weightKg: '', estimateNutrition: true };

export const GOALS: ReadonlyArray<{ value: Goal; label: string; detail: string; icon: string }> = [
  { value: 'strength', label: 'Ganar fuerza y músculo', detail: 'Rutinas de gym y progresión de cargas', icon: 'barbell-outline' },
  { value: 'hybrid', label: 'Más condición sin perder fuerza', detail: 'Atleta híbrido: fuerza + cardio + funcional', icon: 'flash-outline' },
  { value: 'endurance', label: 'Correr o nadar mejor', detail: 'Resistencia con fuerza de apoyo', icon: 'walk-outline' },
  { value: 'hyrox', label: 'Prepararme para Hyrox', detail: 'Carrera + las 8 estaciones', icon: 'trophy-outline' },
  { value: 'health', label: 'Salud general o bajar grasa', detail: 'Moverte con constancia, sin complicarte', icon: 'heart-outline' },
];
export const goalLabel = (g: Goal) => GOALS.find((x) => x.value === g)!.label;

/** Disciplinas del perfil a partir de la meta y lo que tiene a la mano. */
export function sportsFor(a: Pick<OnboardingAnswers, 'goal' | 'access'>): Sport[] {
  const out = new Set<Sport>();
  if (a.access.includes('gym') || a.goal === 'strength') out.add('strength');
  if (a.goal === 'hybrid' || a.goal === 'hyrox') out.add('functional_fitness');
  if (a.access.includes('pool')) out.add('swimming');
  if (a.access.includes('run') || a.goal === 'hyrox') out.add('running');
  return [...out];
}

export type Recommendation = { slug: string | null; reason: string };

/**
 * Programa sugerido. Reglas simples y explicables (el usuario siempre puede elegir otro):
 * - Hyrox → Hyrox Prep.
 * - Híbrido con 6 días y alberca → Hybrid Athlete 1.0; con 5+ días y donde correr → Corredor híbrido; si no, Híbrido 3 días.
 * - Correr o nadar mejor → Corredor híbrido si corre; Hybrid Athlete si nada 6 días; si no, Híbrido 3 días.
 * - Salud general → Híbrido 3 días.
 * - Fuerza → sus propias rutinas (no un programa híbrido).
 */
export function recommendProgram(a: Pick<OnboardingAnswers, 'goal' | 'days' | 'access'>): Recommendation {
  const days = a.days ?? 3;
  const pool = a.access.includes('pool');
  const run = a.access.includes('run');
  switch (a.goal) {
    case 'hyrox':
      return { slug: 'hyrox-prep', reason: days < 5 ? 'Es el programa para Hyrox. Con menos de 5 días, empieza quitando el rodaje del jueves.' : 'Carrera, fuerza y las 8 estaciones con una media simulación cada semana.' };
    case 'hybrid':
      if (days >= 6 && pool) return { slug: 'hybrid-athlete-1-0', reason: 'Tienes 6 días y alberca: fuerza, funcional y natación como el plan original.' };
      if (days >= 5 && run) return { slug: 'corredor-hibrido', reason: 'Con 5 o más días y dónde correr: 3 de fuerza y 3 de carrera.' };
      return { slug: 'hibrido-3-dias', reason: 'Con tus días disponibles, 2 de fuerza y 1 funcional con cardio te dan lo mejor de ambos.' };
    case 'endurance':
      if (run && days >= 5) return { slug: 'corredor-hibrido', reason: 'Series, rodaje y tirada larga, con fuerza para correr más rápido sin lesionarte.' };
      if (pool && days >= 6) return { slug: 'hybrid-athlete-1-0', reason: '3 sesiones de natación por semana más fuerza para mantener tu músculo.' };
      return { slug: 'hibrido-3-dias', reason: 'Empieza con 3 días; cuando tengas más tiempo pasa a Corredor híbrido.' };
    case 'health':
      return { slug: 'hibrido-3-dias', reason: '3 días a la semana, fuerza de cuerpo completo y cardio: constancia sin complicarte.' };
    default:
      return { slug: null, reason: 'Arma tus rutinas de fuerza: la app te sugiere la carga y te dice qué músculos te faltan.' };
  }
}

/** Valida estatura y peso (opcionales). */
export function parseBody(a: Pick<OnboardingAnswers, 'heightCm' | 'weightKg'>): { ok: true; heightCm: number | null; weightKg: number | null } | { ok: false; error: string } {
  const num = (x: string) => (x.trim() === '' ? null : Number(x.trim().replace(',', '.')));
  const h = num(a.heightCm), w = num(a.weightKg);
  if (h !== null && (!Number.isFinite(h) || h < 100 || h > 250)) return { ok: false, error: 'La estatura va en centímetros (por ejemplo 175).' };
  if (w !== null && (!Number.isFinite(w) || w < 30 || w > 300)) return { ok: false, error: 'El peso va en kilos (por ejemplo 78.5).' };
  return { ok: true, heightCm: h, weightKg: w };
}
