import type { CatalogSnapshot } from '@athlete/contracts';
import { CATALOG_VERSION, EQUIPMENT, EXERCISES, MUSCLE_GROUPS } from './catalog-data';

/**
 * Catálogo global incluido en la app para que funcione sin red ni cuenta desde la primera apertura.
 * Debe ser idéntico (ids, slugs y columnas de negocio) a la semilla del servidor:
 * migraciones 0300, 20261105000100 y 20261108000100 (esta última generada desde `catalog-data.ts`).
 * La prueba de integración `offline-identity.test.ts` lo compara con `athlete3.catalog_snapshot()`.
 *
 * Al cambiar el catálogo: editar `catalog-data.ts`, subir `CATALOG_VERSION` y generar la migración con `scripts/catalog-sql.ts`.
 */
export const BUNDLED_CATALOG_VERSION = CATALOG_VERSION;

const mg = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const eq = (n: number) => `20000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const ex = (n: number) => `30000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const SEEDED_AT = '2026-11-04T00:00:00+00:00';

export const BUNDLED_CATALOG: CatalogSnapshot = {
  muscleGroups: MUSCLE_GROUPS.map(([n, slug, name]) => ({ id: mg(n), slug, name })),
  equipment: EQUIPMENT.map(([n, slug, name]) => ({ id: eq(n), slug, name })),
  exercises: EXERCISES.map(([n, slug, name, loadType, primary, secondary, equipment, pattern, mechanics, unilateral, tier]) => ({
    id: ex(n), user_id: null, slug, name, modality: 'strength', load_type: loadType,
    primary_muscle_group_ids: primary.map(mg), secondary_muscle_group_ids: secondary.map(mg), equipment_ids: equipment.map(eq),
    instructions: null, movement_pattern: pattern, mechanics, is_unilateral: unilateral === 1, access_tier: tier,
    archived_at: null, created_at: SEEDED_AT, updated_at: SEEDED_AT, deleted_at: null, revision: 1,
  })),
};

/** Ids estables por slug (útil para el importador de la capa heredada y para pruebas). */
export const CATALOG_EXERCISE_ID: Readonly<Record<string, string>> = Object.fromEntries(
  EXERCISES.map(([n, slug]) => [slug, ex(n)]),
);
