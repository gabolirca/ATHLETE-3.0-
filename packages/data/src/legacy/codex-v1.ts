import { TimeZone, type SyncEntity } from '@athlete/contracts';
import { localDateOf, roundTo } from '@athlete/domain';
import { CATALOG_EXERCISE_ID } from '../catalog/bundled';
import { metaFor, type LocalRow } from '../local/entities';
import type { LocalStore } from '../local/store';
import type { SqlDatabase, SqlExecutor, SqlRow } from '../sql/types';

/**
 * Importador de la capa de datos anterior de la app móvil (esquema "codex-mobile v1", `athlete3.db`,
 * `apps/mobile/src/data/database.ts`, `PRAGMA user_version = 1`).
 *
 * Garantías (ver `docs/reports/claude/2026-11-04-integracion-backend-claude.md` §6):
 *  - Solo LEE la base de origen, que debe ser una COPIA (nunca el archivo original de la app).
 *  - Escribe todo en UNA transacción del almacén nuevo y verifica conteos y sumas de control antes de confirmar;
 *    si algo no cuadra, `ROLLBACK` y el almacén queda como estaba.
 *  - Idempotente: se identifica por la huella del contenido de origen. Repetirlo no duplica datos.
 *  - No descarta en silencio: lo que no cumple los contratos oficiales va a `legacy_quarantine` con su motivo.
 *    Solo las series vacías (sin peso, reps ni RIR) se omiten, porque no contienen datos; se cuentan en el informe.
 *  - No traduce la outbox heredada (nunca tuvo transporte): encola un `upsert` nuevo por registro vivo.
 */

export const LEGACY_SOURCE = 'codex-mobile-v1';
const STATE_KEY = 'legacy_import';

export type ImportErrorCode =
  | 'legacy-unsupported-version'
  | 'legacy-already-synced'
  | 'legacy-invalid-time-zone'
  | 'already-imported-different-source'
  | 'verification-failed';

export class LegacyImportError extends Error {
  constructor(readonly code: ImportErrorCode, message: string, readonly details?: Record<string, unknown>) {
    super(message);
    this.name = 'LegacyImportError';
  }
}

export type LegacyImportReport = {
  source: typeof LEGACY_SOURCE;
  fingerprint: string;
  importedAt: string;
  imported: Partial<Record<SyncEntity, number>>;
  /** De los importados, cuántos llegaron ya eliminados (se conservan como tombstone local, sin mutación). */
  tombstoned: number;
  enqueued: number;
  quarantined: Record<string, number>;
  skippedEmptySets: number;
  /** Ejercicios de sesión cuyos objetivos copiados no pudieron enlazarse a un ejercicio planificado. */
  unlinkedSessionTargets: number;
  checks: { setCount: number; rirCount: number; volumeKg: number };
};

export type LegacyImportResult = { alreadyImported: boolean; report: LegacyImportReport };

export type LegacyImportOptions = {
  /** `localUserId` del dispositivo; solo se importan filas con `owner_key = 'device:<localUserId>'`. */
  localUserId: string;
  /** Zona para sesiones y medidas (la capa anterior no la guardaba): preferencias heredadas, si no la del dispositivo. */
  deviceTimeZone: string;
  /** SHA-256 hexadecimal de un texto (`expo-crypto.digestStringAsync` / `node:crypto`). */
  sha256: (text: string) => Promise<string>;
  now: string;
};

const SAMPLE_EXERCISES: Readonly<Record<string, string>> = {
  'sample-bench-press': 'bench-press',
  'sample-back-squat': 'back-squat',
  'sample-rdl': 'romanian-deadlift',
  'sample-lat-pulldown': 'lat-pulldown',
  'sample-overhead-press': 'overhead-press',
  'sample-seated-row': 'seated-cable-row',
};

const TABLES = ['exercises', 'routines', 'routine_exercises', 'workout_sessions', 'session_exercises', 'workout_sets',
  'sync_outbox', 'sync_conflicts', 'body_measurements', 'athlete_local_preferences'] as const;
type LegacyTable = (typeof TABLES)[number];
type Snapshot = Record<LegacyTable, SqlRow[]>;

const ORDER: Record<LegacyTable, string> = {
  exercises: 'id', routines: 'id', routine_exercises: 'id', workout_sessions: 'id', session_exercises: 'id',
  workout_sets: 'id', sync_outbox: 'id', sync_conflicts: 'id', body_measurements: 'id', athlete_local_preferences: 'owner_key',
};

