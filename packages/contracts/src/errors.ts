import { z } from 'zod';

/**
 * Códigos de error estables. Agregar un código es un cambio menor;
 * renombrar o eliminar uno es un cambio mayor.
 */
export const ErrorCode = z.enum([
  'VALIDATION_FAILED',
  'NOT_FOUND',
  'UNAUTHENTICATED',
  'SESSION_EXPIRED',
  'FORBIDDEN',
  'CONFLICT',
  'INVALID_STATE',
  'DUPLICATE',
  'NETWORK_UNAVAILABLE',
  'TIMEOUT',
  'RATE_LIMITED',
  'STORAGE_FAILURE',
  'SYNC_REJECTED',
  'INTERNAL',
]);
export type ErrorCode = z.infer<typeof ErrorCode>;

/** Si un código es reintentable por defecto (puede sobrescribirse por error). */
export const DEFAULT_RETRYABLE: Readonly<Record<ErrorCode, boolean>> = {
  VALIDATION_FAILED: false,
  NOT_FOUND: false,
  UNAUTHENTICATED: false,
  SESSION_EXPIRED: false,
  FORBIDDEN: false,
  CONFLICT: false,
  INVALID_STATE: false,
  DUPLICATE: false,
  NETWORK_UNAVAILABLE: true,
  TIMEOUT: true,
  RATE_LIMITED: true,
  STORAGE_FAILURE: true,
  SYNC_REJECTED: false,
  INTERNAL: true,
};

/**
 * Error de aplicación seguro para mostrar.
 * - `message`: texto seguro, sin secretos ni detalles internos del servidor.
 * - `details`: contexto técnico estructurado (p. ej. campos inválidos); nunca SQL, stack ni claves.
 */
export const AppError = z.object({
  code: ErrorCode,
  message: z.string().min(1),
  retryable: z.boolean(),
  details: z.record(z.string(), z.unknown()).optional(),
});
export type AppError = z.infer<typeof AppError>;

export function appError(
  code: ErrorCode,
  message: string,
  options: { retryable?: boolean; details?: Record<string, unknown> } = {},
): AppError {
  const error: AppError = { code, message, retryable: options.retryable ?? DEFAULT_RETRYABLE[code] };
  if (options.details !== undefined) error.details = options.details;
  return error;
}

/** Resultado explícito de las operaciones de repositorio: no se lanzan excepciones a la UI. */
export type Result<T> = { ok: true; value: T } | { ok: false; error: AppError };

export const ok = <T>(value: T): Result<T> => ({ ok: true, value });
export const err = <T = never>(error: AppError): Result<T> => ({ ok: false, error });

/** Convierte un fallo de Zod en `VALIDATION_FAILED` con las rutas de los campos inválidos. */
export function validationError(error: z.ZodError): AppError {
  return appError('VALIDATION_FAILED', 'Los datos introducidos no son válidos.', {
    details: {
      issues: error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    },
  });
}

/** Valida una entrada con un esquema y devuelve `Result` en lugar de lanzar. */
export function parseInput<S extends z.ZodType>(schema: S, input: unknown): Result<z.output<S>> {
  const parsed = schema.safeParse(input);
  return parsed.success ? ok(parsed.data) : err(validationError(parsed.error));
}
