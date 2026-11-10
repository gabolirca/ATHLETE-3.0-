import * as SecureStore from 'expo-secure-store';
import { cleanEquivalents, macrosFromEquivalents, sumMacros, type Equivalents, type Macros } from '@athlete/domain';
import { getCloud } from '@/account/cloud';

/** Lo que reconoce la IA (ver supabase/functions/analizar-comida). Sin kcal: esas se calculan con el SMAE. */
export type FoodPhotoResult = {
  es_comida: boolean;
  platillos: Array<{ nombre: string; porcion: string; equivalentes: Equivalents }>;
  confianza: 'alta' | 'media' | 'baja';
  nota: string;
  modelo: string;
};

export type Dish = { name: string; portion: string; equivalents: Equivalents };

const CONSENT_KEY = 'athlete3.food-photo-consent.v1';
export async function hasPhotoConsent(): Promise<boolean> {
  try { return (await SecureStore.getItemAsync(CONSENT_KEY)) === '1'; } catch { return false; }
}
export async function acceptPhotoConsent(): Promise<void> { await SecureStore.setItemAsync(CONSENT_KEY, '1'); }

const MESSAGES: Record<string, string> = {
  UNAUTHENTICATED: 'Inicia sesión en tu cuenta para analizar fotos (Perfil → Cuenta).',
  RATE_LIMITED: 'Llegaste al límite de fotos de hoy. Mañana se renueva; mientras, regístrala a mano.',
  NOT_CONFIGURED: 'El análisis de fotos todavía no está activado en el servidor.',
  PROVIDER_FAILED: 'El servicio de análisis no respondió. Intenta en un momento o regístrala a mano.',
  VALIDATION_FAILED: 'No pudimos leer la foto. Intenta con otra.',
};

export class PhotoAnalysisError extends Error {}

/** Manda la foto (base64, ya reducida) a la Edge Function. La foto no se guarda en ningún lado. */
export async function analyzeFoodPhoto(base64: string, mime: 'image/jpeg' | 'image/png' = 'image/jpeg'): Promise<FoodPhotoResult> {
  const cloud = getCloud();
  if (!cloud) throw new PhotoAnalysisError('La nube no está configurada en esta compilación.');
  const { data, error } = await cloud.supabase.functions.invoke('analizar-comida', { body: { imagen: base64, mime } });
  if (error) {
    let code = '';
    try { const ctx = (error as { context?: Response }).context; code = ctx ? ((await ctx.json()) as { error?: string }).error ?? '' : ''; } catch { /* sin cuerpo */ }
    if (!code && /fetch|network/i.test(error.message)) throw new PhotoAnalysisError('Sin conexión. Registra la comida a mano y vuelve a intentar con red.');
    throw new PhotoAnalysisError(MESSAGES[code] ?? 'No se pudo analizar la foto. Intenta de nuevo.');
  }
  const r = data as FoodPhotoResult;
  return { ...r, platillos: (r.platillos ?? []).map((p) => ({ ...p, equivalentes: cleanEquivalents(p.equivalentes as Record<string, unknown>) })) };
}

export function dishesFrom(result: FoodPhotoResult): Dish[] {
  return result.platillos.map((p) => ({ name: p.nombre, portion: p.porcion, equivalents: p.equivalentes }));
}

export function totals(dishes: readonly Dish[]): Macros {
  return sumMacros(dishes.map((d) => macrosFromEquivalents(d.equivalents)));
}

/** ¿El usuario cambió algo respecto a lo que dijo la IA? (para medir la calidad de la estimación). */
export function wasEdited(original: FoodPhotoResult, dishes: readonly Dish[]): boolean {
  const a = JSON.stringify(dishesFrom(original).map((d) => d.equivalents));
  const b = JSON.stringify(dishes.map((d) => d.equivalents));
  return a !== b || original.platillos.length !== dishes.length;
}
