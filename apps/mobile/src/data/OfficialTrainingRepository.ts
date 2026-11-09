import type { CardioSession } from '@athlete/contracts';
import { CATALOG_EXERCISE_ID, type OpenedAthleteData } from '@athlete/data';
import type { CardioDraft } from '@/cardio/cardioForm';
import type { TrainingRepository } from './TrainingRepository';
import { PROGRAM_TEMPLATES, computePersonalRecords, diagnoseWeeklyVolume, isEffectiveSet, loadTrend, weekStartOf, weeklyLoads, type LoadItem, newRecordsInSession, setVolumeKg, summarizeWeek, weeklySetsByMuscle, type ExerciseMuscles } from '@athlete/domain';
import type { BodyMeasurementInput, LocalAthletePreferencesInput, LoggedSetInput, RoutineInput } from './trainingSchemas';
import type { BodyMeasurement, CardioEntry, Exercise, ExerciseRecord, LocalAthletePreferences, PreviousPerformance, ProgressSummary, Routine, SessionRecord, WeeklyMuscleVolume, Program, ProgramBlock, ProgramDay, ProgramExercise, ProgramWeekStatus, WeeklyLoad, WorkoutBlock, ProgramBlockInput, ProgramExercisePatch, SessionModality, TrainingOverview, Workout, WorkoutDetail, TrainingSet } from './trainingTypes';

type IdFactory = () => string;
type SessionDetail = Awaited<ReturnType<OpenedAthleteData['sessions']['getDetail']>>;
type OfficialSessionDetail = Extract<SessionDetail, { ok: true }>['value'];
type OfficialPlanDetail = Extract<Awaited<ReturnType<OpenedAthleteData['plans']['getPlan']>>, { ok: true }>['value'];
type DraftSet = { sessionExerciseId: string; setIndex: number };

function unwrap<T>(result: { ok: true; value: T } | { ok: false; error: { code: string; message: string } }): T {
  if (!result.ok) {
    const error = new Error(result.error.message) as Error & { code: string };
    error.code = result.error.code;
    throw error;
  }
  return result.value;
}

function localDate(date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone }).format(date);
  return parts;
}

function toWorkout(session: Omit<OfficialSessionDetail, 'exercises'>, exerciseCount: number, setCount: number, volumeKg: number | null): Workout {
  return {
    id: session.id,
    state: session.status === 'in_progress' ? 'active' : 'completed',
    startedAt: session.startedAt,
    completedAt: session.endedAt,
    localVersion: null,
    serverVersion: session.revision,
    syncStatus: session.revision === null ? 'pending' : 'synced',
    exerciseCount,
    setCount,
    durationMinutes: session.endedAt ? Math.max(0, Math.round((Date.parse(session.endedAt) - Date.parse(session.startedAt)) / 60_000)) : null,
  };
}

/** UI adapter only: all reads and writes go through the repositories returned by openAthleteData. */
function toCardioEntry(c: CardioSession): CardioEntry {
  return {
    id: c.id, activity: c.activity, startedAt: c.startedAt, localDate: c.localDate, durationSeconds: c.durationSeconds,
    distanceMeters: c.distanceMeters, rounds: c.rounds, rpe: c.rpe, avgHeartRateBpm: c.avgHeartRateBpm,
    maxHeartRateBpm: c.maxHeartRateBpm, swim: c.swim, notes: c.notes,
    syncStatus: c.revision === null ? 'pending' : 'synced',
  };
}

export class OfficialTrainingRepository implements TrainingRepository {
  private readonly drafts = new Map<string, DraftSet>();

  constructor(private readonly data: OpenedAthleteData, private readonly newId: IdFactory) {}

  async searchExercises(query = '', options: { modality?: 'strength' | 'cardio' | 'all' } = {}): Promise<Exercise[]> {
    const modality = options.modality ?? 'strength';
    const [items, groups, equipment] = await Promise.all([
      this.data.exercises.list({ search: query, ...(modality === 'all' ? {} : { modality }) }),
      this.data.exercises.listMuscleGroups(),
      this.data.exercises.listEquipment(),
    ]);
    const muscleNames = new Map(unwrap(groups).map((item) => [item.id, item.name]));
    const muscleRef = new Map(unwrap(groups).map((item) => [item.id, { slug: item.slug, name: item.name }]));
    const refs = (ids: string[]) => ids.map((id) => muscleRef.get(id)).filter((x): x is { slug: string; name: string } => Boolean(x));
    const equipmentNames = new Map(unwrap(equipment).map((item) => [item.id, item.name]));
    return unwrap(items).map((exercise) => {
      const muscles = exercise.primaryMuscleGroupIds.map((id) => muscleNames.get(id)).filter((x): x is string => Boolean(x));
      const equipmentList = exercise.equipmentIds.map((id) => equipmentNames.get(id)).filter((x): x is string => Boolean(x));
      return {
        id: exercise.id,
        name: exercise.name,
        muscleGroup: muscles.join(', ') || 'General',
        equipment: equipmentList.join(', ') || null,
        origin: exercise.ownerUserId ? 'server' : 'sample',
        muscles, equipmentList, tier: exercise.accessTier,
        muscleRoles: { primary: refs(exercise.primaryMuscleGroupIds), secondary: refs(exercise.secondaryMuscleGroupIds) },
        movementPattern: exercise.movementPattern ?? null, modality: exercise.modality, loadType: exercise.loadType, isCustom: exercise.ownerUserId !== null, mechanics: exercise.mechanics,
      };
    });
  }

  async listRoutines(): Promise<Routine[]> {
    const plans = unwrap(await this.data.plans.listPlans());
    const routines: Routine[] = [];
    for (const plan of plans) {
      if (plan.kind === 'program') continue; // los programas híbridos tienen su propia sección
      const detail = unwrap(await this.data.plans.getPlan(plan.id));
      const day = detail.days.find((item) => item.kind === 'training');
      if (!day) continue;
      const exercises = await Promise.all(day.exercises.map(async (item) => ({
        exerciseId: item.exerciseId,
        exerciseName: unwrap(await this.data.exercises.getById(item.exerciseId)).name,
        sortOrder: item.position,
        sets: item.targetSets,
        reps: item.targetRepsMin === item.targetRepsMax ? item.targetRepsMin : null,
        restSeconds: item.targetRestSeconds,
      })));
      routines.push({ id: plan.id, name: plan.name, updatedAt: plan.updatedAt, exercises });
    }
    return routines;
  }

