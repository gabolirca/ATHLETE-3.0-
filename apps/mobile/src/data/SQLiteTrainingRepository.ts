import type { SQLiteDatabase } from 'expo-sqlite';
import { newId } from './ids';
import { BodyMeasurementSchema, LocalAthletePreferencesSchema, LoggedSetSchema, RoutineInputSchema, type BodyMeasurementInput, type LocalAthletePreferencesInput, type LoggedSetInput, type RoutineInput } from './trainingSchemas';
import type { BodyMeasurement, Exercise, LocalAthletePreferences, OutboxOperation, ProgressSummary, Routine, TrainingOverview, Workout, WorkoutDetail } from './trainingTypes';
import type { TrainingRepository } from './TrainingRepository';

type SessionRow = { id: string; state: 'active' | 'completed' | 'deleted'; started_at: string; completed_at: string | null; local_version: number; server_version: number | null; sync_status: Workout['syncStatus'] };
type ExerciseRow = { id: string; name: string; muscle_group: string; equipment: string | null; origin: Exercise['origin'] };
type OutboxRow = { id: string; client_mutation_id: string; aggregate_type: string; aggregate_id: string; operation: string; local_version: number; base_server_version: number | null; payload_json: string; status: OutboxOperation['status']; attempt_count: number };
type RoutineRow = { id: string; name: string; updated_at: string; exercise_id: string | null; exercise_name: string | null; sort_order: number | null; sets_target: number | null; reps_target: number | null; rest_seconds: number | null };
type SetRow = { id: string; set_index: number; weight_kg: number | null; reps: number | null; rir: number | null; is_warmup: number; updated_at: string };
type SessionExerciseRow = { id: string; exercise_id: string; exercise_name: string; sort_order: number; sets_target: number | null; reps_target: number | null; rest_seconds: number | null };
type MeasurementRow = { id: string; measurement_type: BodyMeasurement['type']; value: number; unit: BodyMeasurement['unit']; measured_at: string; local_version: number; server_version: number | null; sync_status: Workout['syncStatus'] };
type PreferencesRow = { display_name: string; unit_system: LocalAthletePreferences['unitSystem']; preferred_sport: LocalAthletePreferences['preferredSport']; timezone: string };

const nowIso = () => new Date().toISOString();

export class SQLiteTrainingRepository implements TrainingRepository {
  constructor(private readonly db: SQLiteDatabase, private readonly ownerKey: string) {}

  async searchExercises(query = ''): Promise<Exercise[]> {
    const normalized = query.trim();
    const rows = await this.db.getAllAsync<ExerciseRow>(
      `SELECT id, name, muscle_group, equipment, origin FROM exercises
       WHERE (? = '' OR name LIKE ? OR muscle_group LIKE ? OR equipment LIKE ?)
       ORDER BY name COLLATE NOCASE`,
      normalized,
      `%${normalized}%`,
      `%${normalized}%`,
      `%${normalized}%`,
    );
    return rows.map((row) => ({ id: row.id, name: row.name, muscleGroup: row.muscle_group, equipment: row.equipment, origin: row.origin }));
  }

  async listRoutines(): Promise<Routine[]> {
    const rows = await this.db.getAllAsync<RoutineRow>(
      `SELECT r.id, r.name, r.updated_at, re.exercise_id, e.name AS exercise_name,
              re.sort_order, re.sets_target, re.reps_target, re.rest_seconds
       FROM routines r LEFT JOIN routine_exercises re ON re.routine_id = r.id
       LEFT JOIN exercises e ON e.id = re.exercise_id
       WHERE r.owner_key = ? AND r.tombstoned_at IS NULL
       ORDER BY r.updated_at DESC, re.sort_order`,
      this.ownerKey,
    );
    const byId = new Map<string, Routine>();
    for (const row of rows) {
      let routine = byId.get(row.id);
      if (!routine) {
        routine = { id: row.id, name: row.name, updatedAt: row.updated_at, exercises: [] };
        byId.set(row.id, routine);
      }
      if (row.exercise_id && row.exercise_name !== null) {
        routine.exercises.push({
          exerciseId: row.exercise_id,
          exerciseName: row.exercise_name,
          sortOrder: row.sort_order ?? 0,
          sets: row.sets_target ?? 3,
          reps: row.reps_target ?? 8,
          restSeconds: row.rest_seconds ?? 90,
        });
      }
    }
    return [...byId.values()];
  }

