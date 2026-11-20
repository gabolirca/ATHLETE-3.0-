import { appError, err, ok, type Result } from '@athlete/contracts';
import { z } from 'zod';
import { assertPublicKey } from '../supabase/client';

/**
 * Ambientes completamente separados: cada uno con su proyecto Supabase, claves y datos.
 * Solo se admiten valores PÚBLICOS (URL + clave publicable). Los secretos nunca están en la app.
 */
export const AthleteEnvName = z.enum(['local', 'development', 'testing', 'production']);
export type AthleteEnvName = z.infer<typeof AthleteEnvName>;

/**
 * Referencia del proyecto de producción. Permanece `null` hasta que el propietario la confirme
 * documentalmente (ADR-0002 §3): mientras sea null, la app se niega a arrancar en producción.
 */
export const APPROVED_PRODUCTION_PROJECT_REF: string | null = null;

const LOCAL_HOSTS = /^(localhost|127\.0\.0\.1|10\.0\.2\.2|192\.168\.\d{1,3}\.\d{1,3}|\[::1\])$/;

export const AppEnvironment = z
  .object({
    name: AthleteEnvName,
    supabaseUrl: z.url(),
    supabasePublishableKey: z.string().min(20),
  })
  .superRefine((env, ctx) => {
    const url = new URL(env.supabaseUrl);
    const isLocal = LOCAL_HOSTS.test(url.hostname);
    if (env.name === 'local' && !isLocal) ctx.addIssue({ code: 'custom', path: ['supabaseUrl'], message: 'local debe apuntar a un host local' });
    if (env.name !== 'local') {
      if (isLocal) ctx.addIssue({ code: 'custom', path: ['supabaseUrl'], message: `${env.name} no puede apuntar a un host local` });
      if (url.protocol !== 'https:') ctx.addIssue({ code: 'custom', path: ['supabaseUrl'], message: 'se requiere https' });
    }
    try {
      assertPublicKey(env.supabasePublishableKey);
    } catch (e) {
      ctx.addIssue({ code: 'custom', path: ['supabasePublishableKey'], message: (e as Error).message });
    }
  });
export type AppEnvironment = z.infer<typeof AppEnvironment>;

/**
 * Construye el ambiente desde variables públicas. En Expo, pasar los valores accediendo literalmente a
 * `process.env.EXPO_PUBLIC_*` (Metro solo inlinea accesos literales).
 */
export function loadEnvironment(
  vars: { EXPO_PUBLIC_ATHLETE_ENV?: string; EXPO_PUBLIC_SUPABASE_URL?: string; EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY?: string },
  approvedProductionRef: string | null = APPROVED_PRODUCTION_PROJECT_REF,
): Result<AppEnvironment> {
  const parsed = AppEnvironment.safeParse({
    name: vars.EXPO_PUBLIC_ATHLETE_ENV,
    supabaseUrl: vars.EXPO_PUBLIC_SUPABASE_URL,
    supabasePublishableKey: vars.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  });
  if (!parsed.success) {
    return err(appError('VALIDATION_FAILED', 'Configuración de ambiente no válida.', {
      details: { issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) },
    }));
  }
  const env = parsed.data;
  if (env.name === 'production') {
    const host = new URL(env.supabaseUrl).hostname;
    if (approvedProductionRef === null || host !== `${approvedProductionRef}.supabase.co`) {
      return err(appError('FORBIDDEN', 'El proyecto de producción no está aprobado.'));
    }
  }
  return ok(env);
}