  async createRoutine(input: RoutineInput): Promise<string> {
    const planId = this.newId();
    const dayId = this.newId();
    unwrap(await this.data.plans.createPlan({ id: planId, name: input.name, description: null, status: 'active', startsOn: null, endsOn: null }));
    try {
      unwrap(await this.data.plans.addDay({ id: dayId, planId, position: 0, name: input.name, kind: 'training', notes: null }));
      for (const [position, exercise] of input.exercises.entries()) {
        unwrap(await this.data.plans.addDayExercise({
          id: this.newId(), trainingDayId: dayId, exerciseId: exercise.exerciseId, position,
          targetSets: exercise.sets, targetRepsMin: exercise.reps, targetRepsMax: exercise.reps,
          targetWeightKg: null, targetRir: exercise.targetRir ?? null, targetRestSeconds: exercise.restSeconds,
          targetDurationSeconds: null, targetDistanceMeters: null, notes: null,
        }));
      }
      return planId;
    } catch (error) {
      await this.data.plans.deletePlan(planId);
      throw error;
    }
  }

  async tombstoneRoutine(id: string): Promise<void> { unwrap(await this.data.plans.deletePlan(id)); }

  async startWorkout(planId?: string, options: { startedAt?: string } = {}): Promise<string> {
    const active = unwrap(await this.data.sessions.getActive());
    // Un entrenamiento pasado no debe "abrir" el que está en curso sin avisar.
    if (active && options.startedAt) throw new Error('ACTIVE_WORKOUT_EXISTS');
    if (active) return active.id;
    const startedAt = options.startedAt ?? new Date().toISOString();
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    if (!planId) return unwrap(await this.data.sessions.start({ id: this.newId(), startedAt, timeZone, trainingDayId: null, title: null, notes: null })).id;
    const plan = unwrap(await this.data.plans.getPlan(planId));
    const day = plan.days.find((item) => item.kind === 'training');
    if (!day) throw new Error('ROUTINE_NOT_FOUND');
    return unwrap(await this.data.sessions.startFromTrainingDay({ id: this.newId(), trainingDayId: day.id, startedAt, timeZone })).id;
  }

  async addExercise(sessionId: string, exerciseId: string): Promise<void> {
    unwrap(await this.data.sessions.addExercise({ id: this.newId(), sessionId, exerciseId, trainingDayExerciseId: null }));
  }

  async addSet(_sessionId: string, sessionExerciseId: string): Promise<string> {
    const id = this.newId();
    const detail = unwrap(await this.data.sessions.getDetail(_sessionId));
    const setIndex = detail.exercises.find((item) => item.id === sessionExerciseId)?.sets.length ?? 0;
    this.drafts.set(id, { sessionExerciseId, setIndex });
    return id;
  }

  async saveSet(sessionId: string, setId: string, input: LoggedSetInput): Promise<void> {
    const draft = this.drafts.get(setId);
    if (draft) {
      unwrap(await this.data.sessions.logSet({
        // Sin `position`: el backend asigna la siguiente posición libre al guardar (`nextPosition`).
        // `draft.setIndex` solo sirve para mostrar el borrador; enviarlo duplicaba posiciones cuando
        // coexistían el borrador automático de getWorkout y uno creado con addSet.
        id: setId, sessionExerciseId: draft.sessionExerciseId,
        setType: input.isWarmup ? 'warmup' : 'working', weightKg: input.weightKg, reps: input.reps,
        rir: input.rir, rpe: null, restSeconds: null, durationSeconds: input.durationSeconds ?? null, distanceMeters: input.distanceMeters ?? null,
        completedAt: await this.setCompletionTime(sessionId), notes: null,
      }));
      this.drafts.delete(setId);
      return;
    }
    unwrap(await this.data.sessions.updateSet({
      setId, setType: input.isWarmup ? 'warmup' : 'working', weightKg: input.weightKg,
      reps: input.reps, rir: input.rir, completedAt: await this.setCompletionTime(sessionId),
      ...(input.durationSeconds !== undefined ? { durationSeconds: input.durationSeconds } : {}),
      ...(input.distanceMeters !== undefined ? { distanceMeters: input.distanceMeters } : {}),
    }));
  }

  /** Hora de una serie: ahora, salvo en un entrenamiento pasado, donde se usa su hora de inicio (no la de hoy). */
  private async setCompletionTime(sessionId: string): Promise<string> {
    const now = new Date();
    const startedAt = unwrap(await this.data.sessions.getDetail(sessionId)).startedAt;
    return isPastWorkout(startedAt, now) ? startedAt : now.toISOString();
  }

  async finishWorkout(sessionId: string, options: { durationMinutes?: number; sessionRpe?: number | null } = {}): Promise<void> {
    const now = new Date();
    const { startedAt } = unwrap(await this.data.sessions.getDetail(sessionId));
    let endedAt = now.toISOString();
    if (isPastWorkout(startedAt, now)) {
      const minutes = options.durationMinutes;
      if (minutes === undefined || !Number.isInteger(minutes) || minutes < 1 || minutes > 600) throw new Error('WORKOUT_DURATION_REQUIRED');
      endedAt = new Date(Math.min(Date.parse(startedAt) + minutes * 60_000, now.getTime())).toISOString();
    }
    unwrap(await this.data.sessions.complete({ sessionId, endedAt, ...(options.sessionRpe !== undefined ? { sessionRpe: options.sessionRpe } : {}) }));
  }
  async tombstoneWorkout(sessionId: string): Promise<void> { unwrap(await this.data.sessions.delete(sessionId)); }

