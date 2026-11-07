/**
 * Integración real (sin mocks de datos): adaptador móvil + @athlete/data sobre node:sqlite en un archivo temporal.
 * Protege invariantes de integridad que las pruebas con mocks no pueden detectar.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { createAthleteData, createUuidV7Generator, localOnlyTransport } from '@athlete/data';
import { openNodeSqlite } from '@athlete/data/node-sqlite';
import { EMPTY_FORM, parseCardioForm, type CardioFormValues } from '@/cardio/cardioForm';
import { mergeHistory } from './history';
import { OfficialTrainingRepository } from './OfficialTrainingRepository';

const USER = '6f1c2d3e-4b5a-4c6d-8e7f-9a0b1c2d3e4f';
const ids = createUuidV7Generator((n) => new Uint8Array(randomBytes(n)));
const newId = () => ids.newId();
let dir: string;

beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'athlete3-mobile-')); });
afterEach(() => rmSync(dir, { recursive: true, force: true }));

async function setup() {
  const data = await createAthleteData({ db: openNodeSqlite(join(dir, 'device.db')), userId: USER, ids, transport: localOnlyTransport });
  const profile = await data.profile.initialize('America/Mexico_City');
  if (!profile.ok) throw new Error(profile.error.message);
  const exerciseId = newId();
  const created = await data.exercises.createCustom({
    id: exerciseId, name: 'Sentadilla de prueba', modality: 'strength', loadType: 'external',
    primaryMuscleGroupIds: [], secondaryMuscleGroupIds: [], equipmentIds: [],
  });
  if (!created.ok) throw new Error(created.error.message);
  const repository = new OfficialTrainingRepository(data as never, newId);
  const sessionId = await repository.startWorkout();
  await repository.addExercise(sessionId, exerciseId);
  return { data, repository, sessionId };
}

async function persistedPositions(data: Awaited<ReturnType<typeof setup>>['data'], sessionId: string) {
  const detail = await data.sessions.getDetail(sessionId);
  if (!detail.ok) throw new Error(detail.error.message);
  return detail.value.exercises[0]!.sets.map((set) => set.position);
}

test('series guardadas desde dos borradores simultáneos reciben posiciones distintas y ordenadas', async () => {
  const { data, repository, sessionId } = await setup();
  const workout = (await repository.getWorkout(sessionId))!; // crea el borrador automático
  const exercise = workout.exercises[0]!;
  const automaticDraft = exercise.sets[exercise.sets.length - 1]!.id;
  const manualDraft = await repository.addSet(sessionId, exercise.id); // segundo borrador, mismo setIndex visual

  await repository.saveSet(sessionId, automaticDraft, { weightKg: 100, reps: 5, rir: 2, isWarmup: false });
  await repository.saveSet(sessionId, manualDraft, { weightKg: 100, reps: 5, rir: 1, isWarmup: false });

  expect(await persistedPositions(data, sessionId)).toEqual([0, 1]);
  await data.close?.();
});

test('una serie nueva tras borrar otra no reutiliza una posición ocupada', async () => {
  const { data, repository, sessionId } = await setup();
  for (const reps of [5, 5, 5]) {
    const workout = (await repository.getWorkout(sessionId))!;
    const draft = workout.exercises[0]!.sets.at(-1)!.id;
    await repository.saveSet(sessionId, draft, { weightKg: 80, reps, rir: 2, isWarmup: false });
  }
  const before = (await repository.getWorkout(sessionId))!.exercises[0]!.sets;
  const deleted = await data.sessions.deleteSet(before[0]!.id);
  if (!deleted.ok) throw new Error(deleted.error.message);

  const workout = (await repository.getWorkout(sessionId))!;
  await repository.saveSet(sessionId, workout.exercises[0]!.sets.at(-1)!.id, { weightKg: 80, reps: 4, rir: 1, isWarmup: false });

  const positions = await persistedPositions(data, sessionId);
  expect(new Set(positions).size).toBe(positions.length);
  await data.close?.();
});

function cardioDraft(patch: Partial<CardioFormValues>, now = new Date()) {
  const result = parseCardioForm({ ...EMPTY_FORM, ...patch }, { now, unitSystem: 'metric', timeZone: 'America/Mexico_City' });
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  return result.draft;
}

test('cardio de punta a punta: formulario → contrato → base local → lista, detalle y borrado', async () => {
  const { data, repository } = await setup();
  const runId = await repository.logCardio(cardioDraft({ activity: 'run', minutes: '30', distance: '5', rpe: 7 }));
  const swimId = await repository.logCardio(cardioDraft({ activity: 'swim', minutes: '20', laps: '40', poolLength: '25', stroke: 'freestyle' }));

  const list = await repository.listCardio();
  expect(list.map((c) => c.id).sort()).toEqual([runId, swimId].sort());
  expect(await repository.getCardio(runId)).toMatchObject({ activity: 'run', durationSeconds: 1800, distanceMeters: 5000, rpe: 7, syncStatus: 'pending' });
  expect((await repository.getCardio(swimId))?.swim).toEqual({ poolType: 'pool', poolLengthMeters: 25, laps: 40, stroke: 'freestyle' });

  await repository.tombstoneCardio(runId);
  expect(await repository.getCardio(runId)).toBeNull();
  expect((await repository.listCardio()).map((c) => c.id)).toEqual([swimId]);
  await data.close?.();
});

test('el resumen semanal y el historial unificado incluyen el cardio', async () => {
  const { data, repository, sessionId } = await setup();
  const workout = (await repository.getWorkout(sessionId))!;
  await repository.saveSet(sessionId, workout.exercises[0]!.sets.at(-1)!.id, { weightKg: 60, reps: 8, rir: 2, isWarmup: false });
  await repository.finishWorkout(sessionId);
  await repository.logCardio(cardioDraft({ activity: 'bike', minutes: '45', distance: '20' }));

  const overview = await repository.getOverview();
  expect(overview).toMatchObject({ strengthSessionsThisWeek: 1, cardioSessionsThisWeek: 1, sessionsThisWeek: 2 });
  expect(overview.activityMinutesThisWeek).toBeGreaterThanOrEqual(45);

  const history = mergeHistory(await repository.listHistory(), await repository.listCardio());
  expect(history.map((item) => item.kind).sort()).toEqual(['cardio', 'strength']);
  await data.close?.();
});

test('un registro que el contrato rechaza no se guarda (FC media > máxima pasada directo al adaptador)', async () => {
  const { data, repository } = await setup();
  const draft = { ...cardioDraft({ minutes: '10' }), avgHeartRateBpm: 180, maxHeartRateBpm: 150 };
  await expect(repository.logCardio(draft)).rejects.toThrow();
  expect(await repository.listCardio()).toEqual([]);
  await data.close?.();
});

test('entrenamiento de otro día: inicia en esa fecha, las series llevan esa hora y la duración fija el fin', async () => {
  const { data, repository, sessionId: active } = await setup();
  const exerciseId = (await data.sessions.getDetail(active)).ok ? (await repository.getWorkout(active))!.exercises[0]!.exerciseId : '';
  const threeDaysAgo = new Date(Date.now() - 3 * 86_400_000);
  threeDaysAgo.setHours(18, 30, 0, 0);
  const startedAt = threeDaysAgo.toISOString();

  // Con una sesión en curso no se registra otra de otro día (se avisa, no se abre la actual en silencio).
  await expect(repository.startWorkout(undefined, { startedAt })).rejects.toThrow('ACTIVE_WORKOUT_EXISTS');
  await repository.tombstoneWorkout(active);

  const past = await repository.startWorkout(undefined, { startedAt });
  await repository.addExercise(past, exerciseId);
  const draft = (await repository.getWorkout(past))!.exercises[0]!.sets.at(-1)!.id;
  await repository.saveSet(past, draft, { weightKg: 90, reps: 6, rir: 2, isWarmup: false });

  const detail = await data.sessions.getDetail(past);
  if (!detail.ok) throw new Error(detail.error.message);
  expect(detail.value.startedAt).toBe(startedAt);
  expect(detail.value.localDate).toBe(`${threeDaysAgo.getFullYear()}-${String(threeDaysAgo.getMonth() + 1).padStart(2, '0')}-${String(threeDaysAgo.getDate()).padStart(2, '0')}`);
  expect(detail.value.exercises[0]!.sets[0]!.completedAt).toBe(startedAt); // no "hoy"

  await expect(repository.finishWorkout(past)).rejects.toThrow('WORKOUT_DURATION_REQUIRED');
  await repository.finishWorkout(past, { durationMinutes: 75 });
  const done = await data.sessions.getDetail(past);
  if (!done.ok) throw new Error(done.error.message);
  expect(done.value.status).toBe('completed');
  expect(Date.parse(done.value.endedAt!) - Date.parse(startedAt)).toBe(75 * 60_000);
  const workout = (await repository.getWorkout(past))!.workout;
  expect(workout.durationMinutes).toBe(75);
  await data.close?.();
});

test('un entrenamiento de hoy sigue igual: empieza y termina ahora sin pedir duración', async () => {
  const { data, repository, sessionId } = await setup();
  const draft = (await repository.getWorkout(sessionId))!.exercises[0]!.sets.at(-1)!.id;
  await repository.saveSet(sessionId, draft, { weightKg: 100, reps: 5, rir: 1, isWarmup: false });
  await repository.finishWorkout(sessionId);
  const done = await data.sessions.getDetail(sessionId);
  expect(done.ok && done.value.status).toBe('completed');
  expect(done.ok && Math.abs(Date.parse(done.value.endedAt!) - Date.now())).toBeLessThan(60_000);
  await data.close?.();
});
