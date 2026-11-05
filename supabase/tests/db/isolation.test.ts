import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SQUAT, asUser, createUser, del, pgError, pool, pull, push, seedSession, sessionPayload, upsert, uuid } from './helpers';

afterAll(() => pool.end());

let alice: string;
let bob: string;
let aliceIds: Awaited<ReturnType<typeof seedSession>>;
const aliceExercise = uuid();

beforeAll(async () => {
  alice = await createUser();
  bob = await createUser();
  aliceIds = await seedSession(alice);
  const r = await asUser(alice, (db) =>
    push(db, [upsert('exercise', aliceExercise, { name: 'Mi ejercicio', modality: 'strength', load_type: 'external' })]),
  );
  expect(r[0]?.status).toBe('applied');
});

describe('aislamiento entre usuarios: lectura', () => {
  it('Bob no ve sesiones, ejercicios de sesión ni series de Alice', async () => {
    await asUser(bob, async (db) => {
      for (const t of ['workout_sessions', 'session_exercises', 'strength_sets', 'profiles']) {
        const { rows } = await db.query(`select id from athlete3.${t}`);
        expect(rows, t).toEqual([]);
      }
    });
  });

  it('Bob no ve el ejercicio personalizado de Alice pero sí el catálogo global', async () => {
    await asUser(bob, async (db) => {
      const own = await db.query('select id from athlete3.exercises where id = $1', [aliceExercise]);
      expect(own.rows).toEqual([]);
      const global = await db.query('select count(*)::int as n from athlete3.exercises where user_id is null');
      expect(global.rows[0].n).toBeGreaterThan(0);
    });
  });

  it('el pull de Bob no contiene nada de Alice', async () => {
    const res = await asUser(bob, (db) => pull(db));
    expect(res.changes.filter((c) => c.record && c.record.user_id === alice)).toEqual([]);
    expect(res.changes.map((c) => c.entityId)).not.toContain(aliceIds.session);
  });
});

describe('aislamiento entre usuarios: escritura directa (como PostgREST)', () => {
  it('UPDATE sobre filas ajenas no afecta ninguna fila', async () => {
    const r = await asUser(bob, (db) => db.query("update athlete3.workout_sessions set notes = 'hack', revision = revision where id = $1", [aliceIds.session]));
    expect(r.rowCount).toBe(0);
    const { rows } = await pool.query('select notes from athlete3.workout_sessions where id = $1', [aliceIds.session]);
    expect(rows[0].notes).toBeNull();
  });

  it('DELETE físico está prohibido incluso sobre filas propias', async () => {
    const e = await pgError(asUser(alice, (db) => db.query('delete from athlete3.strength_sets where id = $1', [aliceIds.set])));
    expect(e.code).toBe('42501');
  });

  it('INSERT con user_id de otro usuario es rechazado (no se confía en el cliente)', async () => {
    const e = await pgError(asUser(bob, (db) => db.query(
      `insert into athlete3.workout_sessions (id, user_id, started_at, time_zone, local_date) values ($1, $2, '2026-11-03T10:00:00Z', 'UTC', '2026-11-03')`,
      [uuid(), alice])));
    expect(e.code).toBe('42501');
    expect(e.message).toBe('ATHLETE:FORBIDDEN');
  });

  it('INSERT sin user_id asigna la identidad autenticada', async () => {
    const id = uuid();
    await asUser(bob, (db) => db.query(
      `insert into athlete3.workout_sessions (id, started_at, time_zone, local_date, status, ended_at) values ($1, '2026-11-03T10:00:00Z', 'UTC', '2026-11-03', 'completed', '2026-11-03T11:00:00Z')`, [id]));
    const { rows } = await pool.query('select user_id, revision from athlete3.workout_sessions where id = $1', [id]);
    expect(rows[0]).toEqual({ user_id: bob, revision: '1' });
  });

  it('no se puede cambiar el propietario de una fila propia', async () => {
    const e = await pgError(asUser(alice, (db) => db.query('update athlete3.strength_sets set user_id = $1, revision = revision where id = $2', [bob, aliceIds.set])));
    expect(e.code).toBe('42501');
  });

  it('Bob no puede colgar un ejercicio de la sesión de Alice (FK compuesta por propietario)', async () => {
    const e = await pgError(asUser(bob, (db) => db.query(
      'insert into athlete3.session_exercises (id, session_id, exercise_id, position) values ($1, $2, $3, 0)',
      [uuid(), aliceIds.session, SQUAT])));
    expect(e.code).toBe('23503');
  });

  it('Bob no puede usar el ejercicio personalizado de Alice en su sesión', async () => {
    const session = uuid();
    const res = await asUser(bob, (db) => push(db, [
      upsert('workout_session', session, sessionPayload({ status: 'completed', ended_at: '2026-11-04T05:30:00Z' })),
      upsert('session_exercise', uuid(), { session_id: session, exercise_id: aliceExercise, position: 0 }),
    ]));
    expect(res[0]?.status).toBe('applied');
    expect(res[1]).toMatchObject({ status: 'rejected', error: { code: 'FORBIDDEN' } });
  });

  it('nadie puede modificar el catálogo global', async () => {
    const r = await asUser(bob, (db) => db.query("update athlete3.exercises set name = 'x', revision = revision where id = $1", [SQUAT]));
    expect(r.rowCount).toBe(0);
    const e = await pgError(asUser(bob, (db) => db.query("insert into athlete3.muscle_groups (id, slug, name) values ($1, 'x', 'x')", [uuid()])));
    expect(e.code).toBe('42501');
  });
});