type Planned = { entity: SyncEntity; row: LocalRow; enqueue: boolean };
type Quarantined = { entity: string; legacyId: string | null; reason: string; raw: unknown };

const str = (v: unknown) => (v === null || v === undefined ? null : String(v));
const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));

/** Lee la base de origen completa (cientos de filas). Solo SELECT. */
export async function readLegacySnapshot(legacy: SqlDatabase): Promise<{ userVersion: number; tables: Snapshot }> {
  const userVersion = Number((await legacy.get<{ user_version: number }>('PRAGMA user_version'))?.user_version ?? 0);
  const tables = {} as Snapshot;
  for (const t of TABLES) tables[t] = await legacy.all(`SELECT * FROM ${t} ORDER BY ${ORDER[t]}`);
  return { userVersion, tables };
}

/** UUID determinista (formato v8) para entidades que la capa anterior no tenía (p. ej. el día de cada rutina). */
async function derivedId(sha256: LegacyImportOptions['sha256'], kind: string, legacyId: string): Promise<string> {
  const h = (await sha256(`athlete3:${LEGACY_SOURCE}:${kind}:${legacyId}`)).slice(0, 32);
  const variant = ((parseInt(h[16] as string, 16) & 0x3) | 0x8).toString(16);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-8${h.slice(13, 16)}-${variant}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

/** Transformación pura origen → filas oficiales + cuarentena. No toca ninguna base. */
export async function planLegacyImport(
  snapshot: { userVersion: number; tables: Snapshot },
  options: LegacyImportOptions & { profileExists: boolean; hasActiveSession: boolean; storeUserId: string },
) {
  const t = snapshot.tables;
  if (snapshot.userVersion !== 1) {
    throw new LegacyImportError('legacy-unsupported-version', `Versión de esquema de origen no soportada: ${snapshot.userVersion}.`);
  }
  const synced = ['routines', 'workout_sessions', 'body_measurements'].flatMap((name) =>
    t[name as LegacyTable].filter((r) => r.server_version !== null && r.server_version !== undefined));
  const sent = t.sync_outbox.filter((o) => o.status === 'acked' || o.status === 'syncing');
  if (synced.length > 0 || sent.length > 0) {
    throw new LegacyImportError('legacy-already-synced', 'La base de origen tiene registros que pudieron llegar a un servidor; se requiere revisión manual.',
      { syncedRecords: synced.length, sentMutations: sent.length });
  }

  const owner = `device:${options.localUserId}`;
  const planned: Planned[] = [];
  const quarantine: Quarantined[] = [];
  const q = (entity: string, legacyId: unknown, reason: string, raw: unknown) => quarantine.push({ entity, legacyId: str(legacyId), reason, raw });
  const add = (entity: SyncEntity, row: LocalRow, deletedAt: string | null): boolean => {
    try {
      metaFor(entity)!.toContract({ ...row, deleted_at: deletedAt, user_id: entity === 'exercise' ? row.user_id : options.storeUserId, revision: null });
    } catch (e) {
      q(entity, row.id, 'contract_validation', { row, issues: (e as { issues?: unknown }).issues ?? String(e) });
      return false;
    }
    planned.push({ entity, row: { ...row, deleted_at: deletedAt }, enqueue: deletedAt === null });
    return true;
  };

  // Zona horaria: preferencias heredadas del propietario, si son válidas; si no, la del dispositivo.
  const prefs = t.athlete_local_preferences.find((p) => p.owner_key === owner) ?? null;
  const prefTz = str(prefs?.timezone);
  const timeZone = prefTz && TimeZone.safeParse(prefTz).success ? prefTz : options.deviceTimeZone;
  if (!TimeZone.safeParse(timeZone).success) throw new LegacyImportError('legacy-invalid-time-zone', 'Zona horaria no válida.');

  // Filas de otros propietarios: no son de este dispositivo/usuario.
  for (const name of ['routines', 'workout_sessions', 'body_measurements', 'athlete_local_preferences', 'sync_conflicts'] as const) {
    for (const r of t[name]) if (r.owner_key !== owner) q(name, r.id ?? r.owner_key, 'other_owner', r);
  }
  for (const c of t.sync_conflicts) if (c.owner_key === owner) q('sync_conflicts', c.id, 'legacy_conflict', c);

  // Ejercicios: muestra → catálogo; cualquier otro → cuarentena (y sus dependientes también).
  const exerciseMap = new Map<string, string>();
  for (const e of t.exercises) {
    const slug = SAMPLE_EXERCISES[String(e.id)];
    const id = slug ? CATALOG_EXERCISE_ID[slug] : undefined;
    if (id) exerciseMap.set(String(e.id), id);
    else q('exercises', e.id, 'unmapped_exercise', e);
  }

  // Rutinas → plan + día + ejercicios planificados.
  const dayOfRoutine = new Map<string, string>();
  const plannedOf = new Map<string, Array<{ id: string; exerciseId: string; sortOrder: number }>>();
  for (const r of t.routines.filter((x) => x.owner_key === owner)) {
    const id = String(r.id);
    const deletedAt = str(r.tombstoned_at);
    const created = String(r.created_at);
    const updated = String(r.updated_at);
    const planOk = add('training_plan', {
      id, created_at: created, updated_at: updated, name: String(r.name).trim(), description: null, status: 'active', starts_on: null, ends_on: null,
    }, deletedAt);
    if (!planOk) continue;
    const dayId = await derivedId(options.sha256, 'training_day', id);
    add('training_day', { id: dayId, created_at: created, updated_at: updated, plan_id: id, position: 0, name: String(r.name).trim(), kind: 'training', notes: null }, deletedAt);
    dayOfRoutine.set(id, dayId);
    plannedOf.set(id, []);
    for (const re of t.routine_exercises.filter((x) => x.routine_id === id)) {
      const exerciseId = exerciseMap.get(String(re.exercise_id));
      if (!exerciseId) { q('routine_exercises', re.id, 'unmapped_exercise', re); continue; }
      const ok = add('training_day_exercise', {
        id: String(re.id), created_at: created, updated_at: updated, training_day_id: dayId, exercise_id: exerciseId,
        position: num(re.sort_order), target_sets: num(re.sets_target), target_reps_min: num(re.reps_target), target_reps_max: num(re.reps_target),
        target_weight_kg: null, target_rir: null, target_rest_seconds: num(re.rest_seconds), target_duration_seconds: null,
        target_distance_m: null, notes: null,
      }, deletedAt);
      if (ok) plannedOf.get(id)!.push({ id: String(re.id), exerciseId, sortOrder: Number(re.sort_order) });
    }
  }
  for (const re of t.routine_exercises) if (!t.routines.some((r) => r.id === re.routine_id)) q('routine_exercises', re.id, 'orphan', re);

  // Sesiones → sesión, ejercicios de sesión y series.
  let skippedEmptySets = 0;
  let unlinkedSessionTargets = 0;
  for (const s of t.workout_sessions.filter((x) => x.owner_key === owner)) {
    const id = String(s.id);
    const startedAt = String(s.started_at);
    const completedAt = str(s.completed_at);
    const deletedAt = str(s.tombstoned_at);
    const status = s.state === 'active' ? 'in_progress' : s.state === 'completed' ? 'completed' : completedAt ? 'completed' : 'discarded';
    const routineId = str(s.routine_id);
    // Una sola sesión en curso: si el almacén nuevo ya tiene una, la heredada se conserva en cuarentena.
    if (status === 'in_progress' && deletedAt === null && options.hasActiveSession) {
      q('workout_sessions', id, 'active_session_conflict', { ...s, exercises: t.session_exercises.filter((x) => x.session_id === id) });
      continue;
    }
    const sessionOk = add('workout_session', {
      id, created_at: startedAt, updated_at: String(s.updated_at), status, training_day_id: routineId ? (dayOfRoutine.get(routineId) ?? null) : null,
      title: null, started_at: startedAt, ended_at: completedAt, time_zone: timeZone, local_date: localDateOf(startedAt, timeZone), source: 'manual', notes: null,
    }, deletedAt);
    const sessionExercises = t.session_exercises.filter((x) => x.session_id === id);
    for (const se of sessionExercises) {
      const seId = String(se.id);
      const sets = t.workout_sets.filter((x) => x.session_exercise_id === seId);
      const exerciseId = exerciseMap.get(String(se.exercise_id));
      if (!sessionOk || !exerciseId) {
        q('session_exercises', seId, sessionOk ? 'unmapped_exercise' : 'parent_quarantined', { ...se, sets });
        continue;
      }
      const link = routineId
        ? plannedOf.get(routineId)?.find((p) => p.exerciseId === exerciseId && p.sortOrder === Number(se.sort_order))?.id ?? null
        : null;
      if (!link && (se.sets_target !== null || se.reps_target !== null || se.rest_seconds !== null)) unlinkedSessionTargets++;
      const seOk = add('session_exercise', {
        id: seId, created_at: startedAt, updated_at: String(s.updated_at), session_id: id, exercise_id: exerciseId,
        training_day_exercise_id: link, position: num(se.sort_order), notes: null,
      }, deletedAt);
      for (const w of sets) {
        if (w.weight_kg === null && w.reps === null && w.rir === null) { skippedEmptySets++; continue; }
        if (!seOk) { q('workout_sets', w.id, 'parent_quarantined', w); continue; }
        const at = String(w.updated_at);
        add('strength_set', {
          id: String(w.id), created_at: at, updated_at: at, session_exercise_id: seId, position: num(w.set_index),
          set_type: Number(w.is_warmup) ? 'warmup' : 'working', weight_kg: w.weight_kg === null ? null : roundTo(Number(w.weight_kg), 2),
          reps: num(w.reps), rir: num(w.rir), rpe: null, rest_seconds: null, duration_seconds: null, distance_m: null,
          // La capa anterior no registraba cuándo se hizo la serie: se usa su última edición (aproximación documentada).
          completed_at: at, notes: null,
        }, deletedAt);
      }
    }
  }
  for (const se of t.session_exercises) if (!t.workout_sessions.some((s) => s.id === se.session_id)) q('session_exercises', se.id, 'orphan', se);

  // Medidas corporales.
  const sites: Record<string, string> = { waist_cm: 'waist', chest_cm: 'chest', hip_cm: 'hips' };
  for (const m of t.body_measurements.filter((x) => x.owner_key === owner)) {
    const measuredAt = String(m.measured_at);
    const deletedAt = str(m.tombstoned_at);
    const common = { id: String(m.id), created_at: measuredAt, updated_at: measuredAt, measured_at: measuredAt, time_zone: timeZone,
      local_date: localDateOf(measuredAt, timeZone), source: 'manual', notes: null };
    if (m.measurement_type === 'weight_kg') {
      add('body_weight', { ...common, weight_kg: roundTo(Number(m.value), 3), input_unit: 'kg' }, deletedAt);
    } else if (sites[String(m.measurement_type)]) {
      add('body_measurement', { ...common, site: sites[String(m.measurement_type)], value_cm: roundTo(Number(m.value), 2), input_unit: 'cm' }, deletedAt);
    } else {
      q('body_measurements', m.id, 'unknown_measurement_type', m);
    }
  }

  // Preferencias → perfil (solo si el almacén aún no tiene perfil: nunca se sobrescribe).
  if (prefs) {
    const sportMap: Record<string, string[]> = { strength: ['strength'], running: ['running'], swimming: ['swimming'] };
    const sports = sportMap[String(prefs.preferred_sport)];
    if (options.profileExists) {
      q('athlete_local_preferences', prefs.owner_key, 'profile_already_exists', prefs);
    } else {
      const displayName = String(prefs.display_name ?? '').trim();
      add('profile', {
        id: options.storeUserId, created_at: String(prefs.updated_at), updated_at: String(prefs.updated_at),
        display_name: displayName === '' ? null : displayName, height_cm: null, initial_weight_kg: null, experience_level: null,
        goals: [], sports: sports ?? [], time_zone: timeZone, unit_system: String(prefs.unit_system), load_unit: 'kg', week_starts_on: 1,
      }, null);
      // "hybrid" no indica qué disciplinas: se conserva para que la persona las elija, en lugar de inventarlas.
      if (!sports) q('athlete_local_preferences', prefs.owner_key, 'preferred_sport_needs_choice', { preferred_sport: prefs.preferred_sport });
    }
  }

  const live = planned.filter((p) => p.entity === 'strength_set' && p.row.deleted_at === null);
  const checks = {
    setCount: planned.filter((p) => p.entity === 'strength_set').length,
    rirCount: planned.filter((p) => p.entity === 'strength_set' && p.row.rir !== null).length,
    volumeKg: roundTo(live.reduce((s, p) => s + (p.row.weight_kg === null || p.row.reps === null ? 0 : Number(p.row.weight_kg) * Number(p.row.reps)), 0), 4),
  };
  return { planned, quarantine, skippedEmptySets, unlinkedSessionTargets, checks };
}

/** Huella determinista del contenido de origen (independiente del archivo y de su cifrado). */
export async function legacyFingerprint(snapshot: { userVersion: number; tables: Snapshot }, sha256: LegacyImportOptions['sha256']): Promise<string> {
  return sha256(JSON.stringify({ v: snapshot.userVersion, t: TABLES.map((name) => [name, snapshot.tables[name]]) }));
}

/**
 * Importa la copia de la base anterior al almacén oficial. Ver garantías en la cabecera.
 * Lanza `LegacyImportError` (sin escribir nada) si no se cumplen las precondiciones o la verificación.
 */
export async function importLegacyCodexV1(store: LocalStore, legacy: SqlDatabase, options: LegacyImportOptions): Promise<LegacyImportResult> {
  const snapshot = await readLegacySnapshot(legacy);
  const fingerprint = await legacyFingerprint(snapshot, options.sha256);

  const previous = await store.getState(STATE_KEY);
  if (previous) {
    const report = JSON.parse(previous) as LegacyImportReport;
    if (report.fingerprint === fingerprint) return { alreadyImported: true, report };
    throw new LegacyImportError('already-imported-different-source', 'Este almacén ya importó otra base anterior.', { previous: report.fingerprint });
  }

  const profileExists = (await store.get('profile', store.ctx.userId)) !== null;
  const hasActiveSession = (await store.select('workout_session', "WHERE status = 'in_progress' AND deleted_at IS NULL LIMIT 1")).length > 0;
  const plan = await planLegacyImport(snapshot, { ...options, profileExists, hasActiveSession, storeUserId: store.ctx.userId });

  return store.db.transaction(async (tx) => {
    const outboxBefore = await countOutbox(tx);
    const imported: Partial<Record<SyncEntity, number>> = {};
    for (const p of plan.planned) {
      await store.importRecord(tx, p.entity, p.row, { enqueue: p.enqueue });
      imported[p.entity] = (imported[p.entity] ?? 0) + 1;
    }
    const quarantined: Record<string, number> = {};
    for (const x of plan.quarantine) {
      await tx.run('INSERT INTO legacy_quarantine (source, entity, legacy_id, reason, raw, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        [LEGACY_SOURCE, x.entity, x.legacyId, x.reason, JSON.stringify(x.raw), options.now]);
      quarantined[x.reason] = (quarantined[x.reason] ?? 0) + 1;
    }

    // Verificación dentro de la transacción: si algo no cuadra, se deshace todo.
    const enqueued = plan.planned.filter((p) => p.enqueue).length;
    await verify(tx, store, plan, enqueued, outboxBefore);

    const report: LegacyImportReport = {
      source: LEGACY_SOURCE, fingerprint, importedAt: options.now, imported,
      tombstoned: plan.planned.filter((p) => p.row.deleted_at !== null).length, enqueued, quarantined,
      skippedEmptySets: plan.skippedEmptySets, unlinkedSessionTargets: plan.unlinkedSessionTargets, checks: plan.checks,
    };
    await tx.run('INSERT INTO sync_state (key, value) VALUES (?, ?)', [STATE_KEY, JSON.stringify(report)]);
    return { alreadyImported: false, report };
  });
}

async function countOutbox(tx: SqlExecutor): Promise<number> {
  return Number((await tx.get<{ n: number }>('SELECT COUNT(*) AS n FROM outbox'))?.n ?? 0);
}

async function verify(
  tx: SqlExecutor,
  store: LocalStore,
  plan: Awaited<ReturnType<typeof planLegacyImport>>,
  enqueued: number,
  outboxBefore: number,
): Promise<void> {
  const fail = (what: string, expected: unknown, actual: unknown) => {
    throw new LegacyImportError('verification-failed', `Verificación fallida: ${what}.`, { expected, actual });
  };
  for (const p of plan.planned) {
    const row = await store.get(p.entity, p.row.id, tx);
    if (!row || row.deleted_at !== p.row.deleted_at) fail(`registro ${p.entity} ${p.row.id}`, 'presente', row ? 'estado distinto' : 'ausente');
  }
  const ids = plan.planned.filter((p) => p.entity === 'strength_set').map((p) => p.row.id);
  const sets = ids.length === 0 ? [] : await tx.all<{ weight_kg: number | null; reps: number | null; rir: number | null; deleted_at: string | null }>(
    `SELECT weight_kg, reps, rir, deleted_at FROM strength_sets WHERE id IN (${ids.map(() => '?').join(',')})`, ids);
  const actual = {
    setCount: sets.length,
    rirCount: sets.filter((s) => s.rir !== null).length,
    volumeKg: roundTo(sets.filter((s) => s.deleted_at === null).reduce((a, s) => a + (s.weight_kg === null || s.reps === null ? 0 : s.weight_kg * s.reps), 0), 4),
  };
  if (JSON.stringify(actual) !== JSON.stringify(plan.checks)) fail('sumas de control de series', plan.checks, actual);
  const outboxAfter = await countOutbox(tx);
  if (outboxAfter - outboxBefore !== enqueued) fail('mutaciones encoladas', enqueued, outboxAfter - outboxBefore);
}
