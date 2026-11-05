import { z } from 'zod';

/**
 * Identificador UUID. Los registros sincronizables se generan en el cliente
 * (propuesta: UUIDv7, ver ADR-0003) para poder crearse offline.
 */
export const Uuid = z.uuid();
export type Uuid = z.infer<typeof Uuid>;

/** Instante real en ISO 8601 con desplazamiento explícito (`Z` o `±hh:mm`). */
export const IsoDateTime = z.iso.datetime({ offset: true });
export type IsoDateTime = z.infer<typeof IsoDateTime>;

/** Fecha deportiva local del atleta (`YYYY-MM-DD`), nunca derivada recortando UTC. */
export const LocalDate = z.iso.date();
export type LocalDate = z.infer<typeof LocalDate>;

function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Zona horaria IANA, p. ej. `America/Mexico_City`. */
export const TimeZone = z
  .string()
  .min(1)
  .refine(isValidTimeZone, { message: 'Zona horaria IANA no válida' });
export type TimeZone = z.infer<typeof TimeZone>;

/**
 * Procedencia del dato (especificación §10). Permite distinguir mediciones
 * reales de estimaciones y predicciones.
 */
export const DataSource = z.enum(['manual', 'imported', 'estimated', 'ai_generated', 'device']);
export type DataSource = z.infer<typeof DataSource>;

export const UnitSystem = z.enum(['metric', 'imperial']);
export type UnitSystem = z.infer<typeof UnitSystem>;

export const MassUnit = z.enum(['kg', 'lb']);
export type MassUnit = z.infer<typeof MassUnit>;

export const LengthUnit = z.enum(['cm', 'in']);
export type LengthUnit = z.infer<typeof LengthUnit>;

/**
 * Posición dentro de una lista ordenada (días de un plan, ejercicios, series).
 * El servidor exige `position between 0 and 1000` (0.3.0: antes solo `nonnegative`).
 */
export const Position = z.int().min(0).max(1000);
export type Position = z.infer<typeof Position>;

/** Texto libre opcional con límite para notas. */
export const Notes = z.string().max(2000);

/**
 * Metadatos comunes de toda entidad privada sincronizable.
 *
 * - `userId` lo asigna el adaptador desde la sesión autenticada; nunca lo envía la UI.
 * - `revision` lo incrementa el servidor en cada mutación aplicada (null = nunca sincronizado).
 * - `deletedAt` implementa el borrado lógico (tombstone) para que lo eliminado no reaparezca.
 */
export const SyncedRecord = z.object({
  id: Uuid,
  userId: Uuid,
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
  deletedAt: IsoDateTime.nullable(),
  revision: z.int().nonnegative().nullable(),
});
export type SyncedRecord = z.infer<typeof SyncedRecord>;

/** Campos que la UI nunca debe proporcionar en entradas de creación/actualización. */
export type ServerManagedField = 'userId' | 'createdAt' | 'updatedAt' | 'deletedAt' | 'revision';

/** Paginación por cursor opaco para historiales. */
export const PageRequest = z.object({
  cursor: z.string().min(1).nullable().default(null),
  limit: z.int().min(1).max(100).default(20),
});
export type PageRequest = z.input<typeof PageRequest>;

export type Page<T> = {
  items: T[];
  nextCursor: string | null;
};