describe('aislamiento entre usuarios: sync', () => {
  it('Bob no puede sobrescribir ni borrar registros de Alice conociendo su id', async () => {
    const res = await asUser(bob, (db) => push(db, [
      upsert('strength_set', aliceIds.set, { reps: 99 }, 1),
      upsert('strength_set', aliceIds.set, { session_exercise_id: aliceIds.sessionExercise, position: 9, reps: 99 }),
      del('workout_session', aliceIds.session, 1),
    ]));
    // Invisible para Bob: NOT_FOUND con base, DUPLICATE/FORBIDDEN al intentar crear con el mismo id.
    expect(res.map((r) => r.status)).toEqual(['rejected', 'rejected', 'rejected']);
    const { rows } = await pool.query('select reps, deleted_at from athlete3.strength_sets where id = $1', [aliceIds.set]);
    expect(rows[0]).toEqual({ reps: 5, deleted_at: null });
  });

  it('Bob no puede reutilizar un mutation_id de Alice para leer su resultado', async () => {
    const m = upsert('workout_session', uuid(), sessionPayload({ status: 'completed', ended_at: '2026-11-04T05:30:00Z' }));
    await asUser(alice, (db) => push(db, [m]));
    const res = await asUser(bob, (db) => push(db, [{ ...m, entityId: uuid() }]));
    expect(res[0]).toMatchObject({ status: 'rejected', error: { code: 'DUPLICATE' } });
  });
});

describe('roles administrativos', () => {
  it('un usuario no puede leer ni asignarse roles', async () => {
    const e1 = await pgError(asUser(bob, (db) => db.query('select * from athlete3_private.user_roles')));
    expect(e1.code).toBe('42501');
    const e2 = await pgError(asUser(bob, (db) => db.query("insert into athlete3_private.user_roles (user_id, role) values ($1, 'admin')", [bob])));
    expect(e2.code).toBe('42501');
    const e3 = await pgError(asUser(bob, (db) => db.query("update athlete3.profiles set role = 'admin'")));
    expect(e3.code).toBe('42703'); // el perfil no tiene columna de rol
  });

  it('current_user_is_admin solo refleja roles asignados por el servidor', async () => {
    expect((await asUser(bob, (db) => db.query('select athlete3.current_user_is_admin() as a'))).rows[0].a).toBe(false);
    await pool.query("insert into athlete3_private.user_roles (user_id, role) values ($1, 'admin')", [bob]);
    expect((await asUser(bob, (db) => db.query('select athlete3.current_user_is_admin() as a'))).rows[0].a).toBe(true);
    expect((await asUser(alice, (db) => db.query('select athlete3.current_user_is_admin() as a'))).rows[0].a).toBe(false);
  });

  it('las funciones privadas no aceptan apuntar a otro usuario', async () => {
    const e = await pgError(asUser(bob, (db) => db.query('select athlete3_private.secure_synced_table($1::regclass)', ['athlete3.profiles'])));
    expect(e.code).toBe('42501');
  });
});
