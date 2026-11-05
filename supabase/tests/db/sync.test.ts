import { afterAll, describe, expect, it } from 'vitest';
import { asUser, createUser, del, pgError, pool, pull, push, seedSession, sessionPayload, upsert, uuid } from './helpers';

afterAll(() => pool.end());

describe('idempotencia', () => {
  it('reintentar el mismo lote no duplica registros', async () => {
    const u = await createUser();
    const session = uuid();
    const batch = [upsert('workout_session', session, sessionPayload())];
    const first = await asUser(u, (db) => push(db, batch));
    const second = await asUser(u, (db) => push(db, batch));
    const third = await asUser(u, (db) => push(db, batch));
    expect(first[0]).toMatchObject({ status: 'applied', revision: 1 });
    expect(second[0]).toMatchObject({ status: 'duplicate', revision: 1 });
    expect(third[0]).toMatchObject({ status: 'duplicate', revision: 1 });
    const { rows } = await pool.query('select count(*)::int as n, max(revision)::int as rev from athlete3.workout_sessions where user_id = $1', [u]);
    expect(rows[0]).toEqual({ n: 1, rev: 1 });
  });

  it('crear dos veces el mismo id con mutaciones distintas produce conflicto, no duplicado', async () => {
    const u = await createUser();
    const id = uuid();
    await asUser(u, (db) => push(db, [upsert('workout_session', id, sessionPayload())]));
    const [r] = await asUser(u, (db) => push(db, [upsert('workout_session', id, sessionPayload({ notes: 'otra' }))]));
    expect(r).toMatchObject({ status: 'conflict', serverRevision: 1 });
  });
});

describe('control de versiones y conflictos', () => {
  it('nunca sobrescribe un registro nuevo con datos basados en una revisión antigua', async () => {
    const u = await createUser();
    const { set } = await seedSession(u);
    const deviceA = uuid();
    const deviceB = uuid();
    const a = await asUser(u, (db) => push(db, [upsert('strength_set', set, { reps: 6 }, 1, deviceA)], deviceA));
    expect(a[0]).toMatchObject({ status: 'applied', revision: 2 });
    // B editó offline partiendo de la revisión 1.
    const b = await asUser(u, (db) => push(db, [upsert('strength_set', set, { reps: 3 }, 1, deviceB)], deviceB));
    expect(b[0]).toMatchObject({ status: 'conflict', serverRevision: 2, serverDeleted: false });
    if (b[0]?.status === 'conflict') expect(b[0].serverRecord?.reps).toBe(6);
    const { rows } = await pool.query('select reps, revision::int from athlete3.strength_sets where id = $1', [set]);
    expect(rows[0]).toEqual({ reps: 6, revision: 2 });
  });

  it('resolución keep_local: reenvío con la revisión del servidor como base', async () => {
    const u = await createUser();
    const { set } = await seedSession(u);
    await asUser(u, (db) => push(db, [upsert('strength_set', set, { reps: 6 }, 1)]));
    const r = await asUser(u, (db) => push(db, [upsert('strength_set', set, { reps: 3 }, 2)]));
    expect(r[0]).toMatchObject({ status: 'applied', revision: 3 });
  });

  it('las escrituras directas también exigen la revisión actual (bloqueo optimista)', async () => {
    const u = await createUser();
    const { set } = await seedSession(u);
    const e = await pgError(asUser(u, (db) => db.query('update athlete3.strength_sets set reps = 9, revision = 0 where id = $1', [set])));
    expect(e.message).toBe('ATHLETE:CONFLICT');
    const ok = await asUser(u, (db) => db.query('update athlete3.strength_sets set reps = 9 where id = $1 returning revision::int', [set]));
    expect(ok.rows[0].revision).toBe(2);
  });

  it('el cliente no puede fijar la revisión al crear', async () => {
    const u = await createUser();
    const id = uuid();
    await asUser(u, (db) => db.query(
      `insert into athlete3.body_weights (id, measured_at, time_zone, local_date, weight_kg, input_unit, revision) values ($1, '2026-11-03T10:00:00Z', 'UTC', '2026-11-03', 80, 'kg', 999)`, [id]));
    const { rows } = await pool.query('select revision::int from athlete3.body_weights where id = $1', [id]);
    expect(rows[0].revision).toBe(1);
  });
});

