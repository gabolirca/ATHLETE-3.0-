import { appError, err, ok, parseInput, type Result } from '@athlete/contracts';
import { roundTo } from '@athlete/domain';
import type { z } from 'zod';
import { DataError, fail, type LocalStore } from '../local/store';

/** Convierte errores de dominio/almacén en `Result`. Errores inesperados → INTERNAL (sin detalles). */
export async function guard<T>(fn: () => Promise<T>): Promise<Result<T>> {
  try {
    return ok(await fn());
  } catch (e) {
    if (e instanceof DataError) return err(e.appError);
    return err(appError('STORAGE_FAILURE', 'No se pudo guardar localmente.'));
  }
}

/** Valida una entrada; lanza DataError(VALIDATION_FAILED) dentro de `guard`. */
export function input<S extends z.ZodType>(schema: S, value: unknown): z.output<S> {
  const r = parseInput(schema, value);
  if (!r.ok) throw new DataError(r.error);
  return r.value;
}

export function unwrap<T>(r: Result<T>): T {
  if (!r.ok) throw new DataError(r.error);
  return r.value;
}

/** Cursor de página opaco (desplazamiento) para consultas locales. Sin Buffer: compatible con Hermes. */
export const encodeCursor = (offset: number) => `o${offset.toString(36)}`;
export function decodeCursor(cursor: string | null | undefined): number {
  if (!cursor) return 0;
  const n = /^o[0-9a-z]{1,10}$/.test(cursor) ? parseInt(cursor.slice(1), 36) : NaN;
  if (!Number.isInteger(n) || n < 0) throw new DataError(appError('VALIDATION_FAILED', 'Cursor no válido.'));
  return n;
}

// ---------- Restricciones del servidor que el contrato aún no expresa ----------
// Se aplican antes de escribir: una mutación que el servidor rechaza queda `rejected` en la outbox para siempre.

/** `position between 0 and 1000` en todas las tablas ordenadas de `athlete3`. */
export const MAX_POSITION = 1000;

export function checkPosition(position: number, field = 'position'): number {
  if (position > MAX_POSITION) fail('VALIDATION_FAILED', `La posición no puede superar ${MAX_POSITION}.`, { details: { field } });
  return position;
}

/** `*_sane_dates` (sesiones, cardio, comidas): posterior a 2000-01-01 y como mucho 2 días por delante del reloj. */
export function checkStartedAt(startedAt: string, now: string, field = 'startedAt', label = 'La hora de inicio'): void {
  const t = Date.parse(startedAt);
  if (!(t > Date.parse('2000-01-01T00:00:00Z')) || t >= Date.parse(now) + 2 * 86_400_000) {
    fail('VALIDATION_FAILED', `${label} está fuera de rango.`, { details: { field } });
  }
}

/**
 * Escala de las columnas `numeric(p, s)` del servidor. Postgres redondea al guardar y un pull no reaplica la
 * misma revisión, así que sin esto la copia local diferiría para siempre de la remota (p. ej. 225 lb → kg).
 */
export function toServerScale<T extends number | null | undefined>(value: T, decimals: number): T {
  return (typeof value === 'number' ? roundTo(value, decimals) : value) as T;
}

export abstract class Repository {
  constructor(protected readonly store: LocalStore) {}
  protected get now() {
    return this.store.ctx.clock.now();
  }
}