  async getWorkout(sessionId: string): Promise<WorkoutDetail | null> {
    const result = await this.data.sessions.getDetail(sessionId);
    if (!result.ok && result.error.code === 'NOT_FOUND') return null;
    if (!result.ok) return unwrap(result);
    const detail = result.value;
    const sets = detail.exercises.flatMap((exercise) => exercise.sets);
    const volumeKg = sets.reduce((sum, set) => sum + (set.setType === 'working' ? setVolumeKg(set) ?? 0 : 0), 0);
    const workout = toWorkout(detail, detail.exercises.length, sets.filter((set) => set.completedAt !== null).length, volumeKg);
    const equipment = await this.data.exercises.listEquipment();
    const equipmentSlug = new Map(equipment.ok ? equipment.value.map((e) => [e.id, e.slug]) : []);
    const day = detail.trainingDayId ? await this.findDay(detail.trainingDayId) : null;
    const planned = new Map((day?.exercises ?? []).map((e) => [e.id, e]));
    const exercises = await Promise.all(detail.exercises.map(async (exercise) => {
      const catalog = unwrap(await this.data.exercises.getById(exercise.exerciseId));
      const metadata = exercise.trainingDayExerciseId ? planned.get(exercise.trainingDayExerciseId) ?? null : null;
      const persisted: TrainingSet[] = exercise.sets.map((set, index) => ({
        id: set.id, setIndex: index, weightKg: set.weightKg, reps: set.reps, rir: set.rir, isWarmup: set.setType === 'warmup',
        durationSeconds: set.durationSeconds, distanceMeters: set.distanceMeters,
      }));
      let displayedSets = persisted;
      if (detail.status === 'in_progress') {
        let draft = [...this.drafts.entries()].find(([, value]) => value.sessionExerciseId === exercise.id);
        if (!draft) {
          const id = this.newId();
          const setIndex = persisted.length;
          this.drafts.set(id, { sessionExerciseId: exercise.id, setIndex });
          draft = [id, { sessionExerciseId: exercise.id, setIndex }];
        }
        displayedSets = [...persisted, { id: draft[0], setIndex: draft[1].setIndex, weightKg: null, reps: null, rir: null, isWarmup: false, durationSeconds: null, distanceMeters: null }];
      }
      return {
        id: exercise.id, exerciseId: exercise.exerciseId,
        exerciseName: catalog.name,
        incrementKg: loadIncrementKg(catalog.loadType, catalog.equipmentIds.map((id) => equipmentSlug.get(id) ?? '')),
        sortOrder: exercise.position, setsTarget: metadata?.targetSets ?? null,
        repsTarget: metadata?.targetRepsMin ?? null, repsMax: metadata?.targetRepsMax ?? null, restSeconds: metadata?.targetRestSeconds ?? null, targetRir: metadata?.targetRir ?? null,
        blockId: metadata?.blockId ?? null, targetDurationSeconds: metadata?.targetDurationSeconds ?? null, targetDistanceMeters: metadata?.targetDistanceMeters ?? null,
        perSide: metadata?.perSide ?? false, modality: catalog.modality, loadType: catalog.loadType, notes: metadata?.notes ?? null,
        sets: displayedSets,
        ...(await this.exerciseHistory(exercise.exerciseId, sessionId, persisted.length > 0)),
      };
    }));
    let blocks: WorkoutBlock[] = [];
    if (day?.blocks.length) {
      const results = await this.data.sessions.listBlockResults(sessionId);
      const byBlock = new Map((results.ok ? results.value : []).map((r) => [r.trainingBlockId, r]));
      blocks = day.blocks.map((b) => {
        const r = byBlock.get(b.id);
        return {
          id: b.id, name: b.name, kind: b.kind, format: b.format, rounds: b.rounds, timeCapSeconds: b.timeCapSeconds, restSeconds: b.restSeconds,
          targetRpe: b.targetRpe, notes: b.notes,
          result: r ? { id: r.id, roundsCompleted: r.roundsCompleted, extraReps: r.extraReps, durationSeconds: r.durationSeconds } : null,
        };
      });
    }
    return { workout, exercises, blocks, sessionRpe: detail.sessionRpe, trainingDayId: detail.trainingDayId, dayName: day?.name ?? null };
  }

  /** Día planificado (con ejercicios y bloques) por id, buscándolo en los planes del usuario. */
  private async findDay(dayId: string) {
    for (const plan of unwrap(await this.data.plans.listPlans())) {
      const detail = await this.data.plans.getPlan(plan.id);
      const day = detail.ok ? detail.value.days.find((d) => d.id === dayId) : undefined;
      if (day) return day;
    }
    return null;
  }

  /**
   * Con una sola consulta al historial del ejercicio: lo que hiciste la última vez (otra sesión) y los récords
   * que esta sesión supera (peso máximo y 1RM estimado).
   */
  private async exerciseHistory(exerciseId: string, sessionId: string, hasSets: boolean): Promise<{ newRecords: SessionRecord[]; previous: PreviousPerformance | null }> {
    const all = await this.data.sessions.listSetsForExercise(exerciseId);
    if (!all.ok) return { newRecords: [], previous: null };
    const history = { value: upToSession(all.value, sessionId) };
    const newRecords = hasSets
      ? newRecordsInSession(history.value, sessionId)
        .filter((r) => r.kind === 'max_weight' || r.kind === 'best_e1rm')
        .map((r) => ({ kind: r.kind as SessionRecord['kind'], value: r.value, weightKg: r.weightKg, reps: r.reps }))
      : [];
    return { newRecords, previous: previousPerformance(history.value, sessionId) };
  }

  async listHistory(): Promise<Workout[]> {
    const page = unwrap(await this.data.sessions.listHistory({ status: ['completed'] }, { limit: 100 }));
    return Promise.all(page.items.map(async (item) => {
      const detail = unwrap(await this.data.sessions.getDetail(item.sessionId));
      return toWorkout(detail, item.exerciseCount, item.workingSetCount, item.volumeKg);
    }));
  }