  async createRoutine(input: RoutineInput): Promise<string> {
    const data = RoutineInputSchema.parse(input);
    const id = newId();
    const now = nowIso();
    await this.db.withTransactionAsync(async () => {
      await this.db.runAsync(
        'INSERT INTO routines (id, owner_key, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
        id, this.ownerKey, data.name, now, now,
      );
      for (const [index, item] of data.exercises.entries()) {
        await this.db.runAsync(
          'INSERT INTO routine_exercises (id, routine_id, exercise_id, sort_order, sets_target, reps_target, rest_seconds) VALUES (?, ?, ?, ?, ?, ?, ?)',
          newId(), id, item.exerciseId, index, item.sets, item.reps, item.restSeconds,
        );
      }
      await this.enqueue('routine', id, 'upsert', 1, null, { id, ownerKey: this.ownerKey, ...data, updatedAt: now });
    });
    return id;
  }

  async tombstoneRoutine(routineId: string): Promise<void> {
    const now = nowIso();
    await this.db.withTransactionAsync(async () => {
      const row = await this.db.getFirstAsync<{ local_version: number; server_version: number | null }>(
        'SELECT local_version, server_version FROM routines WHERE id = ? AND owner_key = ? AND tombstoned_at IS NULL',
        routineId, this.ownerKey,
      );
      if (!row) throw new Error('ROUTINE_NOT_FOUND');
      const version = row.local_version + 1;
      await this.db.runAsync(
        'UPDATE routines SET tombstoned_at = ?, updated_at = ?, local_version = ?, sync_status = ? WHERE id = ? AND owner_key = ?',
        now, now, version, 'pending', routineId, this.ownerKey,
      );
      await this.enqueue('routine', routineId, 'tombstone', version, row.server_version, { id: routineId, tombstonedAt: now });
    });
  }

  async startWorkout(routineId?: string): Promise<string> {
    let id = newId();
    const now = nowIso();
    await this.db.withTransactionAsync(async () => {
      const active = await this.db.getFirstAsync<{ id: string }>(
        "SELECT id FROM workout_sessions WHERE owner_key = ? AND state = 'active' AND tombstoned_at IS NULL LIMIT 1",
        this.ownerKey,
      );
      if (active) { id = active.id; return; }
      let routineName: string | null = null;
      let planned: Array<{ exercise_id: string; sets_target: number; reps_target: number; rest_seconds: number }> = [];
      if (routineId) {
        const routine = await this.db.getFirstAsync<{ name: string }>(
          'SELECT name FROM routines WHERE id = ? AND owner_key = ? AND tombstoned_at IS NULL',
          routineId, this.ownerKey,
        );
        if (!routine) throw new Error('ROUTINE_NOT_FOUND');
        routineName = routine.name;
        planned = await this.db.getAllAsync(
          'SELECT exercise_id, sets_target, reps_target, rest_seconds FROM routine_exercises WHERE routine_id = ? ORDER BY sort_order',
          routineId,
        );
      }
      await this.db.runAsync(
        'INSERT INTO workout_sessions (id, owner_key, routine_id, state, started_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
        id, this.ownerKey, routineId ?? null, 'active', now, now,
      );
      for (const [index, item] of planned.entries()) {
        const sessionExerciseId = newId();
        await this.db.runAsync(
          'INSERT INTO session_exercises (id, session_id, exercise_id, sort_order, sets_target, reps_target, rest_seconds) VALUES (?, ?, ?, ?, ?, ?, ?)',
          sessionExerciseId, id, item.exercise_id, index, item.sets_target, item.reps_target, item.rest_seconds,
        );
        for (let setIndex = 0; setIndex < item.sets_target; setIndex += 1) {
          await this.db.runAsync(
            'INSERT INTO workout_sets (id, session_exercise_id, set_index, updated_at) VALUES (?, ?, ?, ?)',
            newId(), sessionExerciseId, setIndex, now,
          );
        }
      }
      await this.enqueue('workout_session', id, 'create', 1, null, { id, routineId: routineId ?? null, routineName, startedAt: now });
    });
    return id;
  }

