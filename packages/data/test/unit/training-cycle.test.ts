/**
 * Ciclo funcional completo de entrenamiento (MVP), solo SQLite local:
 *   rutina (plan → día → ejercicios con series/reps/descanso objetivo) → iniciar sesión desde el día →
 *   registrar series (peso, reps, RIR) → finalizar → historial → cerrar y reabrir la app.
 * Más las reglas que evitan escribir localmente datos que el servidor rechazaría (outbox `rejected` para siempre).
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { join } from 'node:path';
import type { Result } from '@athlete/contracts';
import { FakeTransport, SQUAT, TestClock, expectOk, newId, openDevice, tempDir } from '../support';
import { openNodeSqlite } from '../../src/sql/node-sqlite';

const USER = '6f1c2d3e-4b5a-4c6d-8e7f-9a0b1c2d3e4f';
const TZ = 'America/Mexico_City';
let tmp: ReturnType<typeof tempDir>;
let path: string;
let transport: FakeTransport;
let clock: TestClock;

beforeEach(() => {
  tmp = tempDir();
  path = join(tmp.dir, 'device.db');
  transport = new FakeTransport();
  clock = new TestClock();
});
afterEach(() => tmp.cleanup());

type Device = Awaited<ReturnType<typeof openDevice>>;

async function device(): Promise<Device> {
  const d = await openDevice(path, USER, transport, clock);
  expectOk(await d.sync.syncNow()); // descarga el catálogo (SQUAT)
  transport.online = false;          // el resto del ciclo ocurre sin red
  return d;
}

function codeOf<T>(r: Result<T>): string | null {
  return r.ok ? null : r.error.code;
}

async function customExercise(d: Device, name: string): Promise<string> {
  const id = newId();
  expectOk(await d.exercises.createCustom({
    id, name, modality: 'strength', loadType: 'external', primaryMuscleGroupIds: [], secondaryMuscleGroupIds: [], equipmentIds: [],
  }));
  return id;
}

/** Rutina "Pierna A": sentadilla 3×5 (descanso 180 s, RIR objetivo 2) y un ejercicio propio 3×10–12 (90 s). */
async function legRoutine(d: Device) {
  const planId = newId();
  const dayId = newId();
  const lunge = await customExercise(d, 'Zancada búlgara');
  expectOk(await d.plans.createPlan({ id: planId, name: 'Rutina', description: null, status: 'active', startsOn: null, endsOn: null }));
  expectOk(await d.plans.addDay({ id: dayId, planId, position: 0, name: 'Pierna A', kind: 'training', notes: null }));
  const base = { targetWeightKg: null, targetDurationSeconds: null, targetDistanceMeters: null, notes: null };
  const squatPlan = expectOk(await d.plans.addDayExercise({
    ...base, id: newId(), trainingDayId: dayId, exerciseId: SQUAT, position: 0,
    targetSets: 3, targetRepsMin: 5, targetRepsMax: 5, targetRir: 2, targetRestSeconds: 180,
  }));
  const lungePlan = expectOk(await d.plans.addDayExercise({
    ...base, id: newId(), trainingDayId: dayId, exerciseId: lunge, position: 1,
    targetSets: 3, targetRepsMin: 10, targetRepsMax: 12, targetRir: 1.5, targetRestSeconds: 90,
  }));
  return { planId, dayId, lunge, squatPlan, lungePlan };
}

