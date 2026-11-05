/**
 * Base desechable con el esquema de la capa anterior de la app móvil ("codex-mobile v1").
 * DDL copiado de `ATHLETE-CODEX/apps/mobile/src/data/database.ts` (rama codex/mobile-foundation, 4-nov-2026),
 * sin cambios, para probar el importador sin tocar ninguna base real.
 */
import { randomUUID } from 'node:crypto';
import type { SqlDatabase } from '../../src/sql/types';

export const CODEX_V1_DDL = `
CREATE TABLE IF NOT EXISTS exercises (id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, muscle_group TEXT NOT NULL, equipment TEXT, origin TEXT NOT NULL DEFAULT 'sample', created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS routines (id TEXT PRIMARY KEY NOT NULL, owner_key TEXT NOT NULL, name TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, local_version INTEGER NOT NULL DEFAULT 1, server_version INTEGER, sync_status TEXT NOT NULL DEFAULT 'pending', tombstoned_at TEXT);
CREATE TABLE IF NOT EXISTS routine_exercises (id TEXT PRIMARY KEY NOT NULL, routine_id TEXT NOT NULL REFERENCES routines(id) ON DELETE CASCADE, exercise_id TEXT NOT NULL REFERENCES exercises(id), sort_order INTEGER NOT NULL, sets_target INTEGER NOT NULL, reps_target INTEGER NOT NULL, rest_seconds INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS workout_sessions (id TEXT PRIMARY KEY NOT NULL, owner_key TEXT NOT NULL, routine_id TEXT REFERENCES routines(id), state TEXT NOT NULL CHECK(state IN ('active','completed','deleted')), started_at TEXT NOT NULL, completed_at TEXT, updated_at TEXT NOT NULL, local_version INTEGER NOT NULL DEFAULT 1, server_version INTEGER, sync_status TEXT NOT NULL DEFAULT 'pending', tombstoned_at TEXT);
CREATE TABLE IF NOT EXISTS session_exercises (id TEXT PRIMARY KEY NOT NULL, session_id TEXT NOT NULL REFERENCES workout_sessions(id) ON DELETE CASCADE, exercise_id TEXT NOT NULL REFERENCES exercises(id), sort_order INTEGER NOT NULL, sets_target INTEGER, reps_target INTEGER, rest_seconds INTEGER);
CREATE TABLE IF NOT EXISTS workout_sets (id TEXT PRIMARY KEY NOT NULL, session_exercise_id TEXT NOT NULL REFERENCES session_exercises(id) ON DELETE CASCADE, set_index INTEGER NOT NULL, weight_kg REAL, reps INTEGER, rir INTEGER, is_warmup INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL, UNIQUE(session_exercise_id, set_index), CHECK(weight_kg IS NULL OR weight_kg >= 0), CHECK(reps IS NULL OR reps BETWEEN 1 AND 200), CHECK(rir IS NULL OR rir BETWEEN 0 AND 10));
CREATE TABLE IF NOT EXISTS sync_outbox (id TEXT PRIMARY KEY NOT NULL, client_mutation_id TEXT NOT NULL UNIQUE, owner_key TEXT NOT NULL, aggregate_type TEXT NOT NULL, aggregate_id TEXT NOT NULL, operation TEXT NOT NULL, local_version INTEGER NOT NULL, base_server_version INTEGER, payload_json TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','syncing','failed','conflict','acked')), attempt_count INTEGER NOT NULL DEFAULT 0, last_error_code TEXT, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sync_conflicts (id TEXT PRIMARY KEY NOT NULL, owner_key TEXT NOT NULL, aggregate_type TEXT NOT NULL, aggregate_id TEXT NOT NULL, local_version INTEGER NOT NULL, server_version INTEGER, local_snapshot_json TEXT NOT NULL, remote_snapshot_json TEXT NOT NULL, detected_at TEXT NOT NULL, resolution TEXT);
CREATE TABLE IF NOT EXISTS body_measurements (id TEXT PRIMARY KEY NOT NULL, owner_key TEXT NOT NULL, measurement_type TEXT NOT NULL, value REAL NOT NULL, unit TEXT NOT NULL, measured_at TEXT NOT NULL, local_version INTEGER NOT NULL DEFAULT 1, server_version INTEGER, sync_status TEXT NOT NULL DEFAULT 'pending', tombstoned_at TEXT);
CREATE TABLE IF NOT EXISTS athlete_local_preferences (owner_key TEXT PRIMARY KEY NOT NULL, display_name TEXT NOT NULL DEFAULT '', unit_system TEXT NOT NULL DEFAULT 'metric', preferred_sport TEXT NOT NULL DEFAULT 'strength', timezone TEXT NOT NULL, updated_at TEXT NOT NULL);
PRAGMA user_version = 1;
`;

