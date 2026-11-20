import { colors } from '@/theme/colors';

/**
 * La "vida" de ATHLETE: íconos por zona que entrenas, colores de acento sacados del logo y la frase del día.
 * Todo sale de aquí para que cada pantalla hable igual (y para cambiar de gimnasio solo se toca este archivo).
 */
export type Tone = 'red' | 'green' | 'amber';
export const toneColor = (t: Tone) => (t === 'red' ? colors.blue : t === 'green' ? colors.green : colors.amber);
export const toneSoft = (t: Tone) => (t === 'red' ? colors.accentSoft : t === 'green' ? colors.greenSoft : colors.amberSoft);

/** Ícono (MaterialCommunityIcons) y color por zona. */
export const ZONES = {
  pierna: { icon: 'weight-lifter', tone: 'red' },
  pecho: { icon: 'dumbbell', tone: 'red' },
  espalda: { icon: 'rowing', tone: 'green' },
  hombro: { icon: 'arm-flex', tone: 'amber' },
  brazo: { icon: 'arm-flex-outline', tone: 'amber' },
  abdomen: { icon: 'human-handsdown', tone: 'green' },
  cardio: { icon: 'heart-pulse', tone: 'red' },
  libre: { icon: 'kettlebell', tone: 'amber' },
} as const satisfies Record<string, { icon: string; tone: Tone }>;
export type Zone = keyof typeof ZONES;

export { nextPhrase, sessionPhrase } from './phrases';