describe('ciclo completo de entrenamiento', () => {
  it('rutina → sesión desde el día → series con RIR → finalizar → historial → reabrir sin pérdidas', async () => {
    let d = await device();
    const r = await legRoutine(d);

    // 1–3) La rutina conserva series, repeticiones objetivo y descansos.
    const plan = expectOk(await d.plans.getPlan(r.planId));
    expect(plan.days[0]?.exercises.map((e) => [e.targetSets, e.targetRepsMin, e.targetRepsMax, e.targetRestSeconds, e.targetRir]))
      .toEqual([[3, 5, 5, 180, 2], [3, 10, 12, 90, 1.5]]);

    // 4) Iniciar la sesión desde el día planificado: ejercicios en el orden del plan y enlazados a su objetivo.
    const sessionId = newId();
    const started = expectOk(await d.sessions.startFromTrainingDay({
      id: sessionId, trainingDayId: r.dayId, startedAt: '2026-11-03T22:30:00-06:00', timeZone: TZ,
    }));
    expect(started.status).toBe('in_progress');
    expect(started.trainingDayId).toBe(r.dayId);
    expect(started.localDate).toBe('2026-11-03');
    expect(started.exercises.map((e) => [e.exerciseId, e.trainingDayExerciseId, e.position]))
      .toEqual([[SQUAT, r.squatPlan.id, 0], [r.lunge, r.lungePlan.id, 1]]);
    expect(started.exercises.every((e) => e.sets.length === 0)).toBe(true); // planificado ≠ ejecutado

    // 5–6) Registrar series realizadas con peso, repeticiones y RIR (incluidos 0, medio paso y "sin registrar").
    const [squat, lunge] = started.exercises;
    const logged = [
      { sessionExerciseId: squat!.id, setType: 'warmup' as const, weightKg: 60, reps: 8, rir: null },
      { sessionExerciseId: squat!.id, weightKg: 100, reps: 5, rir: 2 },
      { sessionExerciseId: squat!.id, weightKg: 100, reps: 5, rir: 0.5 },
      { sessionExerciseId: squat!.id, weightKg: 100, reps: 4, rir: 0 },
      { sessionExerciseId: lunge!.id, weightKg: 20, reps: 12, rir: 10 },
    ];
    for (const s of logged) {
      clock.advance(120_000);
      expectOk(await d.sessions.logSet({ id: newId(), ...s, completedAt: clock.now() }));
    }
    const before = expectOk(await d.sessions.getDetail(sessionId));
    expect(before.exercises.map((e) => e.sets.map((s) => s.rir))).toEqual([[null, 2, 0.5, 0], [10]]);
    expect(before.exercises[0]?.sets.map((s) => s.position)).toEqual([0, 1, 2, 3]);

    // 7) Finalizar: no elimina ni altera ninguna serie ni ejercicio (ni siquiera updatedAt/revisión).
    clock.advance(600_000);
    const contentBefore = await contentSnapshot();
    const completed = expectOk(await d.sessions.complete({ sessionId, endedAt: clock.now() }));
    expect(completed.status).toBe('completed');
    const after = expectOk(await d.sessions.getDetail(sessionId));
    expect(after.exercises).toEqual(before.exercises);
    expect(await contentSnapshot()).toEqual(contentBefore); // filas y mutaciones de ejercicios/series intactas

    // 8) Historial.
    const history = expectOk(await d.sessions.listHistory({}));
    expect(history.items).toEqual([expect.objectContaining({
      sessionId, status: 'completed', localDate: '2026-11-03', exerciseCount: 2, workingSetCount: 4, volumeKg: 100 * 5 + 100 * 5 + 100 * 4 + 20 * 12,
    })]);

    // Cerrar y abrir la app: todo se recupera idéntico, incluido el RIR y la outbox pendiente.
    await d.close();
    d = await openDevice(path, USER, transport, clock);
    expect(expectOk(await d.sessions.getActive())).toBeNull();
    expect(expectOk(await d.sessions.getDetail(sessionId))).toEqual(after);
    expect(expectOk(await d.sessions.listHistory({})).items).toEqual(history.items);
    expect(expectOk(await d.sessions.listSetsForExercise(SQUAT)).map((s) => [s.reps, s.rir])).toEqual([[8, null], [5, 2], [5, 0.5], [4, 0]]);
    expect(expectOk(await d.plans.getPlan(r.planId))).toEqual(plan);
    expect((await d.sync.status()).pendingCount).toBeGreaterThan(0);
    await d.close();
  });

  it('la sesión en curso iniciada desde un día sobrevive a un cierre inesperado', async () => {
    let d = await device();
    const r = await legRoutine(d);
    const sessionId = newId();
    const s = expectOk(await d.sessions.startFromTrainingDay({ id: sessionId, trainingDayId: r.dayId, startedAt: clock.now(), timeZone: 'UTC' }));
    expectOk(await d.sessions.logSet({ id: newId(), sessionExerciseId: s.exercises[0]!.id, weightKg: 100, reps: 5, rir: 0, completedAt: clock.now() }));
    await d.close();
    d = await openDevice(path, USER, transport, clock);
    const active = expectOk(await d.sessions.getActive());
    expect(active?.id).toBe(sessionId);
    expect(active?.exercises.map((e) => e.trainingDayExerciseId)).toEqual([r.squatPlan.id, r.lungePlan.id]);
    expect(active?.exercises[0]?.sets.map((x) => [x.weightKg, x.reps, x.rir])).toEqual([[100, 5, 0]]);
    await d.close();
  });

  /** Filas crudas de ejercicios/series y sus mutaciones pendientes, leídas directamente del archivo SQLite. */
  async function contentSnapshot() {
    const raw = openNodeSqlite(path);
    const snapshot = {
      sessionExercises: await raw.all('SELECT * FROM session_exercises ORDER BY id'),
      sets: await raw.all('SELECT * FROM strength_sets ORDER BY id'),
      outbox: await raw.all("SELECT * FROM outbox WHERE entity IN ('session_exercise','strength_set') ORDER BY seq"),
    };
    await raw.close();
    return snapshot;
  }
});