const STARTER = [
  ['sample-bench-press', 'Press de banca', 'Pecho', 'Barra'],
  ['sample-back-squat', 'Sentadilla trasera', 'Pierna', 'Barra'],
  ['sample-rdl', 'Peso muerto rumano', 'Pierna', 'Barra'],
  ['sample-lat-pulldown', 'Jalón al pecho', 'Espalda', 'Polea'],
  ['sample-overhead-press', 'Press militar', 'Hombro', 'Barra'],
  ['sample-seated-row', 'Remo sentado', 'Espalda', 'Polea'],
] as const;

/** Ids por proceso (UUID v4, como los de la capa anterior): permiten repetir las pruebas sobre el mismo servidor. */
export const L = {
  owner: randomUUID(),
  otherOwner: randomUUID(),
  routineA: randomUUID(),
  routineDeleted: randomUUID(),
  reSquat: randomUUID(),
  reRow: randomUUID(),
  reOld: randomUUID(),
  sessionDone: randomUUID(),
  sessionActive: randomUUID(),
  sessionDeleted: randomUUID(),
  sessionOther: randomUUID(),
  seSquat: randomUUID(),
  seRow: randomUUID(),
  seActive: randomUUID(),
  seDeleted: randomUUID(),
  seCustom: randomUUID(),
  setWarm: randomUUID(),
  setRir2: randomUUID(),
  setRir0: randomUUID(),
  setEmpty: randomUUID(),
  setHeavy: randomUUID(),
  setRow: randomUUID(),
  setActive: randomUUID(),
  setActiveEmpty: randomUUID(),
  setDeleted: randomUUID(),
  setCustom: randomUUID(),
  bw: randomUUID(),
  waist: randomUUID(),
  bwOut: randomUUID(),
  bwDeleted: randomUUID(),
};

