import type { SqlDatabase, SqlExecutor } from '../sql/types';
import { ENTITIES, allColumns, type ColumnKind } from './entities';

/**
 * Esquema SQLite local. Se versiona con `PRAGMA user_version`; cada migración es aditiva.
 * Las tablas de negocio replican las de `athlete3` (mismas columnas snake_case). Las reglas de
 * negocio se validan con Zod/dominio antes de escribir y el servidor las vuelve a validar.
 */
const sqlType: Record<ColumnKind, string> = { text: 'TEXT', int: 'INTEGER', real: 'REAL', json: 'TEXT' };

function entityTable(meta: (typeof ENTITIES)[keyof typeof ENTITIES]): string {
  const cols = Object.entries(allColumns(meta)).map(([name, kind]) =>
    name === 'id' ? 'id TEXT PRIMARY KEY NOT NULL' : `${name} ${sqlType[kind]}`);
  return `CREATE TABLE IF NOT EXISTS ${meta.table} (${cols.join(', ')});`;
}

/**
 * Cada migración es SQL o una función (para pasos condicionales). Son aditivas y se ejecutan en una
 * transacción junto con el `user_version`. Nota: la v1 se genera desde `ENTITIES`, así que una base nueva ya
 * trae las columnas añadidas después; las migraciones posteriores deben ser idempotentes (ver `addColumnIfMissing`).
 */
type Migration = string | ((tx: SqlExecutor) => Promise<void>);

async function addColumnIfMissing(tx: SqlExecutor, table: string, column: string, type: string): Promise<void> {
  const cols = await tx.all<{ name: string }>(`PRAGMA table_info(${table})`);
  if (!cols.some((c) => c.name === column)) await tx.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
}

const MIGRATIONS: ReadonlyArray<Migration> = [
  // v1
  [
    ...Object.values(ENTITIES).map(entityTable),
    `CREATE TABLE IF NOT EXISTS muscle_groups (id TEXT PRIMARY KEY NOT NULL, slug TEXT NOT NULL, name TEXT NOT NULL);`,
    `CREATE TABLE IF NOT EXISTS equipment (id TEXT PRIMARY KEY NOT NULL, slug TEXT NOT NULL, name TEXT NOT NULL);`,
    `CREATE TABLE IF NOT EXISTS outbox (
       seq INTEGER PRIMARY KEY AUTOINCREMENT,
       mutation_id TEXT NOT NULL UNIQUE,
       entity TEXT NOT NULL,
       entity_id TEXT NOT NULL,
       op TEXT NOT NULL CHECK (op IN ('upsert','delete')),
       base_revision INTEGER,
       payload TEXT,
       client_recorded_at TEXT NOT NULL,
       status TEXT NOT NULL CHECK (status IN ('pending','in_flight','failed','conflict','rejected')),
       attempts INTEGER NOT NULL DEFAULT 0,
       last_error TEXT,
       next_attempt_at TEXT,
       enqueued_at TEXT NOT NULL,
       server_revision INTEGER,
       server_record TEXT,
       server_deleted INTEGER
     );`,
    `CREATE INDEX IF NOT EXISTS outbox_entity_idx ON outbox (entity, entity_id);`,
    `CREATE INDEX IF NOT EXISTS outbox_status_idx ON outbox (status, seq);`,
    `CREATE TABLE IF NOT EXISTS sync_state (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);`,
    `CREATE INDEX IF NOT EXISTS workout_sessions_history_idx ON workout_sessions (local_date DESC, started_at DESC);`,
    `CREATE INDEX IF NOT EXISTS workout_sessions_status_idx ON workout_sessions (status);`,
    `CREATE INDEX IF NOT EXISTS session_exercises_session_idx ON session_exercises (session_id);`,
    `CREATE INDEX IF NOT EXISTS session_exercises_exercise_idx ON session_exercises (exercise_id);`,
    `CREATE INDEX IF NOT EXISTS strength_sets_parent_idx ON strength_sets (session_exercise_id);`,
    `CREATE INDEX IF NOT EXISTS cardio_sessions_history_idx ON cardio_sessions (local_date DESC);`,
    `CREATE INDEX IF NOT EXISTS body_weights_history_idx ON body_weights (measured_at DESC);`,
    `CREATE INDEX IF NOT EXISTS body_measurements_history_idx ON body_measurements (site, measured_at DESC);`,
    `CREATE INDEX IF NOT EXISTS training_days_plan_idx ON training_days (plan_id);`,
    `CREATE INDEX IF NOT EXISTS training_day_exercises_day_idx ON training_day_exercises (training_day_id);`,
  ].join('\n'),
  // v2 (contratos 0.3.0): disciplinas del perfil y cuarentena del importador de la capa heredada.
  async (tx) => {
    await addColumnIfMissing(tx, 'profiles', 'sports', 'TEXT');
    await tx.exec("UPDATE profiles SET sports = '[]' WHERE sports IS NULL");
    await tx.exec(`CREATE TABLE IF NOT EXISTS legacy_quarantine (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source TEXT NOT NULL,
      entity TEXT NOT NULL,
      legacy_id TEXT,
      reason TEXT NOT NULL,
      raw TEXT NOT NULL,
      created_at TEXT NOT NULL
    );`);
  },
  // v3 (nutrición): comidas y objetivos diarios. Una base nueva ya las trae desde la v1 (se genera desde ENTITIES).
  [
    entityTable(ENTITIES.meal_entry),
    entityTable(ENTITIES.nutrition_target),
    `CREATE INDEX IF NOT EXISTS meal_entries_day_idx ON meal_entries (local_date DESC, consumed_at);`,
    `CREATE INDEX IF NOT EXISTS nutrition_targets_from_idx ON nutrition_targets (effective_from DESC);`,
  ].join('\n'),
];

export const LOCAL_SCHEMA_VERSION = MIGRATIONS.length;

export async function migrateLocalDatabase(db: SqlDatabase): Promise<void> {
  const row = await db.get<{ user_version: number }>('PRAGMA user_version');
  const current = Number(row?.user_version ?? 0);
  if (current > LOCAL_SCHEMA_VERSION) {
    throw new Error(`Base local más nueva (${current}) que la app (${LOCAL_SCHEMA_VERSION})`);
  }
  for (let v = current; v < LOCAL_SCHEMA_VERSION; v++) {
    const step = MIGRATIONS[v] as Migration;
    await db.transaction(async (tx) => {
      if (typeof step === 'string') await tx.exec(step);
      else await step(tx);
      await tx.exec(`PRAGMA user_version = ${v + 1}`);
    });
  }
}
