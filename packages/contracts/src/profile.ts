import { z } from 'zod';
import { IsoDateTime, MassUnit, TimeZone, UnitSystem, Uuid } from './common';

export const ExperienceLevel = z.enum(['beginner', 'intermediate', 'advanced']);

/**
 * Disciplinas que practica el atleta (0.3.0). ATHLETE atiende a atletas de fuerza e híbridos: es una lista,
 * no un único valor. Vacía = aún no indicado (no se infiere).
 */
export const Sport = z.enum(['strength', 'running', 'swimming', 'cycling', 'rowing', 'functional_fitness', 'other']);
export type Sport = z.infer<typeof Sport>;
export const Sports = z.array(Sport).max(7).refine((s) => new Set(s).size === s.length, { message: 'Disciplinas repetidas' });
export type ExperienceLevel = z.infer<typeof ExperienceLevel>;

/**
 * Perfil del atleta (especificación §6.1). Una fila por usuario autenticado: `id` = `auth.uid()`.
 *
 * Pendiente de definir con el propietario: catálogo cerrado de objetivos y alcance de
 * "configuración de privacidad". Por ahora `goals` es texto libre y los consentimientos
 * se modelarán como entidad propia (revocable y con fecha), no como booleanos en el perfil.
 */
export const Profile = z.object({
  id: Uuid,
  displayName: z.string().trim().min(1).max(80).nullable(),
  heightCm: z.number().min(50).max(272).nullable(),
  /** Peso inicial declarado. La evolución del peso vive en `BodyWeight`, no aquí. */
  initialWeightKg: z.number().min(20).max(400).nullable(),
  experienceLevel: ExperienceLevel.nullable(),
  goals: z.array(z.string().trim().min(1).max(200)).max(10),
  sports: Sports,
  timeZone: TimeZone,
  unitSystem: UnitSystem,
  /** Unidad preferida para cargas; independiente de `unitSystem` (hay quien mide en cm y levanta en lb). */
  loadUnit: MassUnit,
  /** Inicio de semana para resúmenes: 0 = domingo … 6 = sábado. Por defecto lunes (ISO). */
  weekStartsOn: z.int().min(0).max(6),
  revision: z.int().nonnegative().nullable(),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});
export type Profile = z.infer<typeof Profile>;

export const UpdateProfileInput = Profile.omit({ id: true, createdAt: true, updatedAt: true, revision: true }).partial();
export type UpdateProfileInput = z.infer<typeof UpdateProfileInput>;