  async getOverview(): Promise<TrainingOverview> {
    const active = unwrap(await this.data.sessions.getActive());
    const history = unwrap(await this.data.sessions.listHistory({ status: ['completed'] }, { limit: 100 }));
    const sessions = await Promise.all(history.items.map((item) => this.data.sessions.getDetail(item.sessionId)));
    const now = new Date();
    const weekStart = new Date(now); weekStart.setDate(now.getDate() - 6);
    const workoutDetails = sessions.filter((item) => item.ok).map((item) => item.value);
    const weekFrom = localDate(new Date(now.getTime() - 7 * 86_400_000));
    const cardio = unwrap(await this.data.cardio.list({ from: weekFrom }, { limit: 100 })).items;
    const summary = summarizeWeek(localDate(now), workoutDetails, cardio);
    const status = await this.data.sync.status();
    let latestWorkout: Workout | null = active ? toWorkout(active, active.exercises.length, active.exercises.reduce((n, e) => n + e.sets.length, 0), null) : null;
    if (!latestWorkout && history.items[0]) latestWorkout = toWorkout(unwrap(await this.data.sessions.getDetail(history.items[0].sessionId)), history.items[0].exerciseCount, history.items[0].workingSetCount, history.items[0].volumeKg);
    return { sessionsThisWeek: summary.completedStrengthSessions + summary.cardioSessions, strengthSessionsThisWeek: summary.completedStrengthSessions, cardioSessionsThisWeek: summary.cardioSessions, activityMinutesThisWeek: Math.round(summary.activeSeconds / 60), pendingSyncCount: status.pendingCount, latestWorkout };
  }

  async getProgress(): Promise<ProgressSummary> {
    const history = await this.listHistory();
    const details = await Promise.all(history.map((session) => this.data.sessions.getDetail(session.id)));
    const allDetails = details.filter((item) => item.ok).map((item) => item.value);
    const sevenDaysAgo = new Date(); sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
    const today = localDate();
    const dailyVolumeKg = Array.from({ length: 7 }, (_, offset) => {
      const date = new Date(sevenDaysAgo); date.setDate(sevenDaysAgo.getDate() + offset);
      const label = new Intl.DateTimeFormat('es-MX', { weekday: 'short' }).format(date);
      const day = localDate(date);
      const volumeKg = allDetails.filter((item) => item.localDate === day).flatMap((item) => item.exercises).flatMap((item) => item.sets).reduce((sum, set) => sum + (set.setType === 'working' ? setVolumeKg(set) ?? 0 : 0), 0);
      return { label, volumeKg };
    });
    const exerciseIds = [...new Set(allDetails.flatMap((item) => item.exercises.map((exercise) => exercise.exerciseId)))];
    const records = (await Promise.all(exerciseIds.map(async (exerciseId) => {
      const [exercise, sets] = await Promise.all([this.data.exercises.getById(exerciseId), this.data.sessions.listSetsForExercise(exerciseId)]);
      const personal = computePersonalRecords(unwrap(sets));
      const record = personal.max_weight;
      const e1rm = personal.best_e1rm;
      if (!exercise.ok || !record) return null;
      const item: ExerciseRecord = {
        exerciseId, exerciseName: exercise.value.name, weightKg: record.value, reps: record.reps, measuredAt: `${record.localDate}T12:00:00.000Z`,
        e1rm: e1rm && e1rm.weightKg !== null && e1rm.reps !== null ? { valueKg: e1rm.value, weightKg: e1rm.weightKg, reps: e1rm.reps, localDate: e1rm.localDate } : null,
      };
      return item;
    }))).filter((item): item is ExerciseRecord => item !== null)
      .sort((a, b) => (b.e1rm?.valueKg ?? b.weightKg) - (a.e1rm?.valueKg ?? a.weightKg));
    const measurements = await this.listBodyMeasurements();
    return {
      weeklyVolumeKg: dailyVolumeKg.reduce((sum, item) => sum + item.volumeKg, 0),
      sessionsThisMonth: history.filter((item) => item.startedAt.slice(0, 7) === today.slice(0, 7)).length,
      dailyVolumeKg, records, measurements,
    };
  }

  // ---------------- Programa híbrido (0.7.0) ----------------

  async listPrograms(): Promise<Program[]> {
    const plans = unwrap(await this.data.plans.listPlans()).filter((p) => p.kind === 'program');
    const names = new Map<string, { name: string; modality: 'strength' | 'cardio'; loadType: string }>();
    const exerciseInfo = async (id: string) => {
      if (!names.has(id)) {
        const e = await this.data.exercises.getById(id);
        names.set(id, e.ok ? { name: e.value.name, modality: e.value.modality, loadType: e.value.loadType } : { name: 'Ejercicio', modality: 'strength', loadType: 'external' });
      }
      return names.get(id)!;
    };
    const out: Program[] = [];
    for (const plan of plans) {
      const detail = unwrap(await this.data.plans.getPlan(plan.id));
      const days: ProgramDay[] = [];
      for (const d of detail.days) {
        const toExercise = async (e: (typeof d.exercises)[number]): Promise<ProgramExercise> => {
          const info = await exerciseInfo(e.exerciseId);
          return {
            id: e.id, exerciseId: e.exerciseId, exerciseName: info.name, modality: info.modality, loadType: info.loadType,
            sets: e.targetSets, repsMin: e.targetRepsMin, repsMax: e.targetRepsMax, durationSeconds: e.targetDurationSeconds,
            distanceMeters: e.targetDistanceMeters, restSeconds: e.targetRestSeconds, perSide: e.perSide, targetRpe: e.targetRpe, notes: e.notes,
          };
        };
        const blocks: ProgramBlock[] = [];
        for (const b of d.blocks) {
          blocks.push({
            id: b.id, name: b.name, kind: b.kind, format: b.format, rounds: b.rounds, timeCapSeconds: b.timeCapSeconds, restSeconds: b.restSeconds,
            targetRpe: b.targetRpe, notes: b.notes,
            exercises: await Promise.all(d.exercises.filter((e) => e.blockId === b.id).map(toExercise)),
          });
        }
        const loose = d.exercises.filter((e) => !e.blockId || !d.blocks.some((b) => b.id === e.blockId));
        if (loose.length) blocks.push({ id: `${d.id}-sin-bloque`, name: 'Ejercicios', kind: 'strength', format: 'sets', rounds: null, timeCapSeconds: null, restSeconds: null, targetRpe: null, notes: null, exercises: await Promise.all(loose.map(toExercise)) });
        days.push({ id: d.id, name: d.name, weekday: d.weekday, modality: d.modality, targetRpe: d.targetRpe, targetDurationMinutes: d.targetDurationMinutes, notes: d.notes, blocks });
      }
      days.sort((a, b) => (a.weekday ?? 8) - (b.weekday ?? 8));
      out.push({ id: plan.id, name: plan.name, templateSlug: plan.templateSlug, days });
    }
    return out;
  }

