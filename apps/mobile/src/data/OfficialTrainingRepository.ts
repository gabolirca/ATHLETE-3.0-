import type { OpenedAthleteData } from '@athlete/data';
import { computePersonalRecords, setVolumeKg, summarizeWeek } from '@athlete/domain';
import type { BodyMeasurementInput, LocalAthletePreferencesInput, LoggedSetInput, RoutineInput } from './trainingSchemas';
import type { BodyMeasurement, Exercise, LocalAthletePreferences, ProgressSummary, Routine, TrainingOverview, Workout, WorkoutDetail, TrainingSet } from './trainingTypes';

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
export class OfficialTrainingRepository {
  private readonly drafts = new Map<string, DraftSet>();

  constructor(private readonly data: OpenedAthleteData, private readonly newId: IdFactory) {}

  async searchExercises(query = ''): Promise<Exercise[]> {
    const [items, groups, equipment] = await Promise.all([
      this.data.exercises.list({ search: query, modality: 'strength' }),
      this.data.exercises.listMuscleGroups(),
      this.data.exercises.listEquipment(),
    ]);
    const muscleNames = new Map(unwrap(groups).map((item) => [item.id, item.name]));
    const equipmentNames = new Map(unwrap(equipment).map((item) => [item.id, item.name]));
    return unwrap(items).map((exercise) => ({
      id: exercise.id,
      name: exercise.name,
      muscleGroup: exercise.primaryMuscleGroupIds.map((id) => muscleNames.get(id)).filter(Boolean).join(', ') || 'General',
      equipment: exercise.equipmentIds.map((id) => equipmentNames.get(id)).filter(Boolean).join(', ') || null,
      origin: exercise.ownerUserId ? 'server' : 'sample',
    }));
  }

  async listRoutines(): Promise<Routine[]> {
    const plans = unwrap(await this.data.plans.listPlans());
    const routines: Routine[] = [];
    for (const plan of plans) {
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

  async startWorkout(planId?: string): Promise<string> {
    const active = unwrap(await this.data.sessions.getActive());
    if (active) return active.id;
    const startedAt = new Date().toISOString();
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
        rir: input.rir, rpe: null, restSeconds: null, durationSeconds: null, distanceMeters: null,
        completedAt: new Date().toISOString(), notes: null,
      }));
      this.drafts.delete(setId);
      return;
    }
    unwrap(await this.data.sessions.updateSet({
      setId, setType: input.isWarmup ? 'warmup' : 'working', weightKg: input.weightKg,
      reps: input.reps, rir: input.rir, completedAt: new Date().toISOString(),
    }));
    void sessionId;
  }

  async finishWorkout(sessionId: string): Promise<void> { unwrap(await this.data.sessions.complete({ sessionId, endedAt: new Date().toISOString() })); }
  async tombstoneWorkout(sessionId: string): Promise<void> { unwrap(await this.data.sessions.delete(sessionId)); }

  async getWorkout(sessionId: string): Promise<WorkoutDetail | null> {
    const result = await this.data.sessions.getDetail(sessionId);
    if (!result.ok && result.error.code === 'NOT_FOUND') return null;
    if (!result.ok) return unwrap(result);
    const detail = result.value;
    const sets = detail.exercises.flatMap((exercise) => exercise.sets);
    const volumeKg = sets.reduce((sum, set) => sum + (set.setType === 'working' ? setVolumeKg(set) ?? 0 : 0), 0);
    const workout = toWorkout(detail, detail.exercises.length, sets.filter((set) => set.completedAt !== null).length, volumeKg);
    const exercises = await Promise.all(detail.exercises.map(async (exercise) => {
      const metadata = exercise.trainingDayExerciseId
        ? await this.findPlannedExercise(detail.trainingDayId, exercise.trainingDayExerciseId)
        : null;
      const persisted: TrainingSet[] = exercise.sets.map((set, index) => ({
        id: set.id, setIndex: index, weightKg: set.weightKg, reps: set.reps, rir: set.rir, isWarmup: set.setType === 'warmup',
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
        displayedSets = [...persisted, { id: draft[0], setIndex: draft[1].setIndex, weightKg: null, reps: null, rir: null, isWarmup: false }];
      }
      return {
        id: exercise.id, exerciseId: exercise.exerciseId,
        exerciseName: unwrap(await this.data.exercises.getById(exercise.exerciseId)).name,
        sortOrder: exercise.position, setsTarget: metadata?.targetSets ?? null,
        repsTarget: metadata?.targetRepsMin ?? null, restSeconds: metadata?.targetRestSeconds ?? null,
        sets: displayedSets,
      };
    }));
    return { workout, exercises };
  }

  private async findPlannedExercise(dayId: string | null, plannedId: string) {
    if (!dayId) return null;
    const plans = unwrap(await this.data.plans.listPlans());
    for (const plan of plans) {
      const detail = unwrap(await this.data.plans.getPlan(plan.id));
      const day = detail.days.find((item) => item.id === dayId);
      const match = day?.exercises.find((item) => item.id === plannedId);
      if (match) return match;
    }
    return null;
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
    const summary = summarizeWeek(localDate(now), workoutDetails, []);
    const status = await this.data.sync.status();
    let latestWorkout: Workout | null = active ? toWorkout(active, active.exercises.length, active.exercises.reduce((n, e) => n + e.sets.length, 0), null) : null;
    if (!latestWorkout && history.items[0]) latestWorkout = toWorkout(unwrap(await this.data.sessions.getDetail(history.items[0].sessionId)), history.items[0].exerciseCount, history.items[0].workingSetCount, history.items[0].volumeKg);
    return { sessionsThisWeek: summary.completedStrengthSessions, activityMinutesThisWeek: Math.round(summary.activeSeconds / 60), pendingSyncCount: status.pendingCount, latestWorkout };
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
      return exercise.ok && record ? { exerciseName: exercise.value.name, weightKg: record.value, reps: record.reps, measuredAt: `${record.localDate}T12:00:00.000Z` } : null;
    }))).filter((item): item is NonNullable<typeof item> => item !== null);
    const measurements = await this.listBodyMeasurements();
    return {
      weeklyVolumeKg: dailyVolumeKg.reduce((sum, item) => sum + item.volumeKg, 0),
      sessionsThisMonth: history.filter((item) => item.startedAt.slice(0, 7) === today.slice(0, 7)).length,
      dailyVolumeKg, records, measurements,
    };
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
}