  async addExercise(sessionId: string, exerciseId: string): Promise<void> {
    const now = nowIso();
    await this.db.withTransactionAsync(async () => {
      await this.requireActiveSession(sessionId);
      const exercise = await this.db.getFirstAsync<{ id: string }>('SELECT id FROM exercises WHERE id = ?', exerciseId);
      if (!exercise) throw new Error('EXERCISE_NOT_FOUND');
      const order = await this.db.getFirstAsync<{ next_order: number }>(
        'SELECT COALESCE(MAX(sort_order) + 1, 0) AS next_order FROM session_exercises WHERE session_id = ?', sessionId,
      );
      const sessionExerciseId = newId();
      await this.db.runAsync(
        'INSERT INTO session_exercises (id, session_id, exercise_id, sort_order) VALUES (?, ?, ?, ?)',
        sessionExerciseId, sessionId, exerciseId, order?.next_order ?? 0,
      );
      await this.db.runAsync(
        'INSERT INTO workout_sets (id, session_exercise_id, set_index, updated_at) VALUES (?, ?, ?, ?)',
        newId(), sessionExerciseId, 0, now,
      );
      const version = await this.bumpSessionVersion(sessionId, now);
      await this.enqueue('workout_session', sessionId, 'add_exercise', version.localVersion, version.serverVersion, { sessionExerciseId, exerciseId });
    });
  }

  async addSet(sessionId: string, sessionExerciseId: string): Promise<string> {
    const setId = newId();
    const now = nowIso();
    await this.db.withTransactionAsync(async () => {
      await this.requireActiveSession(sessionId);
      const owned = await this.db.getFirstAsync<{ last_index: number | null }>(
        `SELECT MAX(ws.set_index) AS last_index FROM session_exercises se
         LEFT JOIN workout_sets ws ON ws.session_exercise_id = se.id
         WHERE se.id = ? AND se.session_id = ?`, sessionExerciseId, sessionId,
      );
      if (!owned) throw new Error('SESSION_EXERCISE_NOT_FOUND');
      const setIndex = (owned.last_index ?? -1) + 1;
      await this.db.runAsync(
        'INSERT INTO workout_sets (id, session_exercise_id, set_index, updated_at) VALUES (?, ?, ?, ?)',
        setId, sessionExerciseId, setIndex, now,
      );
      const version = await this.bumpSessionVersion(sessionId, now);
      await this.enqueue('workout_session', sessionId, 'add_set', version.localVersion, version.serverVersion, { sessionExerciseId, setId, setIndex });
    });
    return setId;
  }

  async saveSet(sessionId: string, setId: string, input: LoggedSetInput): Promise<void> {
    const data = LoggedSetSchema.parse(input);
    const now = nowIso();
    await this.db.withTransactionAsync(async () => {
      await this.requireActiveSession(sessionId);
      const row = await this.db.getFirstAsync<{ session_exercise_id: string }>(
        `SELECT ws.session_exercise_id FROM workout_sets ws
         JOIN session_exercises se ON se.id = ws.session_exercise_id
         WHERE ws.id = ? AND se.session_id = ?`, setId, sessionId,
      );
      if (!row) throw new Error('SET_NOT_FOUND');
      await this.db.runAsync(
        'UPDATE workout_sets SET weight_kg = ?, reps = ?, rir = ?, is_warmup = ?, updated_at = ? WHERE id = ?',
        data.weightKg, data.reps, data.rir, data.isWarmup ? 1 : 0, now, setId,
      );
      const version = await this.bumpSessionVersion(sessionId, now);
      await this.enqueue('workout_session', sessionId, 'upsert_set', version.localVersion, version.serverVersion, { sessionExerciseId: row.session_exercise_id, setId, ...data });
    });
  }

  async finishWorkout(sessionId: string): Promise<void> {
    const now = nowIso();
    await this.db.withTransactionAsync(async () => {
      await this.requireActiveSession(sessionId);
      const row = await this.db.getFirstAsync<{ recorded_sets: number }>(
        `SELECT COUNT(*) AS recorded_sets FROM workout_sets ws
         JOIN session_exercises se ON se.id = ws.session_exercise_id
         WHERE se.session_id = ? AND (ws.weight_kg IS NOT NULL OR ws.reps IS NOT NULL)`, sessionId,
      );
      if (!row || row.recorded_sets < 1) throw new Error('WORKOUT_REQUIRES_RECORDED_SET');
      const version = await this.bumpSessionVersion(sessionId, now);
      await this.db.runAsync(
        'UPDATE workout_sessions SET state = ?, completed_at = ?, updated_at = ? WHERE id = ? AND owner_key = ?',
        'completed', now, now, sessionId, this.ownerKey,
      );
      await this.enqueue('workout_session', sessionId, 'complete', version.localVersion, version.serverVersion, { completedAt: now });
    });
  }