describe('borrado lógico (tombstones)', () => {
  it('delete marca deleted_at y propaga a los hijos', async () => {
    const u = await createUser();
    const ids = await seedSession(u);
    const [r] = await asUser(u, (db) => push(db, [del('workout_session', ids.session, 1)]));
    expect(r).toMatchObject({ status: 'applied', revision: 2 });
    const { rows } = await pool.query(`
      select (select deleted_at is not null from athlete3.workout_sessions where id = $1) s,
             (select deleted_at is not null from athlete3.session_exercises where id = $2) e,
             (select deleted_at is not null from athlete3.strength_sets where id = $3) t`, [ids.session, ids.sessionExercise, ids.set]);
    expect(rows[0]).toEqual({ s: true, e: true, t: true });
  });

  it('un registro eliminado no reaparece: upsert posterior → conflicto con serverDeleted', async () => {
    const u = await createUser();
    const ids = await seedSession(u);
    await asUser(u, (db) => push(db, [del('strength_set', ids.set, 1)]));
    const [r] = await asUser(u, (db) => push(db, [upsert('strength_set', ids.set, { reps: 10 }, 1)]));
    expect(r).toMatchObject({ status: 'conflict', serverDeleted: true, serverRecord: null });
    const e = await pgError(asUser(u, (db) => db.query('update athlete3.strength_sets set deleted_at = null where id = $1', [ids.set])));
    expect(e.message).toBe('ATHLETE:INVALID_STATE');
  });

  it('borrar dos veces es idempotente', async () => {
    const u = await createUser();
    const ids = await seedSession(u);
    const a = await asUser(u, (db) => push(db, [del('strength_set', ids.set, 1)]));
    const b = await asUser(u, (db) => push(db, [del('strength_set', ids.set, 1)]));
    expect(a[0]).toMatchObject({ status: 'applied', revision: 2 });
    expect(b[0]).toMatchObject({ status: 'applied', revision: 2 });
  });

  it('borrar con revisión antigua produce conflicto', async () => {
    const u = await createUser();
    const ids = await seedSession(u);
    await asUser(u, (db) => push(db, [upsert('strength_set', ids.set, { reps: 7 }, 1)]));
    const [r] = await asUser(u, (db) => push(db, [del('strength_set', ids.set, 1)]));
    expect(r).toMatchObject({ status: 'conflict', serverRevision: 2 });
  });
});

describe('pull incremental', () => {
  it('pagina por cursor sin repetir ni perder cambios, e incluye tombstones', async () => {
    const u = await createUser();
    const ids = await seedSession(u);
    const seen: string[] = [];
    let cursor: string | null = null;
    for (let i = 0; i < 10; i++) {
      const page = await asUser(u, (db) => pull(db, cursor, 2));
      seen.push(...page.changes.map((c) => `${c.entity}:${c.entityId}:${c.revision}`));
      cursor = page.nextCursor;
      if (!page.hasMore) break;
    }
    expect(seen).toHaveLength(3);
    expect(new Set(seen).size).toBe(3);

    await asUser(u, (db) => push(db, [del('strength_set', ids.set, 1)]));
    const after = await asUser(u, (db) => pull(db, cursor));
    expect(after.changes).toEqual([
      expect.objectContaining({ entity: 'strength_set', entityId: ids.set, revision: 2, deleted: true, record: null }),
    ]);
    const empty = await asUser(u, (db) => pull(db, after.nextCursor));
    expect(empty).toMatchObject({ changes: [], hasMore: false, nextCursor: after.nextCursor });
  });

  it('identifica la mutación origen para reconocer ecos', async () => {
    const u = await createUser();
    const m = upsert('body_weight', uuid(), { measured_at: '2026-11-03T10:00:00Z', time_zone: 'UTC', local_date: '2026-11-03', weight_kg: 80, input_unit: 'kg' });
    await asUser(u, (db) => push(db, [m]));
    const page = await asUser(u, (db) => pull(db));
    expect(page.changes.find((c) => c.entityId === m.entityId)?.lastMutationId).toBe(m.mutationId);
  });

  it('valida cursor y límite', async () => {
    const u = await createUser();
    for (const [cursor, limit] of [['abc', 10], ['-1', 10], [null, 0], [null, 501]] as const) {
      const e = await pgError(asUser(u, (db) => pull(db, cursor, limit)));
      expect(e.message).toBe('ATHLETE:VALIDATION_FAILED');
    }
  });
});