  async adoptProgramTemplate(slug: string): Promise<string> {
    const template = PROGRAM_TEMPLATES.find((t) => t.slug === slug);
    if (!template) throw new Error('TEMPLATE_NOT_FOUND');
    const planId = this.newId();
    unwrap(await this.data.plans.createPlan({ id: planId, name: template.name, description: template.summary, status: 'active', startsOn: null, endsOn: null, kind: 'program', templateSlug: template.slug }));
    try {
      for (const [dayPos, session] of template.sessions.entries()) {
        const dayId = this.newId();
        unwrap(await this.data.plans.addDay({
          id: dayId, planId, position: dayPos, name: session.name, kind: session.modality === 'rest' ? 'rest' : 'training', notes: session.notes ?? null,
          weekday: session.weekday, modality: session.modality, targetRpe: session.targetRpe ?? null, targetDurationMinutes: session.targetDurationMinutes ?? null,
        }));
        let exPos = 0;
        for (const [blockPos, block] of session.blocks.entries()) {
          const blockId = this.newId();
          unwrap(await this.data.plans.addBlock({
            id: blockId, trainingDayId: dayId, position: blockPos, name: block.name, kind: block.kind, format: block.format, rounds: block.rounds ?? null,
            timeCapSeconds: block.timeCapSeconds ?? null, restSeconds: block.restSeconds ?? null, targetRpe: block.targetRpe ?? null, notes: block.notes ?? null,
          }));
          for (const e of block.exercises) {
            const exerciseId = CATALOG_EXERCISE_ID[e.slug];
            if (!exerciseId) throw new Error(`EXERCISE_NOT_IN_CATALOG:${e.slug}`);
            unwrap(await this.data.plans.addDayExercise({
              id: this.newId(), trainingDayId: dayId, exerciseId, position: exPos++, blockId,
              targetSets: e.sets ?? null, targetRepsMin: e.repsMin ?? null, targetRepsMax: e.repsMax ?? null, targetWeightKg: null, targetRir: null,
              targetRestSeconds: e.restSeconds ?? null, targetDurationSeconds: e.durationSeconds ?? null, targetDistanceMeters: e.distanceMeters ?? null,
              notes: e.notes ?? null, perSide: e.perSide ?? false, targetRpe: e.targetRpe ?? null,
            }));
          }
        }
      }
    } catch (error) {
      await this.data.plans.deletePlan(planId); // sin programas a medias
      throw error;
    }
    return planId;
  }

  async deleteProgram(planId: string): Promise<void> { unwrap(await this.data.plans.deletePlan(planId)); }

  async programWeekStatus(planId: string): Promise<ProgramWeekStatus> {
    const plan = unwrap(await this.data.plans.getPlan(planId));
    const dayIds = new Set(plan.days.map((d) => d.id));
    const from = weekStartOf(localDate());
    const status: ProgramWeekStatus = {};
    const active = unwrap(await this.data.sessions.getActive());
    if (active?.trainingDayId && dayIds.has(active.trainingDayId)) status[active.trainingDayId] = { workoutId: active.id, active: true };
    const history = unwrap(await this.data.sessions.listHistory({ status: ['completed'], from }, { limit: 100 }));
    for (const item of history.items) {
      const d = await this.data.sessions.getDetail(item.sessionId);
      if (d.ok && d.value.trainingDayId && dayIds.has(d.value.trainingDayId)) status[d.value.trainingDayId] = { workoutId: d.value.id };
    }
    for (const c of unwrap(await this.data.cardio.list({ from }, { limit: 100 })).items) {
      if (c.trainingDayId && dayIds.has(c.trainingDayId)) status[c.trainingDayId] = { cardioId: c.id };
    }
    return status;
  }

  async startProgramDay(dayId: string): Promise<string> {
    const active = unwrap(await this.data.sessions.getActive());
    if (active) {
      if (active.trainingDayId === dayId) return active.id;
      throw new Error('ACTIVE_WORKOUT_EXISTS');
    }
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    return unwrap(await this.data.sessions.startFromTrainingDay({ id: this.newId(), trainingDayId: dayId, startedAt: new Date().toISOString(), timeZone })).id;
  }

  async saveBlockResult(sessionId: string, blockId: string, result: { roundsCompleted: number | null; extraReps: number | null; durationSeconds: number | null }): Promise<void> {
    const detail = await this.getWorkout(sessionId);
    const block = detail?.blocks?.find((b) => b.id === blockId);
    if (!detail || !block) throw new Error('BLOCK_NOT_FOUND');
    const position = detail.blocks!.indexOf(block);
    unwrap(await this.data.sessions.saveBlockResult({
      id: block.result?.id ?? this.newId(), sessionId, trainingBlockId: blockId, position, name: block.name, format: block.format,
      roundsCompleted: result.roundsCompleted, extraReps: result.extraReps, durationSeconds: result.durationSeconds, notes: null,
    }));
  }

  async getWeeklyLoad(weeks = 4): Promise<WeeklyLoad> {
    const today = localDate();
    const from = weekStartOf(today);
    const since = new Date(`${from}T12:00:00Z`); since.setUTCDate(since.getUTCDate() - 7 * (weeks - 1));
    const sinceDate = since.toISOString().slice(0, 10);
    const items: LoadItem[] = [];
    const modalityOf = new Map<string, string | null>();
    for (const p of unwrap(await this.data.plans.listPlans()).filter((x) => x.kind === 'program')) {
      for (const d of unwrap(await this.data.plans.getPlan(p.id)).days) modalityOf.set(d.id, d.modality);
    }
    const history = unwrap(await this.data.sessions.listHistory({ status: ['completed'], from: sinceDate }, { limit: 100 }));
    for (const h of history.items) {
      const d = await this.data.sessions.getDetail(h.sessionId);
      if (!d.ok || !d.value.endedAt) continue;
      const minutes = Math.round((Date.parse(d.value.endedAt) - Date.parse(d.value.startedAt)) / 60_000);
      const modality = d.value.trainingDayId ? modalityOf.get(d.value.trainingDayId) : null;
      items.push({ localDate: d.value.localDate, minutes, rpe: d.value.sessionRpe, kind: modality === 'conditioning' ? 'conditioning' : 'strength' });
    }
    for (const c of unwrap(await this.data.cardio.list({ from: sinceDate }, { limit: 100 })).items) {
      items.push({ localDate: c.localDate, minutes: Math.round(c.durationSeconds / 60), rpe: c.rpe, kind: c.activity === 'circuit' || c.activity === 'hybrid' ? 'conditioning' : 'cardio' });
    }
    const list = weeklyLoads(items, today, weeks);
    return { weeks: list, trend: loadTrend(list) };
  }

