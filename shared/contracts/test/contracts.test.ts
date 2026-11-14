import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  AppError,
  CONTRACTS_VERSION,
  IdTokenSignInInput,
  RequestEmailCodeInput,
  VerifyEmailCodeInput,
  AddSessionExerciseInput,
  CreateTrainingDayExerciseInput,
  CreateTrainingPlanInput,
  Position,
  Profile,
  StartFromTrainingDayInput,
  UpdateProfileInput,
  IsoDateTime,
  LocalDate,
  LogCardioSessionInput,
  LogSetInput,
  MutationResult,
  PushRequest,
  SyncMutation,
  TimeZone,
  UpdateSetInput,
  appError,
  parseInput,
} from '../src';

const ID = '01972f3a-8b5e-7c3d-9a1b-2c3d4e5f6a7b'; // UUIDv7
const ID4 = '6f1c2d3e-4b5a-4c6d-8e7f-9a0b1c2d3e4f'; // UUIDv4

describe('primitivas', () => {
  it('exige instantes con desplazamiento explícito', () => {
    expect(IsoDateTime.safeParse('2026-11-03T10:00:00Z').success).toBe(true);
    expect(IsoDateTime.safeParse('2026-11-03T10:00:00-06:00').success).toBe(true);
    expect(IsoDateTime.safeParse('2026-11-03T10:00:00').success).toBe(false);
  });
  it('valida fechas locales y zonas IANA', () => {
    expect(LocalDate.safeParse('2026-11-03').success).toBe(true);
    expect(LocalDate.safeParse('2026-13-01').success).toBe(false);
    expect(TimeZone.safeParse('America/Mexico_City').success).toBe(true);
    expect(TimeZone.safeParse('Marte/Olympus').success).toBe(false);
  });
});

describe('series', () => {
  it('aplica valores por defecto sin inventar datos', () => {
    const parsed = LogSetInput.parse({ id: ID, sessionExerciseId: ID4, weightKg: 80, reps: 8 });
    expect(parsed).toMatchObject({ setType: 'working', rir: null, rpe: null, completedAt: null });
  });
  it('RIR/RPE en pasos de 0.5 y rangos válidos', () => {
    const base = { id: ID, sessionExerciseId: ID4 };
    expect(LogSetInput.safeParse({ ...base, rir: 2.5 }).success).toBe(true);
    expect(LogSetInput.safeParse({ ...base, rir: 2.3 }).success).toBe(false);
    expect(LogSetInput.safeParse({ ...base, rir: 11 }).success).toBe(false);
    expect(LogSetInput.safeParse({ ...base, rpe: 0 }).success).toBe(false);
    expect(LogSetInput.safeParse({ ...base, reps: 2.5 }).success).toBe(false);
    expect(LogSetInput.safeParse({ ...base, weightKg: -1 }).success).toBe(false);
  });
  it('la actualización distingue "no cambiar" (ausente) de "borrar" (null)', () => {
    const parsed = UpdateSetInput.parse({ setId: ID, rir: null });
    expect('rir' in parsed && parsed.rir).toBeNull();
    expect('reps' in parsed).toBe(false);
  });
});

describe('cardio', () => {
  const base = { id: ID, startedAt: '2026-11-03T07:00:00-06:00', timeZone: 'America/Mexico_City', durationSeconds: 1800 };
  it('solo natación admite detalles de natación', () => {
    const swim = { poolType: 'pool', poolLengthMeters: 25, laps: 40, stroke: 'freestyle' };
    expect(LogCardioSessionInput.safeParse({ ...base, activity: 'swim', swim }).success).toBe(true);
    expect(LogCardioSessionInput.safeParse({ ...base, activity: 'run', swim }).success).toBe(false);
  });
  it('FC media ≤ FC máxima', () => {
    expect(LogCardioSessionInput.safeParse({ ...base, activity: 'run', avgHeartRateBpm: 170, maxHeartRateBpm: 160 }).success).toBe(false);
  });
  it('procedencia manual por defecto', () => {
    expect(LogCardioSessionInput.parse({ ...base, activity: 'run' }).source).toBe('manual');
  });
});

describe('programas', () => {
  it('rechaza fin anterior al inicio', () => {
    const plan = { id: ID, name: 'Fuerza', description: null, status: 'draft', startsOn: '2026-11-10', endsOn: '2026-11-01' };
    expect(CreateTrainingPlanInput.safeParse(plan).success).toBe(false);
    expect(CreateTrainingPlanInput.safeParse({ ...plan, endsOn: '2026-12-01' }).success).toBe(true);
  });
});

