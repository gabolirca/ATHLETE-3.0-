import {
  AddSessionExerciseInput,
  CompleteSessionInput,
  DiscardSessionInput,
  LogSetInput,
  PageRequest,
  ReorderSessionExercisesInput,
  SaveBlockResultInput,
  SessionHistoryQuery,
  StartFromTrainingDayInput,
  StartSessionInput,
  UpdateSessionInput,
  UpdateSetInput,
  type DateRange,
  type LocalDate,
  type Page,
  type Result,
  type SessionBlockResult,
  type SessionExercise,
  type StrengthSet,
  type WorkoutSession,
  type WorkoutSessionDetail,
  type WorkoutSessionRepository,
  type WorkoutSessionSummary,
} from '@athlete/contracts';
import {
  assertCanStart,
  assertTransition,
  canEditContent,
  localDateOf,
  nextPosition,
  planReorder,
  summarizeStrengthSession,
  validateSessionTimes,
} from '@athlete/domain';
import type { LocalRow } from '../local/entities';
import { fail } from '../local/store';
import type { SqlExecutor } from '../sql/types';
import { Repository, checkPosition, checkStartedAt, decodeCursor, encodeCursor, guard, input, toServerScale, unwrap } from './base';

export class LocalWorkoutSessionRepository extends Repository implements WorkoutSessionRepository {
  // ---------- Lectura ----------

  private async loadSession(id: string, tx?: SqlExecutor): Promise<LocalRow> {
    const row = await this.store.get('workout_session', id, tx);
    if (!row || row.deleted_at) fail('NOT_FOUND', 'La sesión no existe.');
    return row!;
  }

  private async loadEditableSession(id: string, tx?: SqlExecutor): Promise<LocalRow> {
    const row = await this.loadSession(id, tx);
    if (!canEditContent(row.status as WorkoutSession['status'])) fail('INVALID_STATE', 'La sesión está descartada.');
    return row;
  }

  private async detail(session: LocalRow, tx?: SqlExecutor): Promise<WorkoutSessionDetail> {
    const exercises = await this.store.select('session_exercise', 'WHERE session_id = ? AND deleted_at IS NULL ORDER BY position, id', [session.id], tx);
    const ids = exercises.map((e) => e.id);
    const sets = ids.length === 0 ? [] : await this.store.select(
      'strength_set',
      `WHERE session_exercise_id IN (${ids.map(() => '?').join(',')}) AND deleted_at IS NULL ORDER BY position, id`,
      ids, tx);
    return {
      ...this.store.toContract<WorkoutSession>('workout_session', session),
      exercises: exercises.map((e) => ({
        ...this.store.toContract<SessionExercise>('session_exercise', e),
        sets: sets.filter((s) => s.session_exercise_id === e.id).map((s) => this.store.toContract<StrengthSet>('strength_set', s)),
      })),
    };
  }

  getActive(): Promise<Result<WorkoutSessionDetail | null>> {
    return guard(async () => {
      const [row] = await this.store.select('workout_session', "WHERE status = 'in_progress' AND deleted_at IS NULL ORDER BY started_at DESC LIMIT 1");
      return row ? this.detail(row) : null;
    });
  }

  getDetail(sessionId: string): Promise<Result<WorkoutSessionDetail>> {
    return guard(async () => this.detail(await this.loadSession(sessionId)));
  }

