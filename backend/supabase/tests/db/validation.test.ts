import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SQUAT, asUser, createUser, pgError, pool, push, seedSession, sessionPayload, upsert, uuid, type Mutation } from './helpers';

afterAll(() => pool.end());

let user: string;
let ids: Awaited<ReturnType<typeof seedSession>>;
beforeAll(async () => {
  user = await createUser();
  ids = await seedSession(user);
});

const rejectedCode = async (m: Mutation) => {
  const [r] = await asUser(user, (db) => push(db, [m]));
  return r?.status === 'rejected' ? r.error.code : r?.status;
};

describe('validación en servidor (datos inválidos)', () => {
  const setPayload = (o: Record<string, unknown>) => ({ session_exercise_id: ids.sessionExercise, position: 1, ...o });

  it.each([
    ['RIR fuera de paso 0.5', { rir: 2.3 }],
    ['RIR > 10', { rir: 11 }],
    ['RPE < 1', { rpe: 0.5 }],
    ['repeticiones negativas', { reps: -1 }],
    ['peso > 1000 kg', { weight_kg: 1500 }],
    ['tipo de serie desconocido', { set_type: 'drop' }],
    ['tipo incorrecto', { reps: 'cinco' }],
  ])('serie: %s', async (_name, payload) => {
    expect(await rejectedCode(upsert('strength_set', uuid(), setPayload(payload)))).toBe('VALIDATION_FAILED');
  });

  it('sesión: fecha local que no corresponde a la zona horaria', async () => {
    // 22:30 en CDMX es 2026-11-03 local; 2026-11-04 sería el recorte UTC (incorrecto).
    expect(await rejectedCode(upsert('workout_session', uuid(), sessionPayload({ local_date: '2026-11-04', status: 'completed', ended_at: '2026-11-04T06:00:00Z' })))).toBe('VALIDATION_FAILED');
  });

  it.each([
    ['disciplina desconocida', ['strength', 'crossfit']],
    ['disciplina repetida', ['running', 'running']],
  ])('perfil (0.3.0): sports con %s', async (_name, sports) => {
    expect(await rejectedCode(upsert('profile', user, { time_zone: 'UTC', goals: [], sports }))).toBe('VALIDATION_FAILED');
  });

  it('perfil (0.3.0): sports válidas se aceptan (atleta híbrido)', async () => {
    expect(await rejectedCode(upsert('profile', user, { time_zone: 'UTC', goals: [], sports: ['strength', 'running', 'swimming'] }))).toBe('applied');
  });

  it('sesión: fin anterior al inicio y completada sin fin', async () => {
    expect(await rejectedCode(upsert('workout_session', uuid(), sessionPayload({ status: 'completed', ended_at: '2026-11-03T20:00:00-06:00' })))).toBe('VALIDATION_FAILED');
    expect(await rejectedCode(upsert('workout_session', uuid(), sessionPayload({ status: 'completed' })))).toBe('VALIDATION_FAILED');
  });

  it('sesión: zona horaria inexistente', async () => {
    expect(await rejectedCode(upsert('workout_session', uuid(), sessionPayload({ time_zone: 'Marte/Olympus', status: 'discarded' })))).toBe('VALIDATION_FAILED');
  });

  it('cardio: FC media > máxima, natación en carrera, distancia 0, duración 0', async () => {
    const base = { activity: 'run', started_at: '2026-11-03T07:00:00-06:00', time_zone: 'America/Mexico_City', local_date: '2026-11-03', duration_seconds: 1800 };
    expect(await rejectedCode(upsert('cardio_session', uuid(), { ...base, avg_heart_rate_bpm: 170, max_heart_rate_bpm: 160 }))).toBe('VALIDATION_FAILED');
    expect(await rejectedCode(upsert('cardio_session', uuid(), { ...base, swim_pool_type: 'pool' }))).toBe('VALIDATION_FAILED');
    expect(await rejectedCode(upsert('cardio_session', uuid(), { ...base, distance_m: 0 }))).toBe('VALIDATION_FAILED');
    expect(await rejectedCode(upsert('cardio_session', uuid(), { ...base, duration_seconds: 0 }))).toBe('VALIDATION_FAILED');
    expect(await rejectedCode(upsert('cardio_session', uuid(), { ...base, activity: 'swim', swim_laps: 40 }))).toBe('VALIDATION_FAILED');
    expect(await rejectedCode(upsert('cardio_session', uuid(), { ...base, activity: 'swim', swim_pool_type: 'pool', swim_pool_length_m: 25, swim_laps: 40, distance_m: 1000 }))).toBe('applied');
  });

  it('peso corporal fuera de rango y unidad desconocida', async () => {
    const base = { measured_at: '2026-11-03T07:00:00-06:00', time_zone: 'America/Mexico_City', local_date: '2026-11-03', input_unit: 'kg' };
    expect(await rejectedCode(upsert('body_weight', uuid(), { ...base, weight_kg: 5 }))).toBe('VALIDATION_FAILED');
    expect(await rejectedCode(upsert('body_weight', uuid(), { ...base, weight_kg: 80, input_unit: 'stone' }))).toBe('VALIDATION_FAILED');
    expect(await rejectedCode(upsert('body_weight', uuid(), { ...base, weight_kg: 80.55 }))).toBe('applied');
  });

  it('referencias inexistentes', async () => {
    expect(await rejectedCode(upsert('session_exercise', uuid(), { session_id: ids.session, exercise_id: uuid(), position: 1 }))).toBe('FORBIDDEN');
    expect(await rejectedCode(upsert('strength_set', uuid(), { session_exercise_id: uuid(), position: 0 }))).toBe('VALIDATION_FAILED');
    expect(await rejectedCode(upsert('exercise', uuid(), { name: 'X', modality: 'strength', load_type: 'external', primary_muscle_group_ids: [uuid()] }))).toBe('VALIDATION_FAILED');
  });

  it('campos gestionados por el servidor o desconocidos', async () => {
    for (const field of ['user_id', 'revision', 'deleted_at', 'change_seq', 'created_at', 'no_existe']) {
      expect(await rejectedCode(upsert('strength_set', uuid(), setPayload({ [field]: 1 })))).toBe('VALIDATION_FAILED');
    }
  });

  it('id del payload distinto de entityId', async () => {
    expect(await rejectedCode(upsert('strength_set', uuid(), setPayload({ id: uuid() })))).toBe('VALIDATION_FAILED');
  });

  it('entidad no soportada', async () => {
    expect(await rejectedCode(upsert('meal_entry', uuid(), { description: 'x' }))).toBe('VALIDATION_FAILED');
  });

  it('lotes mal formados se rechazan completos', async () => {
    const good = upsert('strength_set', uuid(), setPayload({}));
    const cases: unknown[] = [
      [],
      Array.from({ length: 101 }, () => good),
      [{ ...good, mutationId: 'no-uuid' }],
      [{ ...good, op: 'merge' }],
      [{ ...good, payload: null }],
      [{ ...good, deviceId: uuid() }],
      [{ ...good, payload: { notes: 'x'.repeat(40_000) } }],
      { not: 'an array' },
    ];
    for (const batch of cases) {
      const e = await pgError(asUser(user, (db) => db.query('select athlete3.sync_push($1, $2::jsonb)', [good.deviceId, JSON.stringify(batch)])));
      expect(e.message).toBe('ATHLETE:VALIDATION_FAILED');
    }
  });

  it('un rechazo no aborta el resto del lote', async () => {
    const okId = uuid();
    const res = await asUser(user, (db) => push(db, [
      upsert('strength_set', uuid(), setPayload({ rir: 99 })),
      upsert('strength_set', okId, setPayload({ reps: 8, weight_kg: 90 })),
    ]));
    expect(res.map((r) => r.status)).toEqual(['rejected', 'applied']);
  });

  it('los mensajes de error no filtran SQL ni detalles internos', async () => {
    const [r] = await asUser(user, (db) => push(db, [upsert('strength_set', uuid(), setPayload({ reps: 'x' }))]));
    expect(r?.status).toBe('rejected');
    const text = JSON.stringify(r);
    expect(text).not.toMatch(/syntax|integer|select|athlete3\.|pg_|line \d/i);
  });
});