  async tombstoneWorkout(sessionId: string): Promise<void> {
    const now = nowIso();
    await this.db.withTransactionAsync(async () => {
      const row = await this.db.getFirstAsync<{ local_version: number; server_version: number | null }>(
        'SELECT local_version, server_version FROM workout_sessions WHERE id = ? AND owner_key = ? AND tombstoned_at IS NULL',
        sessionId, this.ownerKey,
      );
      if (!row) throw new Error('WORKOUT_NOT_FOUND');
      const version = row.local_version + 1;
      await this.db.runAsync(
        'UPDATE workout_sessions SET state = ?, tombstoned_at = ?, updated_at = ?, local_version = ?, sync_status = ? WHERE id = ? AND owner_key = ?',
        'deleted', now, now, version, 'pending', sessionId, this.ownerKey,
      );
      await this.enqueue('workout_session', sessionId, 'tombstone', version, row.server_version, { id: sessionId, tombstonedAt: now });
    });
  }

  async getWorkout(sessionId: string): Promise<WorkoutDetail | null> {
    const row = await this.db.getFirstAsync<SessionRow & { exercise_count: number; set_count: number }>(
      `SELECT s.id, s.state, s.started_at, s.completed_at, s.local_version, s.server_version, s.sync_status,
              COUNT(DISTINCT se.id) AS exercise_count, COUNT(DISTINCT CASE WHEN ws.weight_kg IS NOT NULL OR ws.reps IS NOT NULL THEN ws.id END) AS set_count
       FROM workout_sessions s LEFT JOIN session_exercises se ON se.session_id = s.id
       LEFT JOIN workout_sets ws ON ws.session_exercise_id = se.id
       WHERE s.id = ? AND s.owner_key = ? AND s.tombstoned_at IS NULL GROUP BY s.id`,
      sessionId, this.ownerKey,
    );
    if (!row) return null;
    const exerciseRows = await this.db.getAllAsync<SessionExerciseRow>(
      `SELECT se.id, se.exercise_id, e.name AS exercise_name, se.sort_order, se.sets_target, se.reps_target, se.rest_seconds
       FROM session_exercises se JOIN exercises e ON e.id = se.exercise_id
       WHERE se.session_id = ? ORDER BY se.sort_order`, sessionId,
    );
    const exercises = await Promise.all(exerciseRows.map(async (exercise) => {
      const sets = await this.db.getAllAsync<SetRow>(
        'SELECT id, set_index, weight_kg, reps, rir, is_warmup, updated_at FROM workout_sets WHERE session_exercise_id = ? ORDER BY set_index',
        exercise.id,
      );
      return {
        id: exercise.id,
        exerciseId: exercise.exercise_id,
        exerciseName: exercise.exercise_name,
        sortOrder: exercise.sort_order,
        setsTarget: exercise.sets_target,
        repsTarget: exercise.reps_target,
        restSeconds: exercise.rest_seconds,
        sets: sets.map((set) => ({ id: set.id, setIndex: set.set_index, weightKg: set.weight_kg, reps: set.reps, rir: set.rir, isWarmup: Boolean(set.is_warmup) })),
      };
    }));
    return { workout: this.toWorkout(row, row.exercise_count, row.set_count), exercises };
  }

  async listHistory(): Promise<Workout[]> {
    const rows = await this.db.getAllAsync<SessionRow & { exercise_count: number; set_count: number }>(
      `SELECT s.id, s.state, s.started_at, s.completed_at, s.local_version, s.server_version, s.sync_status,
              COUNT(DISTINCT se.id) AS exercise_count,
              COUNT(DISTINCT CASE WHEN ws.weight_kg IS NOT NULL OR ws.reps IS NOT NULL THEN ws.id END) AS set_count
       FROM workout_sessions s LEFT JOIN session_exercises se ON se.session_id = s.id
       LEFT JOIN workout_sets ws ON ws.session_exercise_id = se.id
       WHERE s.owner_key = ? AND s.tombstoned_at IS NULL AND s.state = 'completed'
       GROUP BY s.id ORDER BY s.completed_at DESC`, this.ownerKey,
    );
    return rows.map((row) => this.toWorkout(row, row.exercise_count, row.set_count));
  }

