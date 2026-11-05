import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { SQLiteDatabase } from 'expo-sqlite';
import { initializeAthleteDatabaseSchema } from './database';
import { SQLiteTrainingRepository } from './SQLiteTrainingRepository';

jest.mock('expo-crypto', () => ({ randomUUID: () => jest.requireActual<typeof import('node:crypto')>('node:crypto').randomUUID() }));

class NodeSQLiteAdapter {
  constructor(private readonly native: DatabaseSync) {}
  async execAsync(sql: string) { this.native.exec(sql); }
  async runAsync(sql: string, ...values: Array<string | number | null>) { return this.native.prepare(sql).run(...values); }
  async getFirstAsync<T>(sql: string, ...values: Array<string | number | null>): Promise<T | null> { return (this.native.prepare(sql).get(...values) as T | undefined) ?? null; }
  async getAllAsync<T>(sql: string, ...values: Array<string | number | null>): Promise<T[]> { return this.native.prepare(sql).all(...values) as T[]; }
  async withTransactionAsync(task: () => Promise<void>) {
    this.native.exec('BEGIN IMMEDIATE');
    try { await task(); this.native.exec('COMMIT'); }
    catch (error) { this.native.exec('ROLLBACK'); throw error; }
  }
  close() { this.native.close(); }
}

describe('SQLiteTrainingRepository', () => {
  let directory: string;
  let databasePath: string;
  let native: DatabaseSync;
  let db: NodeSQLiteAdapter;
  let repository: SQLiteTrainingRepository;

  async function open(owner = 'account-a') {
    native = new DatabaseSync(databasePath);
    db = new NodeSQLiteAdapter(native);
    await initializeAthleteDatabaseSchema(db as unknown as SQLiteDatabase);
    repository = new SQLiteTrainingRepository(db as unknown as SQLiteDatabase, owner);
  }

  beforeEach(async () => {
    directory = mkdtempSync(path.join(tmpdir(), 'athlete-mobile-'));
    databasePath = path.join(directory, 'training.sqlite');
    await open();
  });
  afterEach(() => { db?.close(); rmSync(directory, { recursive: true, force: true }); });

  test('creates a routine, starts and completes an offline workout, then reads its saved history', async () => {
    const exercises = await repository.searchExercises('banca');
    expect(exercises).toHaveLength(1);
    expect(exercises[0].origin).toBe('sample');

    const routineId = await repository.createRoutine({ name: 'Torso A', exercises: [{ exerciseId: exercises[0].id, sets: 2, reps: 8, restSeconds: 90 }] });
    const [routine] = await repository.listRoutines();
    expect(routine.id).toBe(routineId);
    expect(routine.exercises[0].sets).toBe(2);

    const workoutId = await repository.startWorkout(routineId);
    const active = await repository.getWorkout(workoutId);
    expect(active?.workout.state).toBe('active');
    expect(active?.exercises[0].sets).toHaveLength(2);

    const firstSet = active!.exercises[0].sets[0];
    await repository.saveSet(workoutId, firstSet.id, { weightKg: 60, reps: 8, rir: 2, isWarmup: false });
    await repository.finishWorkout(workoutId);
    const history = await repository.listHistory();
    expect(history).toHaveLength(1);
    expect(history[0].setCount).toBe(1);
    expect(history[0].syncStatus).toBe('pending');
    expect((await repository.getWorkout(workoutId))?.exercises[0].sets[0].rir).toBe(2);
  });

  test('persists active sessions and outbox keys across a database reopen, and retries interrupted sync rows', async () => {
    const [exercise] = await repository.searchExercises();
    const sessionId = await repository.startWorkout();
    await repository.addExercise(sessionId, exercise.id);
    const before = await repository.listOutbox();
    expect(new Set(before.map((operation) => operation.clientMutationId)).size).toBe(before.length);
    await db.runAsync("UPDATE sync_outbox SET status = 'syncing' WHERE id = ?", before[0].id);
    db.close();

    await open();
    expect((await repository.getWorkout(sessionId))?.workout.state).toBe('active');
    const after = await repository.listOutbox();
    expect(after.map((operation) => operation.clientMutationId)).toEqual(before.map((operation) => operation.clientMutationId));
    expect(after[0].status).toBe('pending');
    expect(await repository.startWorkout()).toBe(sessionId);
  });

  test('records offline sync failures and retries with the same idempotency key', async () => {
    const [exercise] = await repository.searchExercises();
    const sessionId = await repository.startWorkout();
    await repository.addExercise(sessionId, exercise.id);
    const [operation] = await repository.listOutbox();

    const firstAttempt = await repository.markOutboxSyncing(operation.id);
    expect(firstAttempt?.status).toBe('syncing');
    expect(await repository.markOutboxSyncing(operation.id)).toBeNull();
    await repository.markOutboxFailed(operation.id, 'NETWORK_UNAVAILABLE');

    const [retry] = await repository.listOutbox();
    expect(retry.clientMutationId).toBe(operation.clientMutationId);
    expect(retry.attemptCount).toBe(1);
    expect((await repository.markOutboxSyncing(operation.id))?.status).toBe('syncing');
  });

  test('does not let an old server acknowledgement mark newer local edits as synced', async () => {
    const [exercise] = await repository.searchExercises();
    const sessionId = await repository.startWorkout();
    await repository.addExercise(sessionId, exercise.id);
    const operations = await repository.listOutbox();
    await repository.markOutboxAcknowledged(operations[0].id, 1);
    expect((await repository.getWorkout(sessionId))?.workout.syncStatus).toBe('pending');
    await repository.markOutboxConflict(operations[1].id, JSON.stringify({ version: 3, state: 'remote-copy' }), 3);
    const local = await repository.getWorkout(sessionId);
    expect(local?.workout.syncStatus).toBe('conflict');
    expect(local?.exercises).toHaveLength(1);
    const conflicts = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) AS count FROM sync_conflicts');
    expect(conflicts?.count).toBe(1);
  });

  test('keeps records isolated by local owner and writes a tombstone instead of deleting a session', async () => {
    const [exercise] = await repository.searchExercises();
    const sessionId = await repository.startWorkout();
    await repository.addExercise(sessionId, exercise.id);
    const detail = await repository.getWorkout(sessionId);
    await repository.saveSet(sessionId, detail!.exercises[0].sets[0].id, { weightKg: 20, reps: 10, rir: null, isWarmup: false });
    await repository.finishWorkout(sessionId);
    await repository.tombstoneWorkout(sessionId);
    expect(await repository.listHistory()).toHaveLength(0);
    const tombstone = await db.getFirstAsync<{ operation: string }>("SELECT operation FROM sync_outbox WHERE aggregate_id = ? AND operation = 'tombstone' LIMIT 1", sessionId);
    expect(tombstone?.operation).toBe('tombstone');
    const otherOwner = new SQLiteTrainingRepository(db as unknown as SQLiteDatabase, 'account-b');
    expect(await otherOwner.listHistory()).toHaveLength(0);
    expect(await otherOwner.getWorkout(sessionId)).toBeNull();
  });

  test('stores local body measurements and computes volume only from recorded non-warmup sets', async () => {
    await repository.addBodyMeasurement({ type: 'weight_kg', value: 74.2, measuredAt: new Date().toISOString() });
    expect((await repository.listBodyMeasurements())[0].value).toBe(74.2);
    await expect(repository.addBodyMeasurement({ type: 'weight_kg', value: -1, measuredAt: new Date().toISOString() })).rejects.toThrow();
    const progress = await repository.getProgress();
    expect(progress.measurements).toHaveLength(1);
    expect(progress.weeklyVolumeKg).toBe(0);
  });
});
