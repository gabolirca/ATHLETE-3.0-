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
