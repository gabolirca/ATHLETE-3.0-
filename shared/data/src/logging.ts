/**
 * Registro sin datos sensibles. Nunca se registran tokens, contraseñas, claves ni cuerpos de datos
 * personales: solo eventos, contadores y códigos de error. `redact` es la última barrera.
 */
export interface Logger {
  debug(event: string, context?: Record<string, unknown>): void;
  info(event: string, context?: Record<string, unknown>): void;
  warn(event: string, context?: Record<string, unknown>): void;
  error(event: string, context?: Record<string, unknown>): void;
}

export const silentLogger: Logger = { debug() {}, info() {}, warn() {}, error() {} };

const SENSITIVE_KEY = /pass(word)?|token|secret|authorization|api[-_]?key|apikey|cookie|session|jwt|refresh|access|email|payload|record/i;
const JWT_LIKE = /eyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]+/g;
const SECRET_KEY_LIKE = /sb_(secret|publishable)_[A-Za-z0-9_-]+/g;

export function redact(value: unknown, depth = 0): unknown {
  if (depth > 5) return '[…]';
  if (typeof value === 'string') return value.replace(JWT_LIKE, '[REDACTED_JWT]').replace(SECRET_KEY_LIKE, '[REDACTED_KEY]');
  if (Array.isArray(value)) return value.slice(0, 20).map((v) => redact(v, depth + 1));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = SENSITIVE_KEY.test(k) ? '[REDACTED]' : redact(v, depth + 1);
    return out;
  }
  return value;
}

/** Envuelve un logger de plataforma aplicando `redact` a todo contexto. */
export function safeLogger(inner: Logger): Logger {
  const wrap = (fn: Logger['info']) => (event: string, context?: Record<string, unknown>) =>
    fn(event, context === undefined ? undefined : (redact(context) as Record<string, unknown>));
  return { debug: wrap(inner.debug), info: wrap(inner.info), warn: wrap(inner.warn), error: wrap(inner.error) };
}