  // ---------------- Editar programa (0.7.0) ----------------

  /** Plan y día vivos que contienen un día, bloque o ejercicio. */
  private async locate(predicate: (day: Awaited<ReturnType<OfficialTrainingRepository['findDay']>> & object) => boolean) {
    for (const plan of unwrap(await this.data.plans.listPlans())) {
      const detail = unwrap(await this.data.plans.getPlan(plan.id));
      const day = detail.days.find((d) => predicate(d));
      if (day) return { plan: detail.plan, days: detail.days, day };
    }
    throw new Error('NOT_FOUND');
  }

  private static defaultBlockFor(modality: SessionModality): ProgramBlockInput & { kind: string } {
    switch (modality) {
      case 'strength': return { name: 'Fuerza', kind: 'strength', format: 'sets', rounds: null, timeCapSeconds: null, restSeconds: null, targetRpe: null, notes: null };
      case 'conditioning': return { name: 'Circuito', kind: 'conditioning', format: 'rounds', rounds: 3, timeCapSeconds: null, restSeconds: 90, targetRpe: null, notes: null };
      case 'mobility': case 'rest': return { name: 'Movilidad', kind: 'mobility', format: 'continuous', rounds: null, timeCapSeconds: null, restSeconds: null, targetRpe: null, notes: null };
      default: return { name: 'Principal', kind: modality === 'swim' ? 'swim' : 'cardio', format: 'continuous', rounds: null, timeCapSeconds: null, restSeconds: null, targetRpe: null, notes: null };
    }
  }

  /** Tipo de bloque según su formato (los AMRAP/EMOM/por tiempo son WOD). */
  private static kindFor(format: ProgramBlockInput['format'], fallback: string): 'warmup' | 'strength' | 'conditioning' | 'wod' | 'cardio' | 'swim' | 'cooldown' | 'mobility' {
    if (format === 'amrap' || format === 'emom' || format === 'for_time') return 'wod';
    if (format === 'rounds') return 'conditioning';
    return fallback as never;
  }

  async addProgramDay(planId: string, input: { name: string; weekday: number; modality: SessionModality }): Promise<string> {
    const plan = unwrap(await this.data.plans.getPlan(planId));
    const dayId = this.newId();
    unwrap(await this.data.plans.addDay({
      id: dayId, planId, position: Math.min(1000, Math.max(-1, ...plan.days.map((d) => d.position)) + 1), name: input.name.trim(),
      kind: input.modality === 'rest' ? 'rest' : 'training', notes: null, weekday: input.weekday, modality: input.modality,
    }));
    const b = OfficialTrainingRepository.defaultBlockFor(input.modality);
    unwrap(await this.data.plans.addBlock({ id: this.newId(), trainingDayId: dayId, position: 0, name: b.name, kind: b.kind as never, format: b.format, rounds: b.rounds, timeCapSeconds: b.timeCapSeconds, restSeconds: b.restSeconds, targetRpe: null, notes: null }));
    return dayId;
  }

  async updateProgramDay(dayId: string, patch: Partial<{ name: string; weekday: number; modality: SessionModality; targetRpe: number | null; targetDurationMinutes: number | null }>): Promise<void> {
    unwrap(await this.data.plans.updateDay(dayId, {
      ...patch, ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
      ...(patch.modality !== undefined ? { kind: patch.modality === 'rest' ? 'rest' as const : 'training' as const } : {}),
    }));
  }

  async duplicateProgramDay(dayId: string, weekday: number): Promise<string> {
    const { plan, days, day } = await this.locate((d) => d.id === dayId);
    const newDayId = this.newId();
    unwrap(await this.data.plans.addDay({
      id: newDayId, planId: plan.id, position: Math.min(1000, Math.max(...days.map((d) => d.position)) + 1), name: day.name, kind: day.kind, notes: day.notes,
      weekday, modality: day.modality, targetRpe: day.targetRpe, targetDurationMinutes: day.targetDurationMinutes,
    }));
    const blockMap = new Map<string, string>();
    for (const b of day.blocks) {
      const id = this.newId(); blockMap.set(b.id, id);
      unwrap(await this.data.plans.addBlock({ id, trainingDayId: newDayId, position: b.position, name: b.name, kind: b.kind, format: b.format, rounds: b.rounds, timeCapSeconds: b.timeCapSeconds, restSeconds: b.restSeconds, targetRpe: b.targetRpe, notes: b.notes }));
    }
    for (const e of day.exercises) {
      unwrap(await this.data.plans.addDayExercise({
        id: this.newId(), trainingDayId: newDayId, exerciseId: e.exerciseId, position: e.position, targetSets: e.targetSets, targetRepsMin: e.targetRepsMin,
        targetRepsMax: e.targetRepsMax, targetWeightKg: e.targetWeightKg, targetRir: e.targetRir, targetRestSeconds: e.targetRestSeconds,
        targetDurationSeconds: e.targetDurationSeconds, targetDistanceMeters: e.targetDistanceMeters, notes: e.notes,
        blockId: e.blockId ? blockMap.get(e.blockId) ?? null : null, perSide: e.perSide, targetRpe: e.targetRpe,
      }));
    }
    return newDayId;
  }

  async deleteProgramDay(dayId: string): Promise<void> { unwrap(await this.data.plans.deleteDay(dayId)); }

