import type { CardioSession } from '@athlete/contracts';
import type { OpenedAthleteData } from '@athlete/data';
import type { CardioDraft } from '@/cardio/cardioForm';
import type { TrainingRepository } from './TrainingRepository';
import { computePersonalRecords, diagnoseWeeklyVolume, isEffectiveSet, newRecordsInSession, setVolumeKg, summarizeWeek, weeklySetsByMuscle, type ExerciseMuscles } from '@athlete/domain';
import type { BodyMeasurementInput, LocalAthletePreferencesInput, LoggedSetInput, RoutineInput } from './trainingSchemas';
import type { BodyMeasurement, CardioEntry, Exercise, ExerciseRecord, LocalAthletePreferences, PreviousPerformance, ProgressSummary, Routine, SessionRecord, WeeklyMuscleVolume, TrainingOverview, Workout, WorkoutDetail, TrainingSet } from './trainingTypes';

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

  async searchExercises(query = ''): Promise<Exercise[]> {
    const [items, groups, equipment] = await Promise.all([
      this.data.exercises.list({ search: query, modality: 'strength' }),
      this.data.exercises.listMuscleGroups(),
      this.data.exercises.listEquipment(),
    ]);
    const muscleNames = new Map(unwrap(groups).map((item) => [item.id, item.name]));
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
        muscles, equipmentList, tier: exercise.accessTier, isCustom: exercise.ownerUserId !== null, mechanics: exercise.mechanics,
      };
    });
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
        rir: input.rir, rpe: null, restSeconds: null, durationSeconds: null, distanceMeters: null,
        completedAt: await this.setCompletionTime(sessionId), notes: null,
      }));
      this.drafts.delete(setId);
      return;
    }
    unwrap(await this.data.sessions.updateSet({
      setId, setType: input.isWarmup ? 'warmup' : 'working', weightKg: input.weightKg,
      reps: input.reps, rir: input.rir, completedAt: await this.setCompletionTime(sessionId),
    }));
  }

  /** Hora de una serie: ahora, salvo en un entrenamiento pasado, donde se usa su hora de inicio (no la de hoy). */
  private async setCompletionTime(sessionId: string): Promise<string> {
    const now = new Date();
    const startedAt = unwrap(await this.data.sessions.getDetail(sessionId)).startedAt;
    return isPastWorkout(startedAt, now) ? startedAt : now.toISOString();
  }

  async finishWorkout(sessionId: string, options: { durationMinutes?: number } = {}): Promise<void> {
    const now = new Date();
    const { startedAt } = unwrap(await this.data.sessions.getDetail(sessionId));
    let endedAt = now.toISOString();
    if (isPastWorkout(startedAt, now)) {
      const minutes = options.durationMinutes;
      if (minutes === undefined || !Number.isInteger(minutes) || minutes < 1 || minutes > 600) throw new Error('WORKOUT_DURATION_REQUIRED');
      endedAt = new Date(Math.min(Date.parse(startedAt) + minutes * 60_000, now.getTime())).toISOString();
    }
    unwrap(await this.data.sessions.complete({ sessionId, endedAt }));
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
    const exercises = await Promise.all(detail.exercises.map(async (exercise) => {
      const catalog = unwrap(await this.data.exercises.getById(exercise.exerciseId));
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
        exerciseName: catalog.name,
        incrementKg: loadIncrementKg(catalog.loadType, catalog.equipmentIds.map((id) => equipmentSlug.get(id) ?? '')),
        sortOrder: exercise.position, setsTarget: metadata?.targetSets ?? null,
        repsTarget: metadata?.targetRepsMin ?? null, restSeconds: metadata?.targetRestSeconds ?? null, targetRir: metadata?.targetRir ?? null,
        sets: displayedSets,
        ...(await this.exerciseHistory(exercise.exerciseId, sessionId, persisted.length > 0)),
      };
    }));
    return { workout, exercises };
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
