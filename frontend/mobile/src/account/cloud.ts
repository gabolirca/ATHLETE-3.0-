import * as SecureStore from 'expo-secure-store';
import {
  createAthleteSupabaseClient, loadEnvironment, SupabaseAuthService, SupabaseSyncTransport,
  type AppEnvironment, type AthleteSupabaseClient,
} from '@athlete/data';
import { createChunkedStore } from './chunkedSecureStore';

/** Deep link registrado en Supabase (Authentication → URL Configuration). Coincide con `scheme` de app.json. */
export const AUTH_REDIRECT = 'athlete3://auth/callback';

export type Cloud = {
  env: AppEnvironment;
  supabase: AthleteSupabaseClient;
  auth: SupabaseAuthService;
  transport: SupabaseSyncTransport;
};

let cached: { cloud: Cloud | null; reason: string | null } | null = null;

/**
 * Cliente de nube único por proceso. Si el ambiente no está configurado (sin `.env`), devuelve null y la app
 * sigue funcionando solo en local. Metro solo inlinea accesos LITERALES a `process.env.EXPO_PUBLIC_*`.
 */
export function getCloud(): Cloud | null {
  if (cached) return cached.cloud;
  const env = loadEnvironment({
    EXPO_PUBLIC_ATHLETE_ENV: process.env.EXPO_PUBLIC_ATHLETE_ENV,
    EXPO_PUBLIC_SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL,
    EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  });
  if (!env.ok) {
    cached = { cloud: null, reason: env.error.message };
    return null;
  }
  const storage = createChunkedStore({
    getItem: (key) => SecureStore.getItemAsync(key),
    setItem: (key, value) => SecureStore.setItemAsync(key, value),
    removeItem: (key) => SecureStore.deleteItemAsync(key),
  });
  const supabase = createAthleteSupabaseClient(env.value, storage);
  cached = {
    reason: null,
    cloud: { env: env.value, supabase, auth: new SupabaseAuthService(supabase.auth, { redirectTo: AUTH_REDIRECT }), transport: new SupabaseSyncTransport(supabase) },
  };
  return cached.cloud;
}

/** Por qué la nube no está disponible (para mostrarlo en Perfil). */
export function cloudUnavailableReason(): string | null {
  getCloud();
  return cached?.reason ?? null;
}

export function _resetCloudForTesting() { cached = null; }