describe('startFromTrainingDay', () => {
  it('es atómico: si un ejercicio planificado ya no existe, no crea sesión ni mutaciones', async () => {
    const d = await device();
    const r = await legRoutine(d);
    // Simula un ejercicio planificado cuyo ejercicio fue eliminado (tombstone llegado por sync).
    const raw = openNodeSqlite(path);
    await raw.run('UPDATE exercises SET deleted_at = ? WHERE id = ?', [clock.now(), r.lunge]);
    const outboxBefore = (await raw.get<{ n: number }>('SELECT COUNT(*) AS n FROM outbox'))?.n;
    await raw.close();

    const sessionId = newId();
    const res = await d.sessions.startFromTrainingDay({ id: sessionId, trainingDayId: r.dayId, startedAt: clock.now(), timeZone: 'UTC' });
    expect(codeOf(res)).toBe('NOT_FOUND');
    expect(codeOf(await d.sessions.getDetail(sessionId))).toBe('NOT_FOUND');
    expect(expectOk(await d.sessions.getActive())).toBeNull();
    const check = openNodeSqlite(path);
    expect((await check.get<{ n: number }>('SELECT COUNT(*) AS n FROM outbox'))?.n).toBe(outboxBefore);
    expect((await check.get<{ n: number }>('SELECT COUNT(*) AS n FROM session_exercises'))?.n).toBe(0);
    await check.close();
    await d.close();
  });

  it('respeta las reglas de inicio: una sesión en curso, día existente, fecha válida', async () => {
    const d = await device();
    const r = await legRoutine(d);
    expect(codeOf(await d.sessions.startFromTrainingDay({ id: newId(), trainingDayId: newId(), startedAt: clock.now(), timeZone: 'UTC' }))).toBe('NOT_FOUND');
    const first = expectOk(await d.sessions.startFromTrainingDay({ id: newId(), trainingDayId: r.dayId, startedAt: clock.now(), timeZone: 'UTC' }));
    expect(codeOf(await d.sessions.startFromTrainingDay({ id: newId(), trainingDayId: r.dayId, startedAt: clock.now(), timeZone: 'UTC' }))).toBe('INVALID_STATE');
    expectOk(await d.sessions.discard({ sessionId: first.id }));
    expectOk(await d.plans.deleteDay(r.dayId));
    expect(codeOf(await d.sessions.startFromTrainingDay({ id: newId(), trainingDayId: r.dayId, startedAt: clock.now(), timeZone: 'UTC' }))).toBe('NOT_FOUND');
    await d.close();
  });

  it('exige trainingDayId y reutiliza la validación de StartSessionInput', async () => {
    const d = await device();
    // @ts-expect-error trainingDayId es obligatorio
    expect(codeOf(await d.sessions.startFromTrainingDay({ id: newId(), startedAt: clock.now(), timeZone: 'UTC' }))).toBe('VALIDATION_FAILED');
    const r = await legRoutine(d);
    expect(codeOf(await d.sessions.startFromTrainingDay({ id: newId(), trainingDayId: r.dayId, startedAt: clock.now(), timeZone: 'Mars/Olympus' }))).toBe('VALIDATION_FAILED');
    await d.close();
  });
});