  async addProgramBlock(dayId: string, input: ProgramBlockInput): Promise<string> {
    const { day } = await this.locate((d) => d.id === dayId);
    const id = this.newId();
    const fallback = day.modality === 'swim' ? 'swim' : day.modality === 'strength' ? 'strength' : day.modality === 'mobility' ? 'mobility' : 'cardio';
    unwrap(await this.data.plans.addBlock({
      id, trainingDayId: dayId, position: Math.min(1000, Math.max(-1, ...day.blocks.map((b) => b.position)) + 1), name: input.name.trim(),
      kind: OfficialTrainingRepository.kindFor(input.format, input.format === 'sets' ? 'strength' : fallback), format: input.format, rounds: input.rounds,
      timeCapSeconds: input.timeCapSeconds, restSeconds: input.restSeconds, targetRpe: input.targetRpe, notes: input.notes,
    }));
    return id;
  }

  async updateProgramBlock(blockId: string, patch: Partial<ProgramBlockInput>): Promise<void> {
    const { day } = await this.locate((d) => d.blocks.some((b) => b.id === blockId));
    const current = day.blocks.find((b) => b.id === blockId)!;
    const format = patch.format ?? current.format;
    unwrap(await this.data.plans.updateBlock(blockId, { ...patch, ...(patch.name !== undefined ? { name: patch.name.trim() } : {}), kind: OfficialTrainingRepository.kindFor(format, format === 'sets' && current.kind === 'wod' ? 'strength' : current.kind === 'wod' || current.kind === 'conditioning' ? 'cardio' : current.kind) }));
  }

  async deleteProgramBlock(blockId: string): Promise<void> {
    const { day } = await this.locate((d) => d.blocks.some((b) => b.id === blockId));
    for (const e of day.exercises.filter((x) => x.blockId === blockId)) unwrap(await this.data.plans.deleteDayExercise(e.id));
    unwrap(await this.data.plans.deleteBlock(blockId));
  }

  async addProgramExercise(dayId: string, blockId: string, exerciseId: string): Promise<string> {
    const { day } = await this.locate((d) => d.id === dayId);
    const block = day.blocks.find((b) => b.id === blockId);
    if (!block) throw new Error('BLOCK_NOT_FOUND');
    const ex = unwrap(await this.data.exercises.getById(exerciseId));
    const timed = ex.modality === 'cardio' || ex.loadType === 'time';
    const whole = block.format === 'amrap' || block.format === 'emom' || block.format === 'for_time' || block.format === 'rounds';
    const id = this.newId();
    // Valores de partida razonables; se ajustan en el editor.
    unwrap(await this.data.plans.addDayExercise({
      id, trainingDayId: dayId, exerciseId, blockId, position: Math.min(1000, Math.max(-1, ...day.exercises.map((e) => e.position)) + 1),
      targetSets: whole ? null : timed ? (block.format === 'intervals' ? 4 : null) : 3,
      targetRepsMin: timed ? null : 10, targetRepsMax: timed ? null : 10, targetWeightKg: null, targetRir: null,
      targetRestSeconds: whole ? null : timed ? (block.format === 'intervals' ? 30 : null) : 90,
      targetDurationSeconds: timed && ex.modality !== 'cardio' ? 30 : timed && block.format === 'continuous' ? 600 : null,
      targetDistanceMeters: ex.modality === 'cardio' && block.format !== 'continuous' ? ((ex.slug ?? '').startsWith('swim') ? 50 : 400) : null,
      notes: null, perSide: false, targetRpe: null,
    }));
    return id;
  }