  async getOverview(): Promise<TrainingOverview> {
    const history = await this.listHistory();
    const today = new Date();
    const weekStart = new Date(today);
    weekStart.setHours(0, 0, 0, 0);
    weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7));
    const recent = history.filter((workout) => new Date(workout.startedAt).getTime() >= weekStart.getTime());
    const pending = await this.db.getFirstAsync<{ count: number }>(
      "SELECT COUNT(*) AS count FROM sync_outbox WHERE owner_key = ? AND status IN ('pending','syncing','failed','conflict')",
      this.ownerKey,
    );
    const latestWorkout = history[0] ?? null;
    const active = await this.db.getFirstAsync<SessionRow>(
      "SELECT id, state, started_at, completed_at, local_version, server_version, sync_status FROM workout_sessions WHERE owner_key = ? AND state = 'active' AND tombstoned_at IS NULL ORDER BY started_at DESC LIMIT 1",
      this.ownerKey,
    );
    return {
      sessionsThisWeek: recent.length,
      activityMinutesThisWeek: recent.reduce((sum, workout) => sum + (workout.durationMinutes ?? 0), 0),
      pendingSyncCount: pending?.count ?? 0,
      latestWorkout: active ? this.toWorkout(active, 0, 0) : latestWorkout,
    };
  }

  async getProgress(): Promise<ProgressSummary> {
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    const chartStart = new Date(now);
    chartStart.setHours(0, 0, 0, 0);
    chartStart.setDate(chartStart.getDate() - 6);
    const sessions = await this.db.getAllAsync<{ started_at: string }>(
      "SELECT started_at FROM workout_sessions WHERE owner_key = ? AND state = 'completed' AND tombstoned_at IS NULL AND started_at >= ?",
      this.ownerKey, firstDay.toISOString(),
    );
    const rows = await this.db.getAllAsync<{ exercise_name: string; weight_kg: number | null; reps: number | null; is_warmup: number; started_at: string }>(
      `SELECT e.name AS exercise_name, ws.weight_kg, ws.reps, ws.is_warmup, s.started_at
       FROM workout_sets ws JOIN session_exercises se ON se.id = ws.session_exercise_id
       JOIN exercises e ON e.id = se.exercise_id JOIN workout_sessions s ON s.id = se.session_id
       WHERE s.owner_key = ? AND s.state = 'completed' AND s.tombstoned_at IS NULL
       AND ws.weight_kg IS NOT NULL AND ws.is_warmup = 0`, this.ownerKey,
    );
    const daily = new Map<string, number>();
    const best = new Map<string, { exerciseName: string; weightKg: number; reps: number | null; measuredAt: string }>();
    let weeklyVolumeKg = 0;
    for (const row of rows) {
      const localDate = new Date(row.started_at);
      const key = `${localDate.getFullYear()}-${String(localDate.getMonth() + 1).padStart(2, '0')}-${String(localDate.getDate()).padStart(2, '0')}`;
      const volume = row.weight_kg === null || row.reps === null ? 0 : row.weight_kg * row.reps;
      if (localDate >= chartStart) {
        daily.set(key, (daily.get(key) ?? 0) + volume);
        weeklyVolumeKg += volume;
      }
      if (row.weight_kg !== null) {
        const old = best.get(row.exercise_name);
        if (!old || row.weight_kg > old.weightKg) best.set(row.exercise_name, { exerciseName: row.exercise_name, weightKg: row.weight_kg, reps: row.reps, measuredAt: row.started_at });
      }
    }
    const dailyVolumeKg = Array.from({ length: 7 }, (_, index) => {
      const date = new Date(chartStart); date.setDate(chartStart.getDate() + index);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
      return { label: new Intl.DateTimeFormat('es-MX', { weekday: 'short' }).format(date).replace('.', '').toUpperCase(), volumeKg: daily.get(key) ?? 0 };
    });
    return { weeklyVolumeKg, sessionsThisMonth: sessions.length, dailyVolumeKg, records: [...best.values()].sort((a, b) => b.weightKg - a.weightKg), measurements: await this.listBodyMeasurements() };
  }

  async addBodyMeasurement(input: BodyMeasurementInput): Promise<string> {
    const data = BodyMeasurementSchema.parse(input);
    const id = newId();
    const unit = data.type === 'weight_kg' ? 'kg' : 'cm';
    await this.db.withTransactionAsync(async () => {
      await this.db.runAsync(
        'INSERT INTO body_measurements (id, owner_key, measurement_type, value, unit, measured_at) VALUES (?, ?, ?, ?, ?, ?)',
        id, this.ownerKey, data.type, data.value, unit, data.measuredAt,
      );
      await this.enqueue('body_measurement', id, 'create', 1, null, { id, ownerKey: this.ownerKey, ...data, unit });
    });
    return id;
  }

  async listBodyMeasurements(): Promise<BodyMeasurement[]> {
    const rows = await this.db.getAllAsync<MeasurementRow>(
      'SELECT id, measurement_type, value, unit, measured_at, local_version, server_version, sync_status FROM body_measurements WHERE owner_key = ? AND tombstoned_at IS NULL ORDER BY measured_at DESC',
      this.ownerKey,
    );
    return rows.map((row) => ({ id: row.id, type: row.measurement_type, value: row.value, unit: row.unit, measuredAt: row.measured_at, localVersion: row.local_version, serverVersion: row.server_version, syncStatus: row.sync_status }));
  }

  async tombstoneBodyMeasurement(measurementId: string): Promise<void> {
    const now = nowIso();
    await this.db.withTransactionAsync(async () => {
      const row = await this.db.getFirstAsync<{ local_version: number; server_version: number | null }>(
        'SELECT local_version, server_version FROM body_measurements WHERE id = ? AND owner_key = ? AND tombstoned_at IS NULL', measurementId, this.ownerKey,
      );
      if (!row) throw new Error('MEASUREMENT_NOT_FOUND');
      const version = row.local_version + 1;
      await this.db.runAsync('UPDATE body_measurements SET tombstoned_at = ?, local_version = ?, sync_status = ? WHERE id = ? AND owner_key = ?', now, version, 'pending', measurementId, this.ownerKey);
      await this.enqueue('body_measurement', measurementId, 'tombstone', version, row.server_version, { id: measurementId, tombstonedAt: now });
    });
  }

  async getPreferences(): Promise<LocalAthletePreferences> {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    const row = await this.db.getFirstAsync<PreferencesRow>(
      'SELECT display_name, unit_system, preferred_sport, timezone FROM athlete_local_preferences WHERE owner_key = ?', this.ownerKey,
    );
    return row
      ? { displayName: row.display_name, unitSystem: row.unit_system, preferredSport: row.preferred_sport, timezone: row.timezone }
      : { displayName: '', unitSystem: 'metric', preferredSport: 'strength', timezone };
  }

  async savePreferences(input: LocalAthletePreferencesInput): Promise<void> {
    const data = LocalAthletePreferencesSchema.parse(input);
    await this.db.runAsync(
      `INSERT INTO athlete_local_preferences (owner_key, display_name, unit_system, preferred_sport, timezone, updated_at)
       VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(owner_key) DO UPDATE SET display_name = excluded.display_name,
       unit_system = excluded.unit_system, preferred_sport = excluded.preferred_sport, timezone = excluded.timezone,
       updated_at = excluded.updated_at`,
      this.ownerKey, data.displayName, data.unitSystem, data.preferredSport, data.timezone, nowIso(),
    );
  }

  async listOutbox(limit = 50): Promise<OutboxOperation[]> {
    const rows = await this.db.getAllAsync<OutboxRow>(
      `SELECT id, client_mutation_id, aggregate_type, aggregate_id, operation, local_version,
              base_server_version, payload_json, status, attempt_count
       FROM sync_outbox WHERE owner_key = ? AND status IN ('pending','failed')
       ORDER BY created_at, id LIMIT ?`, this.ownerKey, Math.max(1, Math.min(limit, 200)),
    );
    return rows.map((row) => ({
      id: row.id, clientMutationId: row.client_mutation_id, aggregateType: row.aggregate_type,
      aggregateId: row.aggregate_id, operation: row.operation, localVersion: row.local_version,
      baseServerVersion: row.base_server_version, payloadJson: row.payload_json,
      status: row.status, attemptCount: row.attempt_count,
    }));
  }

  async markOutboxSyncing(operationId: string): Promise<OutboxOperation | null> {
    let claimed: OutboxOperation | null = null;
    await this.db.withTransactionAsync(async () => {
      const operation = await this.getOwnedOutbox(operationId);
      if (!operation || !['pending', 'failed'].includes(operation.status)) return;
      const result = await this.db.runAsync(
        "UPDATE sync_outbox SET status = 'syncing', last_error_code = NULL WHERE id = ? AND owner_key = ? AND status IN ('pending','failed')",
        operationId, this.ownerKey,
      );
      if (result.changes !== 1) return;
      claimed = {
        id: operation.id,
        clientMutationId: operation.client_mutation_id,
        aggregateType: operation.aggregate_type,
        aggregateId: operation.aggregate_id,
        operation: operation.operation,
        localVersion: operation.local_version,
        baseServerVersion: operation.base_server_version,
        payloadJson: operation.payload_json,
        status: 'syncing',
        attemptCount: operation.attempt_count,
      };
    });
    return claimed;
  }

  async markOutboxFailed(operationId: string, safeErrorCode: string): Promise<void> {
    await this.db.withTransactionAsync(async () => {
      const operation = await this.db.getFirstAsync<OutboxRow>(
        'SELECT id, client_mutation_id, aggregate_type, aggregate_id, operation, local_version, base_server_version, payload_json, status, attempt_count FROM sync_outbox WHERE id = ? AND owner_key = ?',
        operationId, this.ownerKey,
      );
      if (!operation) throw new Error('OUTBOX_OPERATION_NOT_FOUND');
      await this.db.runAsync(
        "UPDATE sync_outbox SET status = 'failed', attempt_count = attempt_count + 1, last_error_code = ? WHERE id = ?",
        safeErrorCode.slice(0, 80), operationId,
      );
      await this.setAggregateSyncStatus(operation.aggregate_type, operation.aggregate_id, 'failed');
    });
  }

  async markOutboxConflict(operationId: string, remoteSnapshotJson: string, serverVersion: number): Promise<void> {
    await this.db.withTransactionAsync(async () => {
      const operation = await this.getOwnedOutbox(operationId);
      if (!operation) throw new Error('OUTBOX_OPERATION_NOT_FOUND');
      const localSnapshot = await this.localSnapshot(operation.aggregate_type, operation.aggregate_id);
      await this.db.runAsync(
        "UPDATE sync_outbox SET status = 'conflict', last_error_code = 'VERSION_CONFLICT' WHERE id = ?",
        operationId,
      );
      await this.db.runAsync(
        `INSERT INTO sync_conflicts (id, owner_key, aggregate_type, aggregate_id, local_version, server_version, local_snapshot_json, remote_snapshot_json, detected_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        newId(), this.ownerKey, operation.aggregate_type, operation.aggregate_id, operation.local_version,
        serverVersion, JSON.stringify(localSnapshot), remoteSnapshotJson, nowIso(),
      );
      await this.setAggregateSyncStatus(operation.aggregate_type, operation.aggregate_id, 'conflict');
    });
  }

  async markOutboxAcknowledged(operationId: string, serverVersion: number): Promise<void> {
    await this.db.withTransactionAsync(async () => {
      const operation = await this.getOwnedOutbox(operationId);
      if (!operation) throw new Error('OUTBOX_OPERATION_NOT_FOUND');
      await this.db.runAsync("UPDATE sync_outbox SET status = 'acked', last_error_code = NULL WHERE id = ?", operationId);
      const table = operation.aggregate_type === 'routine' ? 'routines' : operation.aggregate_type === 'body_measurement' ? 'body_measurements' : 'workout_sessions';
      await this.db.runAsync(
        `UPDATE ${table} SET server_version = MAX(COALESCE(server_version, 0), ?),
         sync_status = CASE
           WHEN EXISTS (SELECT 1 FROM sync_outbox o WHERE o.owner_key = ? AND o.aggregate_type = ? AND o.aggregate_id = ? AND o.status = 'conflict') THEN 'conflict'
           WHEN local_version <= ? AND NOT EXISTS (SELECT 1 FROM sync_outbox o WHERE o.owner_key = ? AND o.aggregate_type = ? AND o.aggregate_id = ? AND o.status IN ('pending','syncing','failed')) THEN 'synced'
           ELSE 'pending' END
         WHERE id = ? AND owner_key = ?`,
        serverVersion, this.ownerKey, operation.aggregate_type, operation.aggregate_id,
        operation.local_version, this.ownerKey, operation.aggregate_type, operation.aggregate_id,
        operation.aggregate_id, this.ownerKey,
      );
      // Deliberately no remote snapshot is applied here: an acknowledgement may never replace a newer local edit.
    });
  }

  private async requireActiveSession(sessionId: string): Promise<void> {
    const session = await this.db.getFirstAsync<{ id: string }>(
      "SELECT id FROM workout_sessions WHERE id = ? AND owner_key = ? AND state = 'active' AND tombstoned_at IS NULL",
      sessionId, this.ownerKey,
    );
    if (!session) throw new Error('ACTIVE_WORKOUT_NOT_FOUND');
  }

  private async bumpSessionVersion(sessionId: string, updatedAt: string): Promise<{ localVersion: number; serverVersion: number | null }> {
    const session = await this.db.getFirstAsync<{ local_version: number; server_version: number | null }>(
      'SELECT local_version, server_version FROM workout_sessions WHERE id = ? AND owner_key = ?', sessionId, this.ownerKey,
    );
    if (!session) throw new Error('WORKOUT_NOT_FOUND');
    const localVersion = session.local_version + 1;
    await this.db.runAsync(
      "UPDATE workout_sessions SET local_version = ?, updated_at = ?, sync_status = 'pending' WHERE id = ? AND owner_key = ?",
      localVersion, updatedAt, sessionId, this.ownerKey,
    );
    return { localVersion, serverVersion: session.server_version };
  }

  private async enqueue(aggregateType: string, aggregateId: string, operation: string, localVersion: number, baseServerVersion: number | null, payload: unknown): Promise<void> {
    const now = nowIso();
    const idempotencyKey = newId();
    await this.db.runAsync(
      `INSERT INTO sync_outbox (id, client_mutation_id, owner_key, aggregate_type, aggregate_id, operation, local_version, base_server_version, payload_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      newId(), idempotencyKey, this.ownerKey, aggregateType, aggregateId, operation,
      localVersion, baseServerVersion, JSON.stringify(payload), now,
    );
  }

  private async getOwnedOutbox(id: string): Promise<OutboxRow | null> {
    return this.db.getFirstAsync<OutboxRow>(
      'SELECT id, client_mutation_id, aggregate_type, aggregate_id, operation, local_version, base_server_version, payload_json, status, attempt_count FROM sync_outbox WHERE id = ? AND owner_key = ?',
      id, this.ownerKey,
    );
  }

  private async setAggregateSyncStatus(type: string, id: string, status: string): Promise<void> {
    if (type === 'routine') {
      await this.db.runAsync('UPDATE routines SET sync_status = ? WHERE id = ? AND owner_key = ?', status, id, this.ownerKey);
    } else if (type === 'body_measurement') {
      await this.db.runAsync('UPDATE body_measurements SET sync_status = ? WHERE id = ? AND owner_key = ?', status, id, this.ownerKey);
    } else {
      await this.db.runAsync('UPDATE workout_sessions SET sync_status = ? WHERE id = ? AND owner_key = ?', status, id, this.ownerKey);
    }
  }

  private async localSnapshot(type: string, id: string): Promise<unknown> {
    if (type === 'workout_session') return this.getWorkout(id);
    if (type === 'body_measurement') return (await this.listBodyMeasurements()).find((item) => item.id === id) ?? null;
    const routine = (await this.listRoutines()).find((item) => item.id === id);
    return routine ?? null;
  }

  private toWorkout(row: SessionRow, exerciseCount: number, setCount: number): Workout {
    const durationMinutes = row.completed_at
      ? Math.max(0, Math.round((new Date(row.completed_at).getTime() - new Date(row.started_at).getTime()) / 60000))
      : null;
    return {
      id: row.id,
      state: row.state === 'active' ? 'active' : 'completed',
      startedAt: row.started_at,
      completedAt: row.completed_at,
      localVersion: row.local_version,
      serverVersion: row.server_version,
      syncStatus: row.sync_status,
      exerciseCount,
      setCount,
      durationMinutes,
    };
  }
}