describe('RIR: validación, persistencia y recuperación', () => {
  async function sessionExercise(d: Device) {
    const s = expectOk(await d.sessions.start({ id: newId(), startedAt: clock.now(), timeZone: 'UTC' }));
    return expectOk(await d.sessions.addExercise({ id: newId(), sessionId: s.id, exerciseId: SQUAT }));
  }

  it('acepta 0–10 en pasos de 0.5 y null; rechaza el resto con VALIDATION_FAILED sin escribir', async () => {
    const d = await device();
    const se = await sessionExercise(d);
    for (const rir of [0, 0.5, 1, 2, 4.5, 9.5, 10, null]) {
      const set = expectOk(await d.sessions.logSet({ id: newId(), sessionExerciseId: se.id, reps: 5, rir }));
      expect(set.rir).toBe(rir);
    }
    for (const rir of [-1, -0.5, 10.5, 11, 2.3, 0.25, Number.NaN, Number.POSITIVE_INFINITY, '2', true]) {
      const res = await d.sessions.logSet({ id: newId(), sessionExerciseId: se.id, reps: 5, rir: rir as number });
      expect([String(rir), codeOf(res)]).toEqual([String(rir), 'VALIDATION_FAILED']);
    }
    expect(expectOk(await d.sessions.getDetail(se.sessionId)).exercises[0]?.sets).toHaveLength(8);
    await d.close();
  });

  it('updateSet: 0 no se confunde con "sin valor", ausente no cambia y null borra', async () => {
    const d = await device();
    const se = await sessionExercise(d);
    const set = expectOk(await d.sessions.logSet({ id: newId(), sessionExerciseId: se.id, weightKg: 80, reps: 8, rir: 3 }));
    expect(expectOk(await d.sessions.updateSet({ setId: set.id, rir: 0 })).rir).toBe(0);
    expect(expectOk(await d.sessions.updateSet({ setId: set.id, reps: 7 })).rir).toBe(0);
    expect(codeOf(await d.sessions.updateSet({ setId: set.id, rir: 1.2 }))).toBe('VALIDATION_FAILED');
    expect(expectOk(await d.sessions.getDetail(se.sessionId)).exercises[0]?.sets[0]?.rir).toBe(0);
    expect(expectOk(await d.sessions.updateSet({ setId: set.id, rir: null })).rir).toBeNull();
    await d.close();
  });

  it('se guarda como número en la columna `rir` y viaja tal cual en la mutación de sync', async () => {
    const d = await device();
    const se = await sessionExercise(d);
    const set = expectOk(await d.sessions.logSet({ id: newId(), sessionExerciseId: se.id, reps: 5, rir: 0.5 }));
    const zero = expectOk(await d.sessions.logSet({ id: newId(), sessionExerciseId: se.id, reps: 5, rir: 0 }));
    await d.close();
    const raw = openNodeSqlite(path);
    expect(await raw.all('SELECT id, rir, typeof(rir) AS t FROM strength_sets ORDER BY position'))
      .toEqual([{ id: set.id, rir: 0.5, t: 'real' }, { id: zero.id, rir: 0, t: 'real' }]);
    const payloads = await raw.all<{ payload: string }>("SELECT payload FROM outbox WHERE entity = 'strength_set' ORDER BY seq");
    expect(payloads.map((p) => JSON.parse(p.payload).rir)).toEqual([0.5, 0]);
    await raw.close();
  });

  it('RIR objetivo de la rutina sigue la misma regla que el RIR registrado (pasos de 0.5)', async () => {
    const d = await device();
    const r = await legRoutine(d);
    const base = { id: newId(), trainingDayId: r.dayId, exerciseId: SQUAT, position: 2, targetSets: 1, targetRepsMin: null, targetRepsMax: null,
      targetWeightKg: null, targetRestSeconds: null, targetDurationSeconds: null, targetDistanceMeters: null, notes: null };
    expect(codeOf(await d.plans.addDayExercise({ ...base, targetRir: 1.3 }))).toBe('VALIDATION_FAILED');
    expect(codeOf(await d.plans.updateDayExercise(r.squatPlan.id, { targetRir: 2.25 }))).toBe('VALIDATION_FAILED');
    expect(expectOk(await d.plans.updateDayExercise(r.squatPlan.id, { targetRir: 0 })).targetRir).toBe(0);
    await d.close();
  });
});