export async function createCodexV1(db: SqlDatabase, options: { preferredSport?: string; outboxStatus?: string; serverVersion?: number | null } = {}) {
  const me = `device:${L.owner}`;
  const other = `device:${L.otherOwner}`;
  const run = (sql: string, params: Array<string | number | null>) => db.run(sql, params);
  await db.exec(CODEX_V1_DDL);
  for (const [id, name, group, eq] of STARTER) await run('INSERT INTO exercises VALUES (?, ?, ?, ?, ?, ?)', [id, name, group, eq, 'sample', '2026-11-01T00:00:00.000Z']);
  await run('INSERT INTO exercises VALUES (?, ?, ?, ?, ?, ?)', ['server-xyz', 'Hip thrust', 'Glúteo', 'Barra', 'server', '2026-11-01T00:00:00.000Z']);

  await run('INSERT INTO routines VALUES (?, ?, ?, ?, ?, 1, ?, ?, NULL)', [L.routineA, me, 'Torso pierna', '2026-11-02T10:00:00.000Z', '2026-11-02T10:00:00.000Z', options.serverVersion ?? null, 'pending']);
  await run('INSERT INTO routines VALUES (?, ?, ?, ?, ?, 2, NULL, ?, ?)', [L.routineDeleted, me, 'Vieja', '2026-11-01T10:00:00.000Z', '2026-11-02T09:00:00.000Z', 'pending', '2026-11-02T09:00:00.000Z']);
  await run('INSERT INTO routine_exercises VALUES (?, ?, ?, 0, 3, 5, 180)', [L.reSquat, L.routineA, 'sample-back-squat']);
  await run('INSERT INTO routine_exercises VALUES (?, ?, ?, 1, 3, 10, 90)', [L.reRow, L.routineA, 'sample-seated-row']);
  await run('INSERT INTO routine_exercises VALUES (?, ?, ?, 0, 2, 8, 60)', [L.reOld, L.routineDeleted, 'sample-bench-press']);

  // Sesión completada desde la rutina: series registradas, una vacía (placeholder) y una con peso > 1000 kg.
  await run("INSERT INTO workout_sessions VALUES (?, ?, ?, 'completed', ?, ?, ?, 6, NULL, 'pending', NULL)",
    [L.sessionDone, me, L.routineA, '2026-11-03T04:30:00.000Z', '2026-11-03T05:30:00.000Z', '2026-11-03T05:30:00.000Z']);
  await run('INSERT INTO session_exercises VALUES (?, ?, ?, 0, 3, 5, 180)', [L.seSquat, L.sessionDone, 'sample-back-squat']);
  await run('INSERT INTO session_exercises VALUES (?, ?, ?, 1, 3, 10, 90)', [L.seRow, L.sessionDone, 'sample-seated-row']);
  await run('INSERT INTO session_exercises VALUES (?, ?, ?, 2, NULL, NULL, NULL)', [L.seCustom, L.sessionDone, 'server-xyz']);
  const set = (id: string, se: string, i: number, w: number | null, r: number | null, rir: number | null, warm: number, at: string) =>
    run('INSERT INTO workout_sets VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [id, se, i, w, r, rir, warm, at]);
  await set(L.setWarm, L.seSquat, 0, 60, 8, null, 1, '2026-11-03T04:35:00.000Z');
  await set(L.setRir2, L.seSquat, 1, 102.0583, 5, 2, 0, '2026-11-03T04:40:00.000Z');
  await set(L.setRir0, L.seSquat, 2, 100, 4, 0, 0, '2026-11-03T04:45:00.000Z');
  await set(L.setEmpty, L.seSquat, 3, null, null, null, 0, '2026-11-03T04:30:00.000Z');
  await set(L.setHeavy, L.seSquat, 4, 1200, 1, 0, 0, '2026-11-03T04:50:00.000Z');
  await set(L.setRow, L.seRow, 0, 50, 10, 3, 0, '2026-11-03T05:00:00.000Z');
  await set(L.setCustom, L.seCustom, 0, 80, 10, 2, 0, '2026-11-03T05:10:00.000Z');

  // Sesión en curso (libre) y sesión eliminada.
  await run("INSERT INTO workout_sessions VALUES (?, ?, NULL, 'active', ?, NULL, ?, 2, NULL, 'pending', NULL)",
    [L.sessionActive, me, '2026-11-04T03:00:00.000Z', '2026-11-04T03:10:00.000Z']);
  await run('INSERT INTO session_exercises VALUES (?, ?, ?, 0, NULL, NULL, NULL)', [L.seActive, L.sessionActive, 'sample-bench-press']);
  await set(L.setActive, L.seActive, 0, 70, 8, 1, 0, '2026-11-04T03:10:00.000Z');
  await set(L.setActiveEmpty, L.seActive, 1, null, null, null, 0, '2026-11-04T03:00:00.000Z');
  await run("INSERT INTO workout_sessions VALUES (?, ?, NULL, 'deleted', ?, ?, ?, 4, NULL, 'pending', ?)",
    [L.sessionDeleted, me, '2026-11-02T04:00:00.000Z', '2026-11-02T05:00:00.000Z', '2026-11-02T06:00:00.000Z', '2026-11-02T06:00:00.000Z']);
  await run('INSERT INTO session_exercises VALUES (?, ?, ?, 0, NULL, NULL, NULL)', [L.seDeleted, L.sessionDeleted, 'sample-rdl']);
  await set(L.setDeleted, L.seDeleted, 0, 90, 6, 2, 0, '2026-11-02T04:30:00.000Z');

  // Datos de otro propietario en el mismo archivo.
  await run("INSERT INTO workout_sessions VALUES (?, ?, NULL, 'completed', ?, ?, ?, 1, NULL, 'pending', NULL)",
    [L.sessionOther, other, '2026-11-01T04:00:00.000Z', '2026-11-01T05:00:00.000Z', '2026-11-01T05:00:00.000Z']);

  // Medidas: peso, cintura, peso fuera de rango y peso eliminado.
  const m = (id: string, type: string, value: number, unit: string, at: string, deleted: string | null) =>
    run("INSERT INTO body_measurements VALUES (?, ?, ?, ?, ?, ?, 1, NULL, 'pending', ?)", [id, me, type, value, unit, at, deleted]);
  await m(L.bw, 'weight_kg', 81.2345, 'kg', '2026-11-03T13:00:00.000Z', null);
  await m(L.waist, 'waist_cm', 84.456, 'cm', '2026-11-03T13:01:00.000Z', null);
  await m(L.bwOut, 'weight_kg', 450, 'kg', '2026-11-03T13:02:00.000Z', null);
  await m(L.bwDeleted, 'weight_kg', 82, 'kg', '2026-11-02T13:00:00.000Z', '2026-11-02T14:00:00.000Z');

  await run('INSERT INTO athlete_local_preferences VALUES (?, ?, ?, ?, ?, ?)',
    [me, 'Gabo', 'metric', options.preferredSport ?? 'hybrid', 'America/Mexico_City', '2026-11-02T08:00:00.000Z']);

  // Outbox heredada (nunca enviada).
  await run("INSERT INTO sync_outbox VALUES (?, ?, ?, 'workout_session', ?, 'complete', 6, NULL, '{}', ?, 0, NULL, ?)",
    ['ob-1', 'cm-1', me, L.sessionDone, options.outboxStatus ?? 'pending', '2026-11-03T05:30:00.000Z']);
}
