import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { SecureKeyValueStorage } from '@athlete/contracts';
import type { AppEnvironment } from '../config/environment';

function decodeJwtRole(key: string): string | null {
  const parts = key.split('.');
  if (parts.length !== 3) return null;
  try {
    const json = globalThis.atob(parts[1]!.replace(/-/g, '+').replace(/_/g, '/'));
    return (JSON.parse(json) as { role?: string }).role ?? null;
  } catch {
    return null;
  }
}

/**
 * Garantiza que la app solo use claves públicas. Una clave secreta / service_role en el cliente
 * daría acceso total saltándose RLS: se rechaza antes de crear el cliente.
 */
export function assertPublicKey(key: string): void {
  if (key.startsWith('sb_secret_')) throw new Error('Clave secreta detectada: la app solo admite claves publicables');
  const role = decodeJwtRole(key);
  if (role !== null && role !== 'anon') throw new Error('Clave JWT con rol privilegiado detectada');
  if (role === null && !key.startsWith('sb_publishable_')) throw new Error('Formato de clave pública no reconocido');
}

export type AthleteSupabaseClient = SupabaseClient<any, 'athlete3', any>;

/**
 * Cliente Supabase de la app:
 *  - esquema `athlete3` por defecto (nunca `public`);
 *  - sesión persistida SOLO en almacenamiento seguro (`SecureKeyValueStorage`);
 *  - renovación automática de tokens (en RN, iniciar/detener con AppState: `auth.startAutoRefresh()`);
 *  - flujo PKCE para enlaces de confirmación/recuperación.
 */
export function createAthleteSupabaseClient(env: AppEnvironment, storage: SecureKeyValueStorage): AthleteSupabaseClient {
  assertPublicKey(env.supabasePublishableKey);
  return createClient(env.supabaseUrl, env.supabasePublishableKey, {
    db: { schema: 'athlete3' },
    auth: {
      storage,
      storageKey: `athlete3-auth-${env.name}`,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      flowType: 'pkce',
    },
    global: { headers: { 'x-athlete-env': env.name } },
  }) as AthleteSupabaseClient;
}