  listHistory(query: SessionHistoryQuery, page?: PageRequest): Promise<Result<Page<WorkoutSessionSummary>>> {
    return guard(async () => {
      const q = input(SessionHistoryQuery, query);
      const p = input(PageRequest, page ?? {});
      const offset = decodeCursor(p.cursor);
      const where: string[] = ['deleted_at IS NULL', `status IN (${q.status.map(() => '?').join(',')})`];
      const params: (string | number)[] = [...q.status];
      if (q.from) { where.push('local_date >= ?'); params.push(q.from); }
      if (q.to) { where.push('local_date <= ?'); params.push(q.to); }
      if (q.exerciseId) {
        where.push('id IN (SELECT session_id FROM session_exercises WHERE exercise_id = ? AND deleted_at IS NULL)');
        params.push(q.exerciseId);
      }
      const rows = await this.store.select('workout_session',
        `WHERE ${where.join(' AND ')} ORDER BY local_date DESC, started_at DESC, id LIMIT ? OFFSET ?`, [...params, p.limit + 1, offset]);
      const items: WorkoutSessionSummary[] = [];
      for (const row of rows.slice(0, p.limit)) {
        const d = await this.detail(row);
        const s = summarizeStrengthSession(d);
        items.push({
          sessionId: d.id, status: d.status, localDate: d.localDate, startedAt: d.startedAt, endedAt: d.endedAt,
          title: d.title, exerciseCount: s.exerciseCount, workingSetCount: s.workingSetCount, volumeKg: s.volumeKg,
        });
      }
      return { items, nextCursor: rows.length > p.limit ? encodeCursor(offset + p.limit) : null };
    });
  }

  listSetsForExercise(exerciseId: string, range: DateRange = {}): Promise<Result<Array<StrengthSet & { sessionId: string; localDate: LocalDate }>>> {
    return guard(async () => {
      const params: string[] = [exerciseId];
      let filter = '';
      if (range.from) { filter += ' AND w.local_date >= ?'; params.push(range.from); }
      if (range.to) { filter += ' AND w.local_date <= ?'; params.push(range.to); }
      const rows = await this.store.db.all<{ id: string; session_id: string; local_date: string }>(
        `SELECT s.id, e.session_id, w.local_date FROM strength_sets s
           JOIN session_exercises e ON e.id = s.session_exercise_id
           JOIN workout_sessions w ON w.id = e.session_id
         WHERE e.exercise_id = ? AND s.deleted_at IS NULL AND e.deleted_at IS NULL AND w.deleted_at IS NULL
           AND w.status <> 'discarded'${filter}
         ORDER BY w.local_date, s.completed_at, s.position`, params);
      const out: Array<StrengthSet & { sessionId: string; localDate: LocalDate }> = [];
      for (const r of rows) {
        const set = await this.store.get('strength_set', r.id);
        if (set) out.push({ ...this.store.toContract<StrengthSet>('strength_set', set), sessionId: r.session_id, localDate: r.local_date });
      }
      return out;
    });
  }

  // ---------- Sesión ----------

  private async createSession(i: ReturnType<typeof StartSessionInput.parse>, tx: SqlExecutor): Promise<LocalRow> {
    checkStartedAt(i.startedAt, this.now);
    const active = await this.store.select('workout_session', "WHERE status = 'in_progress' AND deleted_at IS NULL", [], tx);
    unwrap(assertCanStart(active.map((s) => ({ id: s.id, status: 'in_progress' as const, deletedAt: null }))));
    if (await this.store.get('workout_session', i.id, tx)) fail('DUPLICATE', 'La sesión ya existe.');
    if (i.trainingDayId !== null) await this.liveRow('training_day', i.trainingDayId, 'El día planificado no existe.', tx);
    return this.store.upsert('workout_session', i.id, {
      status: 'in_progress', training_day_id: i.trainingDayId, title: i.title, started_at: i.startedAt, ended_at: null,
      time_zone: i.timeZone, local_date: localDateOf(i.startedAt, i.timeZone), source: 'manual', notes: i.notes,
    }, tx);
  }

  private async liveRow(entity: 'training_day' | 'training_day_exercise', id: string, message: string, tx: SqlExecutor): Promise<LocalRow> {
    const row = await this.store.get(entity, id, tx);
    if (!row || row.deleted_at) fail('NOT_FOUND', message);
    return row!;
  }