  async updateProgramExercise(id: string, patch: ProgramExercisePatch): Promise<void> {
    const map: Record<string, string> = { sets: 'targetSets', repsMin: 'targetRepsMin', repsMax: 'targetRepsMax', durationSeconds: 'targetDurationSeconds', distanceMeters: 'targetDistanceMeters', restSeconds: 'targetRestSeconds' };
    const input = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined).map(([k, v]) => [map[k] ?? k, v]));
    unwrap(await this.data.plans.updateDayExercise(id, input));
  }

  async removeProgramExercise(id: string): Promise<void> { unwrap(await this.data.plans.deleteDayExercise(id)); }

  async getWeeklyMuscleVolume(): Promise<WeeklyMuscleVolume> {
    const from = localDate(new Date(Date.now() - 6 * 86_400_000));
    const [active, history, groups] = await Promise.all([
      this.data.sessions.getActive(),
      this.data.sessions.listHistory({ status: ['completed'] }, { limit: 100 }),
      this.data.exercises.listMuscleGroups(),
    ]);
    const recent = unwrap(history).items.filter((item) => item.localDate >= from);
    const details = (await Promise.all(recent.map((item) => this.data.sessions.getDetail(item.sessionId))))
      .filter((item) => item.ok).map((item) => item.value);
    const current = unwrap(active);
    if (current && current.localDate >= from && !details.some((d) => d.id === current.id)) details.push(current);

    const groupList = unwrap(groups);
    const slugOf = new Map(groupList.map((g) => [g.id, g.slug]));
    const nameOf = new Map(groupList.map((g) => [g.slug, g.name]));
    const muscles = new Map<string, ExerciseMuscles>();
    for (const exerciseId of new Set(details.flatMap((d) => d.exercises.map((e) => e.exerciseId)))) {
      const exercise = await this.data.exercises.getById(exerciseId);
      if (!exercise.ok) continue;
      const toSlugs = (ids: string[]) => ids.map((id) => slugOf.get(id)).filter((x): x is string => Boolean(x));
      muscles.set(exerciseId, { primary: toSlugs(exercise.value.primaryMuscleGroupIds), secondary: toSlugs(exercise.value.secondaryMuscleGroupIds) });
    }
    const sets = weeklySetsByMuscle(details, (id) => muscles.get(id));
    const items = diagnoseWeeklyVolume(sets).map((m) => ({ ...m, name: nameOf.get(m.muscle) ?? m.muscle }));
    const totalSets = details.reduce((n, d) => n + d.exercises.reduce((k, e) => k + e.sets.filter(isEffectiveSet).length, 0), 0);
    return { items, totalSets, sessions: details.length };
  }

  async addBodyMeasurement(input: BodyMeasurementInput): Promise<string> {
    const id = this.newId(); const measuredAt = input.measuredAt; const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    if (input.type === 'weight_kg') unwrap(await this.data.body.logWeight({ id, measuredAt, timeZone, value: input.value, inputUnit: 'kg' }));
    else {
      const site = input.type === 'waist_cm' ? 'waist' : input.type === 'chest_cm' ? 'chest' : 'hips';
      unwrap(await this.data.body.logMeasurement({ id, measuredAt, timeZone, site, value: input.value, inputUnit: 'cm' }));
    }
    return id;
  }

  async listBodyMeasurements(): Promise<BodyMeasurement[]> {
    const [weights, measurements] = await Promise.all([this.data.body.listWeights({}), this.data.body.listMeasurements({})]);
    return [
      ...unwrap(weights).map((item) => ({ id: item.id, type: 'weight_kg' as const, value: item.weightKg, unit: 'kg' as const, measuredAt: item.measuredAt, localVersion: 1, serverVersion: item.revision, syncStatus: item.revision === null ? 'pending' as const : 'synced' as const })),
      ...unwrap(measurements).map((item) => ({ id: item.id, type: `${item.site === 'hips' ? 'hip' : item.site}_cm` as BodyMeasurement['type'], value: item.valueCm, unit: 'cm' as const, measuredAt: item.measuredAt, localVersion: null, serverVersion: item.revision, syncStatus: item.revision === null ? 'pending' as const : 'synced' as const })),
    ].sort((a, b) => b.measuredAt.localeCompare(a.measuredAt));
  }

  async tombstoneBodyMeasurement(id: string): Promise<void> {
    const item = (await this.listBodyMeasurements()).find((value) => value.id === id);
    if (!item) return;
    unwrap(item.type === 'weight_kg' ? await this.data.body.deleteWeight(id) : await this.data.body.deleteMeasurement(id));
  }

  async getPreferences(): Promise<LocalAthletePreferences> {
    let result = await this.data.profile.get();
    if (!result.ok && result.error.code === 'NOT_FOUND') result = await this.data.profile.initialize(Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC');
    const profile = unwrap(result);
    const first = profile.sports[0];
    const preferredSport = first === 'running' || first === 'swimming' ? first : 'strength';
    return { displayName: profile.displayName ?? '', unitSystem: profile.unitSystem, preferredSport, sports: profile.sports, timezone: profile.timeZone };
  }

  async savePreferences(input: LocalAthletePreferencesInput): Promise<void> {
    await this.getPreferences();
    const sports = input.sports ?? (input.preferredSport === 'hybrid' ? [] : [input.preferredSport]);
    unwrap(await this.data.profile.update({ displayName: input.displayName || null, timeZone: input.timezone, unitSystem: input.unitSystem, sports, loadUnit: input.unitSystem === 'imperial' ? 'lb' : 'kg' }));
  }

  async logCardio(input: CardioDraft): Promise<string> {
    const id = this.newId();
    unwrap(await this.data.cardio.log({ ...input, id }));
    return id;
  }

  async updateCardio(id: string, input: CardioDraft): Promise<void> {
    unwrap(await this.data.cardio.update(id, input));
  }

  async listCardio(): Promise<CardioEntry[]> {
    const items: CardioEntry[] = [];
    let cursor: string | null = null;
    do {
      const page: { items: CardioSession[]; nextCursor: string | null } = unwrap(await this.data.cardio.list({}, { cursor, limit: 100 }));
      items.push(...page.items.map(toCardioEntry));
      cursor = page.nextCursor;
    } while (cursor !== null && items.length < 500);
    return items;
  }

  async getCardio(id: string): Promise<CardioEntry | null> {
    const result = await this.data.cardio.getById(id);
    if (!result.ok && result.error.code === 'NOT_FOUND') return null;
    return toCardioEntry(unwrap(result));
  }

  async tombstoneCardio(id: string): Promise<void> { unwrap(await this.data.cardio.delete(id)); }
}

/** Un entrenamiento es "pasado" si empezó hace más de 12 h: se registró después, no en vivo. */
export const PAST_WORKOUT_MS = 12 * 3_600_000;
export function isPastWorkout(startedAt: string, now: Date = new Date()): boolean {
  return now.getTime() - Date.parse(startedAt) > PAST_WORKOUT_MS;
}

type HistorySet = { sessionId: string; localDate: string; setType: string; weightKg: number | null; reps: number | null; rir: number | null; completedAt: string | null; position: number };

/** Series de trabajo de la sesión más reciente (distinta de la actual) en la que hiciste el ejercicio. */
/**
 * Historial hasta esta sesión: quita las sesiones posteriores. Así, al abrir una sesión vieja, "la vez pasada"
 * y los récords se calculan como eran ese día (no contra entrenamientos que vinieron después).
 */
export function upToSession<T extends HistorySet>(sets: readonly T[], sessionId: string): T[] {
  const own = sets.filter((s) => s.sessionId === sessionId);
  if (!own.length) return [...sets];
  const day = own.reduce((d, s) => (s.localDate < d ? s.localDate : d), own[0]!.localDate);
  const first = own.reduce((t, s) => (s.completedAt && s.completedAt < t ? s.completedAt : t), '\uffff');
  return sets.filter((s) => s.sessionId === sessionId || s.localDate < day || (s.localDate === day && (s.completedAt ?? '') < first));
}

/** Incremento de carga para sugerir: mancuernas y kettlebell de 2 en 2 kg; lo demás 2.5 kg; peso corporal o tiempo, ninguno. */
export function loadIncrementKg(loadType: string, equipmentSlugs: readonly string[]): number | null {
  if (loadType !== 'external') return null;
  return equipmentSlugs.some((e) => e === 'dumbbell' || e === 'kettlebell') ? 2 : 2.5;
}

export function previousPerformance(sets: readonly HistorySet[], currentSessionId: string): PreviousPerformance | null {
  const others = sets.filter((s) => s.sessionId !== currentSessionId && s.setType !== 'warmup' && (s.weightKg !== null || s.reps !== null));
  if (!others.length) return null;
  const latest = others.reduce((a, b) => {
    if (a.localDate !== b.localDate) return a.localDate > b.localDate ? a : b;
    return (a.completedAt ?? '') >= (b.completedAt ?? '') ? a : b;
  });
  const sessionSets = others.filter((s) => s.sessionId === latest.sessionId).sort((a, b) => a.position - b.position);
  return { localDate: latest.localDate, sets: sessionSets.map((s) => ({ weightKg: s.weightKg, reps: s.reps, rir: s.rir })) };
}