describe('perfil', () => {
  it('ensure_profile es idempotente y valida la zona horaria', async () => {
    const u = await createUser();
    const a = await asUser(u, (db) => db.query("select * from athlete3.ensure_profile('Europe/Madrid')"));
    const b = await asUser(u, (db) => db.query("select * from athlete3.ensure_profile('America/Bogota')"));
    expect(a.rows[0].id).toBe(u);
    expect(b.rows[0].time_zone).toBe('Europe/Madrid'); // no sobrescribe
    const e = await pgError(asUser(await createUser(), (db) => db.query("select athlete3.ensure_profile('Nope/Nope')")));
    expect(e.code).toBe('23514');
  });

  it('actualización de perfil vía sync con control de revisión', async () => {
    const u = await createUser();
    await asUser(u, (db) => db.query("select athlete3.ensure_profile('UTC')"));
    const res = await asUser(u, (db) => push(db, [
      upsert('profile', u, { display_name: 'Ana', experience_level: 'intermediate', goals: ['Fuerza', 'Resistencia'], load_unit: 'lb' }, 1),
      upsert('profile', u, { display_name: 'Viejo' }, 1),
      upsert('profile', u, { goals: Array(11).fill('g') }, 2),
    ]));
    expect(res.map((r) => r.status)).toEqual(['applied', 'conflict', 'rejected']);
    const { rows } = await pool.query('select display_name, goals, load_unit from athlete3.profiles where id = $1', [u]);
    expect(rows[0]).toEqual({ display_name: 'Ana', goals: ['Fuerza', 'Resistencia'], load_unit: 'lb' });
  });

  it('no se puede crear el perfil de otro usuario', async () => {
    const u = await createUser();
    const other = await createUser();
    const [r] = await asUser(u, (db) => push(db, [upsert('profile', other, { time_zone: 'UTC' })]));
    expect(r?.status).toBe('rejected');
  });
});

describe('ejercicios personalizados', () => {
  it('crear, editar y archivar', async () => {
    const id = uuid();
    const res = await asUser(user, (db) => push(db, [
      upsert('exercise', id, { name: 'Hip thrust', modality: 'strength', load_type: 'external',
        primary_muscle_group_ids: ['10000000-0000-4000-8000-000000000010'], equipment_ids: ['20000000-0000-4000-8000-000000000001'] }),
    ]));
    expect(res[0]?.status).toBe('applied');
    const res2 = await asUser(user, (db) => push(db, [upsert('exercise', id, { archived_at: '2026-11-03T10:00:00Z' }, 1)]));
    expect(res2[0]).toMatchObject({ status: 'applied', revision: 2 });
  });

  it('no se puede crear un ejercicio con slug global', async () => {
    expect(await rejectedCode(upsert('exercise', uuid(), { name: 'X', slug: 'my-x', modality: 'strength', load_type: 'external' }))).toBe('VALIDATION_FAILED');
  });

  it('el ejercicio global se puede usar en sesiones', async () => {
    expect(await rejectedCode(upsert('session_exercise', uuid(), { session_id: ids.session, exercise_id: SQUAT, position: 5 }))).toBe('applied');
  });
});