describe('sincronización', () => {
  const mutation = {
    mutationId: ID,
    deviceId: ID4,
    entity: 'strength_set',
    entityId: ID4,
    op: 'upsert',
    baseRevision: null,
    payload: { reps: 5 },
    clientRecordedAt: '2026-11-03T10:00:00Z',
  };
  it('upsert requiere payload y delete lo prohíbe', () => {
    expect(SyncMutation.safeParse(mutation).success).toBe(true);
    expect(SyncMutation.safeParse({ ...mutation, payload: null }).success).toBe(false);
    expect(SyncMutation.safeParse({ ...mutation, op: 'delete' }).success).toBe(false);
    expect(SyncMutation.safeParse({ ...mutation, op: 'delete', payload: null }).success).toBe(true);
  });
  it('limita el tamaño del lote', () => {
    expect(PushRequest.safeParse({ deviceId: ID4, mutations: [] }).success).toBe(false);
    expect(PushRequest.safeParse({ deviceId: ID4, mutations: Array(101).fill(mutation) }).success).toBe(false);
  });
  it('resultado discriminado por estado', () => {
    expect(MutationResult.safeParse({ status: 'applied', mutationId: ID, revision: 1 }).success).toBe(true);
    expect(MutationResult.safeParse({ status: 'conflict', mutationId: ID }).success).toBe(false);
  });
});

describe('errores', () => {
  it('reintentable según el código por defecto', () => {
    expect(appError('NETWORK_UNAVAILABLE', 'Sin conexión').retryable).toBe(true);
    expect(appError('FORBIDDEN', 'No permitido').retryable).toBe(false);
    expect(appError('INTERNAL', 'x', { retryable: false }).retryable).toBe(false);
  });
  it('parseInput devuelve VALIDATION_FAILED con rutas de campos', () => {
    const r = parseInput(LogSetInput, { id: 'no-uuid', sessionExerciseId: ID4 });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(AppError.safeParse(r.error).success).toBe(true);
      expect(r.error.code).toBe('VALIDATION_FAILED');
      expect(JSON.stringify(r.error.details)).toContain('"path":"id"');
    }
  });
});

describe('0.3.0', () => {
  const dayExercise = { id: ID, trainingDayId: ID4, exerciseId: ID4, position: 0, targetSets: 3, targetRepsMin: 5, targetRepsMax: 5,
    targetWeightKg: null, targetRir: 2, targetRestSeconds: 180, targetDurationSeconds: null, targetDistanceMeters: null, notes: null };

  it('posiciones 0–1000 en todas las listas ordenadas', () => {
    expect(Position.safeParse(1000).success).toBe(true);
    expect(Position.safeParse(1001).success).toBe(false);
    expect(LogSetInput.safeParse({ id: ID, sessionExerciseId: ID4, position: 1001 }).success).toBe(false);
    expect(AddSessionExerciseInput.safeParse({ id: ID, sessionId: ID4, exerciseId: ID4, position: 5000 }).success).toBe(false);
    expect(CreateTrainingDayExerciseInput.safeParse({ ...dayExercise, position: 1001 }).success).toBe(false);
  });

  it('targetRir sigue las reglas del RIR registrado (0–10, pasos de 0.5)', () => {
    for (const ok of [0, 0.5, 2, 10, null]) expect(CreateTrainingDayExerciseInput.safeParse({ ...dayExercise, targetRir: ok }).success).toBe(true);
    for (const bad of [1.3, 2.25, -0.5, 10.5]) expect(CreateTrainingDayExerciseInput.safeParse({ ...dayExercise, targetRir: bad }).success).toBe(false);
  });

  it('StartFromTrainingDayInput exige el día planificado', () => {
    const base = { id: ID, startedAt: '2026-11-04T10:00:00Z', timeZone: 'UTC' };
    expect(StartFromTrainingDayInput.safeParse(base).success).toBe(false);
    expect(StartFromTrainingDayInput.safeParse({ ...base, trainingDayId: ID4 }).success).toBe(true);
  });

  it('Profile.sports: lista de disciplinas (fuerza e híbridos), sin repetidos ni valores desconocidos', () => {
    expect(UpdateProfileInput.safeParse({ sports: ['strength', 'running', 'swimming'] }).success).toBe(true);
    expect(UpdateProfileInput.safeParse({ sports: [] }).success).toBe(true);
    expect(UpdateProfileInput.safeParse({ sports: ['strength', 'strength'] }).success).toBe(false);
    expect(UpdateProfileInput.safeParse({ sports: ['crossfit'] }).success).toBe(false);
    expect(Profile.shape.sports.safeParse(undefined).success).toBe(false); // obligatorio en lecturas
  });
});

describe('versión', () => {
  it('CONTRACTS_VERSION coincide con package.json', () => {
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string };
    expect(CONTRACTS_VERSION).toBe(pkg.version);
  });
});

