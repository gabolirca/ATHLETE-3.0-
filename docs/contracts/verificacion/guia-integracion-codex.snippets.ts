// Fragmentos de docs/contracts/guia-integracion-codex.md (y del arranque de frontend-guide.md §1) compilados contra la API real.
import * as SQLite from 'expo-sqlite';
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import { getRandomBytes } from 'expo-crypto';
import { createUuidV7Generator, isLocalDatabaseError, openAthleteData, openLegacyDatabaseCopy, LegacyImportError, type OpenedAthleteData } from '@athlete/data';
import type { SyncTransport } from '@athlete/contracts';
import { SupabaseSyncTransport, type AthleteSupabaseClient } from '@athlete/data';
import { computePersonalRecords, summarizeWeek } from '@athlete/domain';

declare const accountTransport: SyncTransport;
declare const supabase: AthleteSupabaseClient;
declare const state: { user: { id: string } };
declare const backupDirectory: string;
declare const authUserId: string;
declare const name: string;
declare const exercises: Array<{ exerciseId: string; sets: number; reps: number; restSeconds: number }>;
declare const sessionExerciseId: string, sessionId: string, setId: string, trainingDayId: string, exerciseId: string, planId0: string;

export async function guide(): Promise<void> {
  // §2
  const secureStore = {
    getItem: (k: string) => SecureStore.getItemAsync(k),
    setItem: (k: string, v: string) => SecureStore.setItemAsync(k, v),
    removeItem: (k: string) => SecureStore.deleteItemAsync(k),
  };
  const data: OpenedAthleteData = await openAthleteData({
    openDatabase: (name) => SQLite.openDatabaseAsync(name),
    secureStore,
    randomBytes: getRandomBytes,
    accountTransport,
  });
  const ident: { localUserId: string; accountUserId: string | null } = data.identity;
  try { await openAthleteData({ openDatabase: (n) => SQLite.openDatabaseAsync(n), secureStore, randomBytes: getRandomBytes }); }
  catch (e) { if (isLocalDatabaseError(e)) { const rec: boolean = e.recoverable; void rec; void e.code; } }

  // §2.1
  const linked = await data.adoptLocalData(authUserId);
  await linked.sync.syncNow();

  // §2.2
  const copy = await openLegacyDatabaseCopy({
    name: 'athlete3.db',
    open: (n) => SQLite.openDatabaseAsync(n, {}, backupDirectory),
    secureStore,
  });
  try {
    const { alreadyImported, report } = await data.importLegacyStore(copy, {
      deviceTimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      sha256: (t) => Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, t),
    });
    void alreadyImported; void report.imported; void report.tombstoned; void report.enqueued; void report.quarantined; void report.skippedEmptySets; void report.checks;
  } catch (e) { if (e instanceof LegacyImportError) void e.code; }
  await copy.close();

  // §3
  await data.exercises.list({ search: 'banca' });
  await data.plans.listPlans(); await data.plans.getPlan(planId0); await data.plans.deletePlan(planId0);
  await data.sessions.startFromTrainingDay({ id: 'x', trainingDayId, startedAt: new Date().toISOString(), timeZone: 'UTC' });
  const st = await data.sessions.start({ id: 'x', startedAt: new Date().toISOString(), timeZone: 'UTC' });
  if (!st.ok && st.error.code === 'INVALID_STATE') void st.error.details?.activeSessionId;
  await data.sessions.addExercise({ id: 'x', sessionId, exerciseId });
  await data.sessions.logSet({ id: 'x', sessionExerciseId, setType: 'working', weightKg: 100, reps: 5, rir: 0, completedAt: new Date().toISOString() });
  await data.sessions.updateSet({ setId, reps: 6, rir: null });
  await data.sessions.complete({ sessionId, endedAt: new Date().toISOString() });
  await data.sessions.discard({ sessionId }); await data.sessions.delete(sessionId);
  await data.sessions.getDetail(sessionId); await data.sessions.getActive();
  const h = await data.sessions.listHistory({}, { limit: 20 }); if (h.ok) void h.value.nextCursor;
  void summarizeWeek; void computePersonalRecords;
  await data.body.logWeight({ id: 'x', measuredAt: new Date().toISOString(), timeZone: 'UTC', value: 80, inputUnit: 'kg' });
  await data.body.logMeasurement({ id: 'x', measuredAt: new Date().toISOString(), timeZone: 'UTC', site: 'hips', value: 90, inputUnit: 'cm' });
  await data.profile.get(); await data.profile.initialize('UTC'); await data.profile.update({ sports: ['strength', 'running'] });
  const s = await data.sync.status(); void s.pendingCount; void s.conflictCount; void s.rejectedCount;

  // §4 (ids: generador propio de la app)
  const ids = createUuidV7Generator(getRandomBytes);
  const planId = ids.newId(), dayId = ids.newId();
  await data.plans.createPlan({ id: planId, name, description: null, status: 'active', startsOn: null, endsOn: null });
  await data.plans.addDay({ id: dayId, planId, position: 0, name, kind: 'training', notes: null });
  for (const [i, e] of exercises.entries()) {
    await data.plans.addDayExercise({ id: ids.newId(), trainingDayId: dayId, exerciseId: e.exerciseId, position: i,
      targetSets: e.sets, targetRepsMin: e.reps, targetRepsMax: e.reps, targetRestSeconds: e.restSeconds,
      targetRir: null, targetWeightKg: null, targetDurationSeconds: null, targetDistanceMeters: null, notes: null });
  }
  // §6
  const c = await data.sync.listConflicts();
  if (c[0]) await data.sync.resolveConflict(c[0].mutation.mutationId, 'keep_local');
  void ident;
}

// frontend-guide.md §1
export async function frontendGuideStartup(): Promise<void> {
  let data = await openAthleteData({
    openDatabase: (name) => SQLite.openDatabaseAsync(name),
    secureStore: { getItem: SecureStore.getItemAsync, setItem: SecureStore.setItemAsync, removeItem: SecureStore.deleteItemAsync },
    randomBytes: getRandomBytes,
    accountTransport: new SupabaseSyncTransport(supabase),
  });
  const ids = createUuidV7Generator(getRandomBytes);
  void ids;
  await data.profile.initialize(Intl.DateTimeFormat().resolvedOptions().timeZone);
  if (data.identity.accountUserId === null) data = await data.adoptLocalData(state.user.id);
  await data.sync.syncNow();
}
