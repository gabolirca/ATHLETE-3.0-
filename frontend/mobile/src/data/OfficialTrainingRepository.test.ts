import { OfficialTrainingRepository } from './OfficialTrainingRepository';

const ok = <T,>(value: T) => ({ ok: true as const, value });

function services() {
  const exercise = {
    id: '00000000-0000-7000-8000-000000000010', ownerUserId: null, slug: 'squat', name: 'Sentadilla',
    modality: 'strength', loadType: 'external', primaryMuscleGroupIds: [], secondaryMuscleGroupIds: [], equipmentIds: [],
    instructions: null, archivedAt: null, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', revision: null,
  };
  const detail = {
    id: '00000000-0000-7000-8000-000000000020', userId: '00000000-0000-7000-8000-000000000001',
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', deletedAt: null, revision: null,
    status: 'in_progress', trainingDayId: null, title: null, startedAt: '2026-01-01T00:00:00.000Z', endedAt: null,
    timeZone: 'UTC', localDate: '2026-01-01', source: 'manual', notes: null,
    exercises: [{
      id: '00000000-0000-7000-8000-000000000030', userId: '00000000-0000-7000-8000-000000000001',
      createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', deletedAt: null, revision: null,
      sessionId: '00000000-0000-7000-8000-000000000020', exerciseId: exercise.id, trainingDayExerciseId: null, position: 0, notes: null, sets: [],
    }],
  };
  const data = {
    exercises: { list: jest.fn().mockResolvedValue(ok([exercise])), listMuscleGroups: jest.fn().mockResolvedValue(ok([])), listEquipment: jest.fn().mockResolvedValue(ok([])), getById: jest.fn().mockResolvedValue(ok(exercise)) },
    plans: { listPlans: jest.fn().mockResolvedValue(ok([])), getPlan: jest.fn(), createPlan: jest.fn().mockResolvedValue(ok({})), addDay: jest.fn().mockResolvedValue(ok({})), addDayExercise: jest.fn().mockResolvedValue(ok({})), deletePlan: jest.fn().mockResolvedValue(ok(undefined)) },
    sessions: { getActive: jest.fn().mockResolvedValue(ok(null)), getDetail: jest.fn().mockResolvedValue(ok(detail)), start: jest.fn().mockResolvedValue(ok(detail)), startFromTrainingDay: jest.fn().mockResolvedValue(ok(detail)), addExercise: jest.fn(), logSet: jest.fn().mockResolvedValue(ok({})), updateSet: jest.fn(), complete: jest.fn(), delete: jest.fn(), listHistory: jest.fn().mockResolvedValue(ok({ items: [], nextCursor: null })), listSetsForExercise: jest.fn() },
    body: { listWeights: jest.fn().mockResolvedValue(ok([])), listMeasurements: jest.fn().mockResolvedValue(ok([])), logWeight: jest.fn(), logMeasurement: jest.fn(), deleteWeight: jest.fn(), deleteMeasurement: jest.fn() },
    profile: { get: jest.fn(), initialize: jest.fn(), update: jest.fn() }, sync: { status: jest.fn().mockResolvedValue({ pendingCount: 0 }) },
  };
  return { data: data as never, services: data, detail, exercise };
}

test('routes exercise search to the bundled official catalog', async () => {
  const fake = services();
  const repository = new OfficialTrainingRepository(fake.data, () => '00000000-0000-7000-8000-000000000099');
  const found = await repository.searchExercises('senta');
  expect(found).toHaveLength(1);
  expect(found[0]).toMatchObject({ id: fake.exercise.id, name: 'Sentadilla', muscleGroup: 'General', equipment: null, origin: 'sample', isCustom: false, muscles: [] });
  expect(fake.services.exercises.list).toHaveBeenCalledWith({ search: 'senta', modality: 'strength' });
});

test('creates routines through official plan, day and planned-exercise contracts, preserving targetRir', async () => {
  const fake = services();
  const repository = new OfficialTrainingRepository(fake.data, () => '00000000-0000-7000-8000-000000000099');
  await repository.createRoutine({ name: 'Fuerza A', exercises: [{ exerciseId: fake.exercise.id, sets: 3, reps: 8, restSeconds: 90, targetRir: 1.5 }] });
  expect(fake.services.plans.createPlan).toHaveBeenCalledWith(expect.objectContaining({ name: 'Fuerza A', status: 'active' }));
  expect(fake.services.plans.addDayExercise).toHaveBeenCalledWith(expect.objectContaining({ targetSets: 3, targetRepsMin: 8, targetRepsMax: 8, targetRestSeconds: 90, targetRir: 1.5 }));
});

test('starts planned training through the atomic startFromTrainingDay contract', async () => {
  const fake = services();
  fake.services.plans.getPlan.mockResolvedValue(ok({
    plan: { id: 'plan-1' }, days: [{ id: 'day-1', kind: 'training' }],
  }));
  const repository = new OfficialTrainingRepository(fake.data, () => '00000000-0000-7000-8000-000000000099');
  await expect(repository.startWorkout('plan-1')).resolves.toBe(fake.detail.id);
  expect(fake.services.sessions.startFromTrainingDay).toHaveBeenCalledWith(expect.objectContaining({ trainingDayId: 'day-1' }));
});

test('keeps all official sports available to the profile screen', async () => {
  const fake = services();
  fake.services.profile.get.mockResolvedValue(ok({ displayName: 'Atleta', unitSystem: 'metric', sports: ['strength', 'running'], timeZone: 'UTC' }));
  const repository = new OfficialTrainingRepository(fake.data, () => '00000000-0000-7000-8000-000000000099');
  await expect(repository.getPreferences()).resolves.toEqual(expect.objectContaining({ sports: ['strength', 'running'] }));
});

test('keeps a new set as an in-memory draft until the official logSet call', async () => {
  const fake = services();
  const repository = new OfficialTrainingRepository(fake.data, () => '00000000-0000-7000-8000-000000000099');
  const draftId = await repository.addSet(fake.detail.id, fake.detail.exercises[0].id);
  expect(fake.services.sessions.logSet).not.toHaveBeenCalled();
  await repository.saveSet(fake.detail.id, draftId, { weightKg: 100, reps: 5, rir: 0.5, isWarmup: false });
  expect(fake.services.sessions.logSet).toHaveBeenCalledWith(expect.objectContaining({
    id: draftId, sessionExerciseId: fake.detail.exercises[0].id, weightKg: 100, reps: 5, rir: 0.5, completedAt: expect.any(String),
  }));
});

test('preserves null effort as distinct from zero when logging a completed set', async () => {
  const fake = services();
  const repository = new OfficialTrainingRepository(fake.data, () => '00000000-0000-7000-8000-000000000099');
  const draftId = await repository.addSet(fake.detail.id, fake.detail.exercises[0].id);
  await repository.saveSet(fake.detail.id, draftId, { weightKg: 20, reps: 8, rir: null, isWarmup: false });
  expect(fake.services.sessions.logSet).toHaveBeenCalledWith(expect.objectContaining({ rir: null }));
});
