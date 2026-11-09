/**
 * Integración real (sin mocks de datos): adaptador móvil + @athlete/data sobre node:sqlite en un archivo temporal.
 * Protege invariantes de integridad que las pruebas con mocks no pueden detectar.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { BUNDLED_CATALOG, BUNDLED_CATALOG_VERSION, LocalStore, createAthleteData, createUuidV7Generator, localOnlyTransport, systemClock } from '@athlete/data';
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

async function setup(options: { catalog?: boolean } = {}) {
  const db = openNodeSqlite(join(dir, 'device.db'));
  if (options.catalog) await (await LocalStore.open(db, { userId: USER, ids, clock: systemClock })).applyBundledCatalog(BUNDLED_CATALOG, BUNDLED_CATALOG_VERSION);
  const data = await createAthleteData({ db, userId: USER, ids, transport: localOnlyTransport });
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
  const result = parseCardioForm({ ...EMPTY_FORM, ...patch }, { now, unitSystem: 'metric', timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC' }); // misma zona que el teléfono (así lo hace la app)
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

test('récords: la primera vez no es PR; superar el peso o el 1RM estimado sí, y Progreso muestra ambos', async () => {
  const { data, repository, sessionId: first } = await setup();
  const exerciseId = (await repository.getWorkout(first))!.exercises[0]!.exerciseId;
  const log = async (sessionId: string, weightKg: number, reps: number) => {
    const draft = (await repository.getWorkout(sessionId))!.exercises[0]!.sets.at(-1)!.id;
    await repository.saveSet(sessionId, draft, { weightKg, reps, rir: 1, isWarmup: false });
  };
  await log(first, 80, 5); // e1RM 93.3
  expect((await repository.getWorkout(first))!.exercises[0]!.newRecords).toEqual([]); // primera vez
  await repository.finishWorkout(first);

  const second = await repository.startWorkout();
  await repository.addExercise(second, exerciseId);
  await log(second, 75, 10); // menos peso, pero e1RM 100 → récord de 1RM estimado, no de peso
  let records = (await repository.getWorkout(second))!.exercises[0]!.newRecords!;
  expect(records.map((r) => r.kind)).toEqual(['best_e1rm']);
  expect(records[0]!.value).toBeCloseTo(100, 5);
  await log(second, 85, 3); // más peso → también PR de peso
  records = (await repository.getWorkout(second))!.exercises[0]!.newRecords!;
  expect(records.find((r) => r.kind === 'max_weight')).toMatchObject({ value: 85, reps: 3 });
  await repository.finishWorkout(second);

  const progress = await repository.getProgress();
  expect(progress.records[0]).toMatchObject({ exerciseId, weightKg: 85, reps: 3, e1rm: { weightKg: 75, reps: 10 } });
  expect(progress.records[0]!.e1rm!.valueKg).toBeCloseTo(100, 5);
  await data.close?.();
});

test('volumen por músculo: cuenta series efectivas de la semana con el catálogo real (principal 1, secundario 0.5)', async () => {
  const { data, repository, sessionId } = await setup({ catalog: true });
  const bench = (await repository.searchExercises('Press de banca')).find((e) => e.name === 'Press de banca')!;
  await repository.addExercise(sessionId, bench.id);
  const workout = (await repository.getWorkout(sessionId))!;
  const benchRow = workout.exercises.find((e) => e.exerciseId === bench.id)!;
  const first = benchRow.sets[benchRow.sets.length - 1]!.id;
  await repository.saveSet(sessionId, first, { weightKg: 60, reps: 10, rir: null, isWarmup: true });
  for (let i = 0; i < 3; i++) {
    const id = await repository.addSet(sessionId, benchRow.id);
    await repository.saveSet(sessionId, id, { weightKg: 80, reps: 6, rir: 2, isWarmup: false });
  }
  const volume = await repository.getWeeklyMuscleVolume(); // sesión en curso incluida
  const by = Object.fromEntries(volume.items.map((m) => [m.muscle, m]));
  expect(by.chest).toMatchObject({ name: 'Pecho', sets: 3, status: 'low', range: [10, 20] });
  expect(by.shoulders?.sets).toBe(1.5);
  expect(by.triceps?.sets).toBe(1.5);
  expect(by.quadriceps).toMatchObject({ sets: 0, status: 'low' });
  expect(volume).toMatchObject({ totalSets: 3, sessions: 1 });
  await repository.finishWorkout(sessionId);
  expect((await repository.getWeeklyMuscleVolume()).totalSets).toBe(3);
  await data.close?.();
});

test('modo híbrido: adoptar Hybrid Athlete 1.0 → entrenar el sábado por bloques → AMRAP, RPE, semana y carga', async () => {
  const { data, repository, sessionId } = await setup({ catalog: true });
  await repository.finishWorkout(sessionId); // la sesión libre del setup no estorba
  expect(await repository.listRoutines()).toHaveLength(0);

  const planId = await repository.adoptProgramTemplate('hybrid-athlete-1-0');
  const [program] = await repository.listPrograms();
  expect(program).toMatchObject({ id: planId, name: 'Hybrid Athlete 1.0', templateSlug: 'hybrid-athlete-1-0' });
  expect(program!.days.map((d) => d.weekday)).toEqual([1, 1, 2, 3, 3, 4, 5, 5, 6, 7]);
  expect(await repository.listRoutines()).toHaveLength(0); // el programa no aparece como rutina
  const saturday = program!.days.find((d) => d.weekday === 6)!;
  expect(saturday.blocks.map((b) => [b.name, b.format])).toEqual([['A · Activación', 'continuous'], ['B · Fuerza funcional', 'sets'], ['C · AMRAP 15 min', 'amrap'], ['D · Vuelta a la calma', 'continuous']]);
  expect(saturday.blocks[2]!.exercises.map((e) => e.exerciseName)).toEqual(['Wall ball', 'Burpees', 'Kettlebell swing', 'Subidas al cajón', 'Remo ergómetro']);
  expect(saturday.blocks[2]!.exercises[4]).toMatchObject({ modality: 'cardio', distanceMeters: 200 });

  const id = await repository.startProgramDay(saturday.id);
  expect(await repository.startProgramDay(saturday.id)).toBe(id); // retoma la misma
  const workout = (await repository.getWorkout(id))!;
  expect(workout.dayName).toBe('Hybrid Conditioning');
  expect(workout.blocks?.map((b) => b.format)).toEqual(['continuous', 'sets', 'amrap', 'continuous']);
  const row = workout.exercises.find((e) => e.exerciseName === 'Remo ergómetro' && e.targetDistanceMeters === 200)!;
  expect(row).toMatchObject({ blockId: workout.blocks![2]!.id, modality: 'cardio', loadType: 'time' });

  // Serie por tiempo/distancia y resultado del AMRAP
  await repository.saveSet(id, row.sets[0]!.id, { weightKg: null, reps: null, rir: null, isWarmup: false, durationSeconds: 52, distanceMeters: 200 });
  await repository.saveBlockResult(id, workout.blocks![2]!.id, { roundsCompleted: 5, extraReps: 14, durationSeconds: 900 });
  await repository.saveBlockResult(id, workout.blocks![2]!.id, { roundsCompleted: 6, extraReps: 0, durationSeconds: 900 }); // corrige
  const after = (await repository.getWorkout(id))!;
  expect(after.exercises.find((e) => e.id === row.id)!.sets[0]).toMatchObject({ durationSeconds: 52, distanceMeters: 200 });
  expect(after.blocks![2]!.result).toMatchObject({ roundsCompleted: 6, extraReps: 0 });

  await repository.finishWorkout(id, { sessionRpe: 8 });
  expect((await repository.getWorkout(id))!.sessionRpe).toBe(8);
  expect(await repository.programWeekStatus(planId)).toEqual({ [saturday.id]: { workoutId: id } });
  const load = await repository.getWeeklyLoad(4);
  expect(load.weeks).toHaveLength(4);
  expect(load.weeks[3]!.sessions).toBe(2); // la libre y la del programa (duran 0 min en la prueba: no suman carga)

  await repository.deleteProgram(planId);
  expect(await repository.listPrograms()).toEqual([]);
  await data.close?.();
});

test('editar programa: agregar sesión, mover y duplicar días, cambiar ejercicio, editar bloques y quitar', async () => {
  const { data, repository, sessionId } = await setup({ catalog: true });
  await repository.finishWorkout(sessionId);
  const planId = await repository.adoptProgramTemplate('hibrido-3-dias');
  const program = () => repository.listPrograms().then((p) => p[0]!);
  const p0 = await program();
  expect(p0.days.map((d) => [d.weekday, d.name])).toEqual([[1, 'Cuerpo completo A'], [3, 'Funcional + cardio'], [5, 'Cuerpo completo B']]);

  // Nueva sesión de natación el martes, con su bloque inicial
  const swimId = await repository.addProgramDay(planId, { name: 'Natación suave', weekday: 2, modality: 'swim' });
  let swim = (await program()).days.find((d) => d.id === swimId)!;
  expect(swim.blocks.map((b) => [b.name, b.format])).toEqual([['Principal', 'continuous']]);
  const swimEx = await repository.addProgramExercise(swimId, swim.blocks[0]!.id, (await repository.searchExercises('Natación (libre)', { modality: 'all' }))[0]!.id);
  await repository.updateProgramExercise(swimEx, { distanceMeters: 1200 });
  swim = (await program()).days.find((d) => d.id === swimId)!;
  expect(swim.blocks[0]!.exercises[0]).toMatchObject({ exerciseName: 'Natación (libre)', distanceMeters: 1200 });

  // Mover el día A al domingo y duplicarlo el sábado
  const dayA = p0.days[0]!;
  await repository.updateProgramDay(dayA.id, { weekday: 7, name: 'Fuerza A' });
  const copyId = await repository.duplicateProgramDay(dayA.id, 6);
  const p1 = await program();
  expect(p1.days.map((d) => [d.weekday, d.name])).toEqual([[2, 'Natación suave'], [3, 'Funcional + cardio'], [5, 'Cuerpo completo B'], [6, 'Fuerza A'], [7, 'Fuerza A']]);
  const copy = p1.days.find((d) => d.id === copyId)!;
  expect(copy.blocks[0]!.exercises.map((e) => e.exerciseName)).toEqual(p1.days.find((d) => d.id === dayA.id)!.blocks[0]!.exercises.map((e) => e.exerciseName));

  // Cambiar sentadilla por sentadilla frontal y ajustar series/reps en la copia (el original no cambia)
  const squat = copy.blocks[0]!.exercises.find((e) => e.exerciseName === 'Sentadilla trasera')!;
  const front = (await repository.searchExercises('Sentadilla frontal'))[0]!;
  expect(front.movementPattern).toBe('squat');
  await repository.updateProgramExercise(squat.id, { exerciseId: front.id, sets: 5, repsMin: 5, repsMax: 5, restSeconds: 180 });
  const p2 = await program();
  expect(p2.days.find((d) => d.id === copyId)!.blocks[0]!.exercises.find((e) => e.id === squat.id)).toMatchObject({ exerciseName: 'Sentadilla frontal', sets: 5, repsMin: 5, restSeconds: 180 });
  expect(p2.days.find((d) => d.id === dayA.id)!.blocks[0]!.exercises[0]!.exerciseName).toBe('Sentadilla trasera');

  // Convertir el circuito del miércoles en AMRAP 12 min; agregar y quitar un bloque
  const wed = p2.days.find((d) => d.weekday === 3)!;
  const circuit = wed.blocks.find((b) => b.format === 'rounds')!;
  await repository.updateProgramBlock(circuit.id, { format: 'amrap', timeCapSeconds: 720, rounds: null, name: 'AMRAP 12' });
  const finisher = await repository.addProgramBlock(wed.id, { name: 'Finisher', format: 'for_time', rounds: null, timeCapSeconds: null, restSeconds: null, targetRpe: 9, notes: null });
  await repository.addProgramExercise(wed.id, finisher, (await repository.searchExercises('Burpees'))[0]!.id);
  let wed2 = (await program()).days.find((d) => d.id === wed.id)!;
  expect(wed2.blocks.map((b) => [b.name, b.format])).toEqual([['A · Calentamiento', 'continuous'], ['AMRAP 12', 'amrap'], ['C · Zona 2', 'continuous'], ['Finisher', 'for_time']]);
  await repository.deleteProgramBlock(finisher);
  wed2 = (await program()).days.find((d) => d.id === wed.id)!;
  expect(wed2.blocks.map((b) => b.name)).not.toContain('Finisher');
  expect(wed2.blocks.flatMap((b) => b.exercises).map((e) => e.exerciseName)).not.toContain('Burpees');

  // Quitar un ejercicio y un día
  await repository.removeProgramExercise(squat.id);
  await repository.deleteProgramDay(swimId);
  const p3 = await program();
  expect(p3.days.some((d) => d.id === swimId)).toBe(false);
  expect(p3.days.find((d) => d.id === copyId)!.blocks[0]!.exercises.some((e) => e.id === squat.id)).toBe(false);
  await data.close?.();
});