  private async assertUsableExercise(exerciseId: string, tx: SqlExecutor): Promise<void> {
    const ex = await this.store.get('exercise', exerciseId, tx);
    if (!ex || ex.deleted_at || (ex.user_id !== null && ex.user_id !== this.store.ctx.userId)) fail('NOT_FOUND', 'El ejercicio no existe.');
  }

  start(raw: StartSessionInput): Promise<Result<WorkoutSession>> {
    return guard(() => this.store.db.transaction(async (tx) => {
      const row = await this.createSession(input(StartSessionInput, raw), tx);
      return this.store.toContract<WorkoutSession>('workout_session', row);
    }));
  }

  /**
   * Inicia una sesión a partir de un día planificado (rutina) en UNA transacción: crea la sesión y un
   * ejercicio de sesión por cada ejercicio planificado vivo, en el orden del plan y enlazado con
   * `trainingDayExerciseId`. No crea series: lo planificado (objetivos del día) no es lo ejecutado.
   * Si algo falla (sesión en curso, día o ejercicio inexistente) no queda nada escrito.
   * Contrato `WorkoutSessionRepository.startFromTrainingDay` (0.3.0).
   */
  startFromTrainingDay(raw: StartFromTrainingDayInput): Promise<Result<WorkoutSessionDetail>> {
    return guard(() => this.store.db.transaction(async (tx) => {
      const i = input(StartFromTrainingDayInput, raw);
      const session = await this.createSession(i, tx);
      const planned = await this.store.select('training_day_exercise',
        'WHERE training_day_id = ? AND deleted_at IS NULL ORDER BY position, id', [i.trainingDayId], tx);
      for (const [position, p] of planned.entries()) {
        await this.assertUsableExercise(p.exercise_id as string, tx);
        await this.store.upsert('session_exercise', this.store.ctx.ids.newId(), {
          session_id: session.id, exercise_id: p.exercise_id, training_day_exercise_id: p.id, position: checkPosition(position), notes: null,
        }, tx);
      }
      return this.detail(session, tx);
    }));
  }

  update(raw: UpdateSessionInput): Promise<Result<WorkoutSession>> {
    return guard(() => this.store.db.transaction(async (tx) => {
      const i = input(UpdateSessionInput, raw);
      const s = await this.loadEditableSession(i.sessionId, tx);
      const startedAt = i.startedAt ?? (s.started_at as string);
      if (i.startedAt !== undefined) checkStartedAt(i.startedAt, this.now);
      const endedAt = i.endedAt !== undefined ? i.endedAt : (s.ended_at as string | null);
      unwrap(validateSessionTimes(startedAt, endedAt));
      if (s.status === 'completed' && endedAt === null) fail('VALIDATION_FAILED', 'Una sesión completada requiere hora de fin.');
      const changes: Record<string, unknown> = { started_at: startedAt, ended_at: endedAt, local_date: localDateOf(startedAt, s.time_zone as string) };
      if (i.title !== undefined) changes.title = i.title;
      if (i.notes !== undefined) changes.notes = i.notes;
      if (i.sessionRpe !== undefined) changes.session_rpe = i.sessionRpe;
      return this.store.toContract<WorkoutSession>('workout_session', await this.store.upsert('workout_session', s.id, changes, tx));
    }));
  }

  complete(raw: CompleteSessionInput): Promise<Result<WorkoutSession>> {
    return guard(() => this.store.db.transaction(async (tx) => {
      const i = input(CompleteSessionInput, raw);
      const s = await this.loadSession(i.sessionId, tx);
      unwrap(assertTransition(s.status as WorkoutSession['status'], 'completed'));
      unwrap(validateSessionTimes(s.started_at as string, i.endedAt));
      const changes: Record<string, unknown> = { status: 'completed', ended_at: i.endedAt };
      if (i.notes !== undefined) changes.notes = i.notes;
      if (i.sessionRpe !== undefined) changes.session_rpe = i.sessionRpe;
      return this.store.toContract<WorkoutSession>('workout_session', await this.store.upsert('workout_session', s.id, changes, tx));
    }));
  }

