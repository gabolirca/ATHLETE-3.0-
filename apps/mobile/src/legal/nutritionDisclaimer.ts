import * as SecureStore from 'expo-secure-store';

/**
 * Aviso del plan nutricional provisional. Si cambia el texto, sube la versión: se vuelve a pedir aceptación.
 * BORRADOR redactado por la app; debe revisarlo un abogado antes del lanzamiento público.
 */
export const NUTRITION_DISCLAIMER_VERSION = 'nutricion-provisional-v1-2026-11-07';

export const NUTRITION_DISCLAIMER = {
  title: 'Antes de calcular tu plan',
  points: [
    'El plan es una ESTIMACIÓN automática con fórmulas generales (Mifflin-St Jeor). Es una sugerencia orientativa, no una prescripción.',
    'No es un plan elaborado por un nutriólogo ni constituye consejo médico, diagnóstico ni tratamiento.',
    'No lo uses si estás embarazada o en lactancia, tienes una enfermedad (por ejemplo diabetes, renal o cardiaca), un trastorno de la conducta alimentaria, o tomas medicamentos que afecten tu alimentación: consulta antes a un profesional de la salud.',
    'Solo para mayores de 18 años.',
    'Eres responsable de las decisiones que tomes con esta información. Si tienes un plan de un nutriólogo, captúralo y úsalo en lugar de esta estimación.',
  ],
  accept: 'Entiendo que es una sugerencia y no un plan profesional',
} as const;

const KEY = 'athlete3.nutrition-disclaimer';

export async function hasAcceptedNutritionDisclaimer(): Promise<boolean> {
  try {
    const raw = await SecureStore.getItemAsync(KEY);
    return raw !== null && (JSON.parse(raw) as { version?: string }).version === NUTRITION_DISCLAIMER_VERSION;
  } catch {
    return false;
  }
}

/** Guarda la versión aceptada y cuándo. (El registro en el servidor llegará con los Términos de uso.) */
export async function acceptNutritionDisclaimer(now = new Date()): Promise<void> {
  await SecureStore.setItemAsync(KEY, JSON.stringify({ version: NUTRITION_DISCLAIMER_VERSION, acceptedAt: now.toISOString() }));
}