describe('reglas de negocio de sesión', () => {
  it('solo una sesión en curso por usuario', async () => {
    const u = await createUser();
    await seedSession(u);
    const [r] = await asUser(u, (db) => push(db, [upsert('workout_session', uuid(), sessionPayload())]));
    expect(r).toMatchObject({ status: 'rejected', error: { code: 'INVALID_STATE' } });
  });

  it('transiciones permitidas y prohibidas', async () => {
    const u = await createUser();
    const { session } = await seedSession(u);
    const done = await asUser(u, (db) => push(db, [upsert('workout_session', session, { status: 'completed', ended_at: '2026-11-04T05:45:00Z' }, 1)]));
    expect(done[0]).toMatchObject({ status: 'applied', revision: 2 });
    const back = await asUser(u, (db) => push(db, [upsert('workout_session', session, { status: 'in_progress' }, 2)]));
    expect(back[0]).toMatchObject({ status: 'rejected', error: { code: 'INVALID_STATE' } });
    // Una sesión completada sigue siendo editable (especificación §6.4).
    const edit = await asUser(u, (db) => push(db, [upsert('workout_session', session, { notes: 'Buena sesión' }, 2)]));
    expect(edit[0]).toMatchObject({ status: 'applied', revision: 3 });
  });

  it('no se puede añadir contenido a una sesión descartada', async () => {
    const u = await createUser();
    const ids = await seedSession(u);
    await asUser(u, (db) => push(db, [upsert('workout_session', ids.session, { status: 'discarded' }, 1)]));
    const [r] = await asUser(u, (db) => push(db, [upsert('strength_set', uuid(), { session_exercise_id: ids.sessionExercise, position: 1 })]));
    expect(r).toMatchObject({ status: 'rejected', error: { code: 'INVALID_STATE' } });
  });
});

describe('historial', () => {
  it('consulta cronológica solo de sesiones propias, por fecha local', async () => {
    const u = await createUser();
    const other = await createUser();
    await seedSession(other);
    const dates = ['2026-10-01', '2026-10-15', '2026-11-01'];
    await asUser(u, (db) => push(db, dates.map((d) => upsert('workout_session', uuid(), {
      status: 'completed', started_at: `${d}T12:00:00Z`, ended_at: `${d}T13:00:00Z`, time_zone: 'UTC', local_date: d, source: 'manual' }))));
    const { rows } = await asUser(u, (db) => db.query(
      "select local_date::text from athlete3.workout_sessions where deleted_at is null and status = 'completed' order by local_date desc"));
    expect(rows.map((r) => r.local_date)).toEqual([...dates].reverse());
  });
});

describe('límite de frecuencia', () => {
  it('sync_pull se limita a 240 llamadas por minuto por usuario', async () => {
    const u = await createUser();
    const e = await pgError(asUser(u, async (db) => {
      for (let i = 0; i < 241; i++) await pull(db, null, 1);
    }));
    expect(e.message).toBe('ATHLETE:RATE_LIMITED');
  });

  it('sync_push se limita a 120 llamadas por minuto, por usuario', async () => {
    const u = await createUser();
    const other = await createUser();
    for (let i = 0; i < 120; i++) {
      await asUser(u, (db) => push(db, [upsert('workout_session', uuid(), sessionPayload({ status: 'discarded' }))]));
    }
    const limited = await pgError(asUser(u, (db) => push(db, [upsert('workout_session', uuid(), sessionPayload({ status: 'discarded' }))])));
    expect(limited.message).toBe('ATHLETE:RATE_LIMITED');
    // Otro usuario no se ve afectado.
    const ok = await asUser(other, (db) => push(db, [upsert('workout_session', uuid(), sessionPayload({ status: 'discarded' }))]));
    expect(ok[0]?.status).toBe('applied');
  });
});