  discard(raw: DiscardSessionInput): Promise<Result<WorkoutSession>> {
    return guard(() => this.store.db.transaction(async (tx) => {
      const i = input(DiscardSessionInput, raw);
      const s = await this.loadSession(i.sessionId, tx);
      unwrap(assertTransition(s.status as WorkoutSession['status'], 'discarded'));
      return this.store.toContract<WorkoutSession>('workout_session', await this.store.upsert('workout_session', s.id, { status: 'discarded' }, tx));
    }));
  }

  // ---- Resultado de bloques (0.7.0) ----
  saveBlockResult(raw: SaveBlockResultInput): Promise<Result<SessionBlockResult>> {
    return guard(() => this.store.db.transaction(async (tx) => {
      const i = input(SaveBlockResultInput, raw);
      const session = await this.loadSession(i.sessionId, tx);
      if (session.status === 'discarded') fail('INVALID_STATE', 'La sesión está descartada.');
      const existing = await this.store.get('session_block_result', i.id, tx);
      if (existing && existing.session_id !== i.sessionId) fail('VALIDATION_FAILED', 'El resultado pertenece a otra sesión.');
      const row = await this.store.upsert('session_block_result', i.id, {
        session_id: i.sessionId, training_block_id: i.trainingBlockId, position: checkPosition(i.position), name: i.name, format: i.format,
        rounds_completed: i.roundsCompleted, extra_reps: i.extraReps, duration_seconds: i.durationSeconds, notes: i.notes,
      }, tx);
      return this.store.toContract<SessionBlockResult>('session_block_result', row);
    }));
  }

  listBlockResults(sessionId: string): Promise<Result<SessionBlockResult[]>> {
    return guard(async () => (await this.store.select('session_block_result', 'WHERE session_id = ? AND deleted_at IS NULL ORDER BY position, id', [sessionId]))
      .map((r) => this.store.toContract<SessionBlockResult>('session_block_result', r)));
  }

  delete(sessionId: string): Promise<Result<void>> {
    return guard(() => this.store.remove('workout_session', sessionId));
  }

  // ---------- Ejercicios de la sesión ----------

  addExercise(raw: AddSessionExerciseInput): Promise<Result<SessionExercise>> {
    return guard(() => this.store.db.transaction(async (tx) => {
      const i = input(AddSessionExerciseInput, raw);
      await this.loadEditableSession(i.sessionId, tx);
      await this.assertUsableExercise(i.exerciseId, tx);
      if (i.trainingDayExerciseId !== null) await this.liveRow('training_day_exercise', i.trainingDayExerciseId, 'El ejercicio planificado no existe.', tx);
      if (await this.store.get('session_exercise', i.id, tx)) fail('DUPLICATE', 'El ejercicio ya está en la sesión.');
      const siblings = await this.store.select('session_exercise', 'WHERE session_id = ?', [i.sessionId], tx);
      const row = await this.store.upsert('session_exercise', i.id, {
        session_id: i.sessionId, exercise_id: i.exerciseId, training_day_exercise_id: i.trainingDayExerciseId,
        position: checkPosition(i.position ?? nextPosition(siblings.map((s) => ({ position: s.position as number, deletedAt: s.deleted_at as string | null })))),
        notes: i.notes,
      }, tx);
      return this.store.toContract<SessionExercise>('session_exercise', row);
    }));
  }