describe('integridad: lo que el servidor rechazaría se rechaza antes de escribir', () => {
  it('start/addExercise validan referencias al plan (FK compuesta en el servidor)', async () => {
    const d = await device();
    expect(codeOf(await d.sessions.start({ id: newId(), startedAt: clock.now(), timeZone: 'UTC', trainingDayId: newId() }))).toBe('NOT_FOUND');
    const r = await legRoutine(d);
    const s = expectOk(await d.sessions.start({ id: newId(), startedAt: clock.now(), timeZone: 'UTC', trainingDayId: r.dayId }));
    expect(codeOf(await d.sessions.addExercise({ id: newId(), sessionId: s.id, exerciseId: SQUAT, trainingDayExerciseId: newId() }))).toBe('NOT_FOUND');
    expectOk(await d.sessions.addExercise({ id: newId(), sessionId: s.id, exerciseId: SQUAT, trainingDayExerciseId: r.squatPlan.id }));
    await d.close();
  });

  it('updateDayExercise no acepta un ejercicio inexistente', async () => {
    const d = await device();
    const r = await legRoutine(d);
    expect(codeOf(await d.plans.updateDayExercise(r.squatPlan.id, { exerciseId: newId() }))).toBe('NOT_FOUND');
    expect(expectOk(await d.plans.getPlan(r.planId)).days[0]?.exercises[0]?.exerciseId).toBe(SQUAT);
    await d.close();
  });

  it('posiciones fuera de 0–1000 → VALIDATION_FAILED', async () => {
    const d = await device();
    const r = await legRoutine(d);
    const s = expectOk(await d.sessions.start({ id: newId(), startedAt: clock.now(), timeZone: 'UTC' }));
    expect(codeOf(await d.sessions.addExercise({ id: newId(), sessionId: s.id, exerciseId: SQUAT, position: 1001 }))).toBe('VALIDATION_FAILED');
    const se = expectOk(await d.sessions.addExercise({ id: newId(), sessionId: s.id, exerciseId: SQUAT, position: 1000 }));
    expect(codeOf(await d.sessions.logSet({ id: newId(), sessionExerciseId: se.id, position: 1001 }))).toBe('VALIDATION_FAILED');
    expect(codeOf(await d.plans.addDay({ id: newId(), planId: r.planId, position: 1001, name: 'X', kind: 'training', notes: null }))).toBe('VALIDATION_FAILED');
    expect(codeOf(await d.plans.updateDayExercise(r.squatPlan.id, { position: 5000 }))).toBe('VALIDATION_FAILED');
    await d.close();
  });

  it('inicio de sesión fuera de rango (antes de 2000 o más de 2 días en el futuro) → VALIDATION_FAILED', async () => {
    const d = await device();
    const future = new Date(Date.parse(clock.now()) + 3 * 86_400_000).toISOString();
    expect(codeOf(await d.sessions.start({ id: newId(), startedAt: future, timeZone: 'UTC' }))).toBe('VALIDATION_FAILED');
    expect(codeOf(await d.sessions.start({ id: newId(), startedAt: '1999-12-31T00:00:00Z', timeZone: 'UTC' }))).toBe('VALIDATION_FAILED');
    const s = expectOk(await d.sessions.start({ id: newId(), startedAt: clock.now(), timeZone: 'UTC' }));
    expect(codeOf(await d.sessions.update({ sessionId: s.id, startedAt: future }))).toBe('VALIDATION_FAILED');
    await d.close();
  });

  it('peso y distancia se guardan con la precisión del servidor (2 decimales), igual que se leerán tras sincronizar', async () => {
    const d = await device();
    const r = await legRoutine(d);
    const s = expectOk(await d.sessions.start({ id: newId(), startedAt: clock.now(), timeZone: 'UTC' }));
    const se = expectOk(await d.sessions.addExercise({ id: newId(), sessionId: s.id, exerciseId: SQUAT }));
    const lb225 = 225 * 0.45359237; // 102.05828325 kg
    const set = expectOk(await d.sessions.logSet({ id: newId(), sessionExerciseId: se.id, weightKg: lb225, reps: 5, distanceMeters: 12.345 }));
    expect([set.weightKg, set.distanceMeters]).toEqual([102.06, 12.35]);
    expect(expectOk(await d.sessions.updateSet({ setId: set.id, weightKg: 1.005 })).weightKg).toBe(1.01);
    expect(expectOk(await d.plans.updateDayExercise(r.squatPlan.id, { targetWeightKg: lb225 })).targetWeightKg).toBe(102.06);
    await d.close();
  });
});
