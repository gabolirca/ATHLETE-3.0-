import { appError, ErrorCode, type AppError } from '@athlete/contracts';

/** Forma común de los errores de PostgREST / supabase-js. */
export type SupabaseErrorLike = { message?: string; code?: string; status?: number; name?: string; details?: unknown; hint?: unknown };

const NETWORK = /fetch failed|failed to fetch|network request failed|networkerror|load failed|ECONNREFUSED|ENOTFOUND|ETIMEDOUT/i;

/**
 * Normaliza un error remoto a `AppError` con mensaje seguro. Nunca propaga el mensaje,
 * detalle ni pista del servidor (pueden contener SQL o datos internos).
 */
export function fromSupabaseError(error: SupabaseErrorLike | null | undefined): AppError {
  const message = error?.message ?? '';
  if (message.startsWith('ATHLETE:')) {
    const parsed = ErrorCode.safeParse(message.slice('ATHLETE:'.length));
    if (parsed.success) return appError(parsed.data, msg(parsed.data));
  }
  // Solo es "sin conexión" si no hubo respuesta del servidor. supabase-js también marca como reintentables
  // algunas respuestas 5xx: esas son errores del servidor, no de la red.
  const noResponse = error?.status === undefined || error?.status === 0;
  if (error?.status === 0 || (error?.name === 'AuthRetryableFetchError' && noResponse) || NETWORK.test(message)) {
    return appError('NETWORK_UNAVAILABLE', 'Sin conexión. Los cambios se guardan en el dispositivo.');
  }
  if (error?.status === 429) return appError('RATE_LIMITED', msg('RATE_LIMITED'));
  // El servidor anota cada llamada a nombre del usuario del token. Si esa cuenta ya se borró (p. ej. al limpiar la de pruebas),
  // el token sigue vigente hasta una hora pero cada sync falla: no es un error del servidor ni se arregla reintentando.
  if (error?.code === '23503' && /rate_limit_buckets_user_id_fkey/.test(message)) {
    return appError('SESSION_EXPIRED', 'Tu cuenta ya no existe en el servidor. Cierra sesión y vuelve a registrarte.');
  }
  switch (error?.code) {
    case 'PGRST301':
    case 'PGRST303':
      return appError('SESSION_EXPIRED', msg('SESSION_EXPIRED'));
    case '28000':
    case 'PGRST302':
      return appError('UNAUTHENTICATED', msg('UNAUTHENTICATED'));
    case '42501':
      return appError('FORBIDDEN', msg('FORBIDDEN'));
    case '57014':
      return appError('TIMEOUT', 'La operación tardó demasiado.');
  }
  if (error?.status === 401) return appError('SESSION_EXPIRED', msg('SESSION_EXPIRED'));
  if (error?.status === 403) return appError('FORBIDDEN', msg('FORBIDDEN'));
  return appError('INTERNAL', 'Error del servidor. Se reintentará.', { retryable: true });
}

const safeMessages: Partial<Record<ErrorCode, string>> = {
  VALIDATION_FAILED: 'Los datos no son válidos.',
  UNAUTHENTICATED: 'Debes iniciar sesión.',
  SESSION_EXPIRED: 'Tu sesión expiró. Vuelve a iniciar sesión para sincronizar.',
  FORBIDDEN: 'Operación no permitida.',
  RATE_LIMITED: 'Demasiadas solicitudes. Inténtalo más tarde.',
  INVALID_STATE: 'Operación no permitida en el estado actual.',
  NOT_FOUND: 'El registro no existe.',
  CONFLICT: 'El registro cambió en otro dispositivo.',
};

const msg = (code: ErrorCode): string => safeMessages[code] ?? 'Error.';