  reorderExercises(raw: ReorderSessionExercisesInput): Promise<Result<SessionExercise[]>> {
    return guard(() => this.store.db.transaction(async (tx) => {
      const i = input(ReorderSessionExercisesInput, raw);
      await this.loadEditableSession(i.sessionId, tx);
      const current = await this.store.select('session_exercise', 'WHERE session_id = ? AND deleted_at IS NULL', [i.sessionId], tx);
      const plan = unwrap(planReorder(current.map((c) => c.id), i.orderedSessionExerciseIds));
      const out: SessionExercise[] = [];
      for (const id of i.orderedSessionExerciseIds) {
        const row = current.find((c) => c.id === id)!;
        const position = plan.get(id)!;
        const next = row.position === position ? row : await this.store.upsert('session_exercise', id, { position }, tx);
        out.push(this.store.toContract<SessionExercise>('session_exercise', next));
      }
      return out;
    }));
  }

  removeExercise(sessionExerciseId: string): Promise<Result<void>> {
    return guard(() => this.store.remove('session_exercise', sessionExerciseId));
  }

  // ---------- Series ----------

  private async parentOfSet(sessionExerciseId: string, tx: SqlExecutor): Promise<LocalRow> {
    const se = await this.store.get('session_exercise', sessionExerciseId, tx);
    if (!se || se.deleted_at) fail('NOT_FOUND', 'El ejercicio de la sesión no existe.');
    await this.loadEditableSession(se!.session_id as string, tx);
    return se!;
  }

  logSet(raw: LogSetInput): Promise<Result<StrengthSet>> {
    return guard(() => this.store.db.transaction(async (tx) => {
      const i = input(LogSetInput, raw);
      await this.parentOfSet(i.sessionExerciseId, tx);
      if (await this.store.get('strength_set', i.id, tx)) fail('DUPLICATE', 'La serie ya existe.');
      const siblings = await this.store.select('strength_set', 'WHERE session_exercise_id = ?', [i.sessionExerciseId], tx);
      const row = await this.store.upsert('strength_set', i.id, {
        session_exercise_id: i.sessionExerciseId,
        position: checkPosition(i.position ?? nextPosition(siblings.map((s) => ({ position: s.position as number, deletedAt: s.deleted_at as string | null })))),
        set_type: i.setType, weight_kg: toServerScale(i.weightKg, 2), reps: i.reps, rir: i.rir, rpe: i.rpe, rest_seconds: i.restSeconds,
        duration_seconds: i.durationSeconds, distance_m: toServerScale(i.distanceMeters, 2), completed_at: i.completedAt, notes: i.notes,
      }, tx);
      return this.store.toContract<StrengthSet>('strength_set', row);
    }));
  }

  updateSet(raw: UpdateSetInput): Promise<Result<StrengthSet>> {
    return guard(() => this.store.db.transaction(async (tx) => {
      const i = input(UpdateSetInput, raw);
      const set = await this.store.get('strength_set', i.setId, tx);
      if (!set || set.deleted_at) fail('NOT_FOUND', 'La serie no existe.');
      await this.parentOfSet(set!.session_exercise_id as string, tx);
      const map: Record<string, string> = {
        setType: 'set_type', weightKg: 'weight_kg', reps: 'reps', rir: 'rir', rpe: 'rpe', restSeconds: 'rest_seconds',
        durationSeconds: 'duration_seconds', distanceMeters: 'distance_m', completedAt: 'completed_at', notes: 'notes',
      };
      const changes: Record<string, unknown> = {};
      for (const [k, col] of Object.entries(map)) {
        const v = (i as Record<string, unknown>)[k];
        if (v !== undefined) changes[col] = v; // ausente = no cambiar; null = borrar
      }
      if ('weight_kg' in changes) changes.weight_kg = toServerScale(changes.weight_kg as number | null, 2);
      if ('distance_m' in changes) changes.distance_m = toServerScale(changes.distance_m as number | null, 2);
      return this.store.toContract<StrengthSet>('strength_set', await this.store.upsert('strength_set', i.setId, changes, tx));
    }));
  }

  deleteSet(setId: string): Promise<Result<void>> {
    return guard(() => this.store.remove('strength_set', setId));
  }
}
