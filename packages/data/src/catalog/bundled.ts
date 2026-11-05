import type { CatalogSnapshot } from '@athlete/contracts';

/**
 * Catálogo global incluido en la app para que funcione sin red ni cuenta desde la primera apertura.
 * Debe ser idéntico (ids, slugs y columnas de negocio) a la semilla del servidor:
 * `supabase/migrations/20261104000300_athlete3_catalog.sql` + `20261105000100_athlete3_contracts_0_3_0.sql`.
 * La prueba de integración `offline-identity.test.ts` lo compara con `athlete3.catalog_snapshot()`.
 *
 * Al cambiar la semilla: actualizar esta lista y `BUNDLED_CATALOG_VERSION`.
 */
export const BUNDLED_CATALOG_VERSION = '2026-11-05.1';

const mg = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const eq = (n: number) => `20000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const ex = (n: number) => `30000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const MUSCLE_GROUPS: ReadonlyArray<[number, string, string]> = [
  [1, 'chest', 'Pecho'], [2, 'back', 'Espalda'], [3, 'shoulders', 'Hombros'], [4, 'biceps', 'Bíceps'],
  [5, 'triceps', 'Tríceps'], [6, 'forearms', 'Antebrazos'], [7, 'core', 'Core'], [8, 'quadriceps', 'Cuádriceps'],
  [9, 'hamstrings', 'Isquiotibiales'], [10, 'glutes', 'Glúteos'], [11, 'calves', 'Pantorrillas'], [12, 'full-body', 'Cuerpo completo'],
];

const EQUIPMENT: ReadonlyArray<[number, string, string]> = [
  [1, 'barbell', 'Barra'], [2, 'dumbbell', 'Mancuernas'], [3, 'machine', 'Máquina'], [4, 'cable', 'Polea'],
  [5, 'bodyweight', 'Peso corporal'], [6, 'kettlebell', 'Kettlebell'], [7, 'pull-up-bar', 'Barra de dominadas'], [8, 'bench', 'Banco'],
];

// [n, slug, nombre, load_type, primarios, secundarios, equipo]
const EXERCISES: ReadonlyArray<[number, string, string, string, number[], number[], number[]]> = [
  [1, 'back-squat', 'Sentadilla trasera', 'external', [8, 10], [9, 7], [1]],
  [2, 'bench-press', 'Press de banca', 'external', [1], [3, 5], [1, 8]],
  [3, 'deadlift', 'Peso muerto', 'external', [9, 10, 2], [6, 7], [1]],
  [4, 'overhead-press', 'Press militar', 'external', [3], [5, 7], [1]],
  [5, 'barbell-row', 'Remo con barra', 'external', [2], [4], [1]],
  [6, 'pull-up', 'Dominadas', 'bodyweight', [2], [4], [7]],
  [7, 'dip', 'Fondos', 'bodyweight', [5, 1], [3], [5]],
  [8, 'romanian-deadlift', 'Peso muerto rumano', 'external', [9], [10], [1]],
  [9, 'dumbbell-curl', 'Curl con mancuernas', 'external', [4], [6], [2]],
  [10, 'leg-press', 'Prensa de piernas', 'external', [8], [10], [3]],
  [11, 'lat-pulldown', 'Jalón al pecho', 'external', [2], [4], [4]],
  [12, 'plank', 'Plancha', 'time', [7], [], [5]],
  [13, 'seated-cable-row', 'Remo sentado en polea', 'external', [2], [4], [4]],
];

const SEEDED_AT = '2026-11-04T00:00:00+00:00';

export const BUNDLED_CATALOG: CatalogSnapshot = {
  muscleGroups: MUSCLE_GROUPS.map(([n, slug, name]) => ({ id: mg(n), slug, name })),
  equipment: EQUIPMENT.map(([n, slug, name]) => ({ id: eq(n), slug, name })),
  exercises: EXERCISES.map(([n, slug, name, loadType, primary, secondary, equipment]) => ({
    id: ex(n), user_id: null, slug, name, modality: 'strength', load_type: loadType,
    primary_muscle_group_ids: primary.map(mg), secondary_muscle_group_ids: secondary.map(mg), equipment_ids: equipment.map(eq),
    instructions: null, archived_at: null, created_at: SEEDED_AT, updated_at: SEEDED_AT, deleted_at: null, revision: 1,
  })),
};

/** Ids estables por slug (útil para el importador de la capa heredada y para pruebas). */
export const CATALOG_EXERCISE_ID: Readonly<Record<string, string>> = Object.fromEntries(
  EXERCISES.map(([n, slug]) => [slug, ex(n)]),
);