describe('0.4.0 — inicio de sesión sin contraseña', () => {
  it('RequestEmailCodeInput normaliza el correo', () => {
    expect(RequestEmailCodeInput.parse({ email: '  Ana@Test.Local ' })).toEqual({ email: 'ana@test.local' });
    expect(RequestEmailCodeInput.safeParse({ email: 'no-es-correo' }).success).toBe(false);
  });

  it('VerifyEmailCodeInput acepta 6–10 dígitos y nada más', () => {
    expect(VerifyEmailCodeInput.parse({ email: 'a@b.mx', code: ' 123456 ' }).code).toBe('123456');
    expect(VerifyEmailCodeInput.safeParse({ email: 'a@b.mx', code: '12345' }).success).toBe(false);
    expect(VerifyEmailCodeInput.safeParse({ email: 'a@b.mx', code: '12345678901' }).success).toBe(false);
    expect(VerifyEmailCodeInput.safeParse({ email: 'a@b.mx', code: '12a456' }).success).toBe(false);
  });

  it('IdTokenSignInInput solo admite Apple o Google', () => {
    expect(IdTokenSignInInput.safeParse({ provider: 'apple', idToken: 'x.y.z', nonce: 'n' }).success).toBe(true);
    expect(IdTokenSignInInput.safeParse({ provider: 'facebook', idToken: 'x.y.z' }).success).toBe(false);
    expect(IdTokenSignInInput.safeParse({ provider: 'google', idToken: '' }).success).toBe(false);
  });
});

describe('0.5.0 — metas nutricionales con origen', () => {
  it('kcal obligatorias, macros opcionales y origen explícito', async () => {
    const { SetNutritionTargetInput, NutritionTargetSource } = await import('../src/nutrition');
    const ok = SetNutritionTargetInput.parse({ id: '0190f0f0-0000-7000-8000-000000000001', effectiveFrom: '2026-11-07', energyKcal: 2400, source: 'estimated' });
    expect(ok).toMatchObject({ proteinG: null, carbsG: null, fatG: null });
    expect(SetNutritionTargetInput.safeParse({ ...ok, energyKcal: 500 }).success).toBe(false);
    expect(SetNutritionTargetInput.safeParse({ ...ok, source: 'ai' }).success).toBe(false);
    expect(NutritionTargetSource.options).toEqual(['estimated', 'professional', 'manual']);
  });
});

describe('0.8.0 — plan nutricional SMAE', () => {
  it('valida grupos, pasos de ½ y hora; los ids coinciden con el dominio', async () => {
    const { SaveNutritionPlanInput, SmaeGroupId, NutritionPlanMeal } = await import('../src/nutrition');
    const { SMAE_GROUP_IDS } = await import('../../domain/src/smae');
    expect([...SmaeGroupId.options].sort()).toEqual([...SMAE_GROUP_IDS].sort());
    const meal = NutritionPlanMeal.parse({ label: 'Desayuno', equivalents: { frutas: 1, cereales_sin_grasa: 2.5 } });
    expect(meal).toEqual({ label: 'Desayuno', time: null, equivalents: { frutas: 1, cereales_sin_grasa: 2.5 }, note: null });
    expect(NutritionPlanMeal.safeParse({ ...meal, equivalents: { pizza: 1 } }).success).toBe(false);
    expect(NutritionPlanMeal.safeParse({ ...meal, equivalents: { frutas: 1.3 } }).success).toBe(false);
    expect(NutritionPlanMeal.safeParse({ ...meal, time: '24:00' }).success).toBe(false);
    expect(NutritionPlanMeal.safeParse({ ...meal, extra: 1 }).success).toBe(false);
    const base = { id: '0190f0f0-0000-7000-8000-000000000001', effectiveFrom: '2026-11-10', name: 'Plan', meals: [meal] };
    expect(SaveNutritionPlanInput.parse(base).notes).toBeNull();
    expect(SaveNutritionPlanInput.safeParse({ ...base, meals: [] }).success).toBe(false);
  });
});

describe('0.9.0 — modo coach', () => {
  it('comentario del coach y plan asignado', async () => {
    const { CoachComment } = await import('../src/coach');
    const { TrainingPlan } = await import('../src/programs');
    const base = { id: '0190f0f0-0000-7000-8000-000000000001', userId: '0190f0f0-0000-7000-8000-000000000002', createdAt: '2026-11-10T00:00:00Z', updatedAt: '2026-11-10T00:00:00Z', deletedAt: null, revision: 1 };
    expect(CoachComment.safeParse({ ...base, authorId: null, authorName: 'Coach', targetType: 'general', targetId: null, body: 'Bien' }).success).toBe(true);
    expect(CoachComment.safeParse({ ...base, authorId: null, authorName: 'Coach', targetType: 'chat', targetId: null, body: 'x' }).success).toBe(false);
    const plan = TrainingPlan.parse({ ...base, name: 'P', kind: 'program', templateSlug: null, description: null, status: 'active', startsOn: null, endsOn: null });
    expect(plan).toMatchObject({ assignedBy: null, assignedByName: null });
  });
});
