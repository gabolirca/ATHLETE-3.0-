import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { CATALOG_EXERCISE_ID } from '../../src/catalog/bundled';
import { LEGACY_OWNER_KEY } from '../../src/identity';
import { LegacyImportError } from '../../src/legacy/codex-v1';
import { LocalStore } from '../../src/local/store';
import { LEGACY_DATABASE_KEY_NAME, openAthleteData, openLegacyDatabaseCopy, type OpenedAthleteData } from '../../src/open';
import { fromExpoSqlite } from '../../src/sql/expo-sqlite';
import { SerializedDatabase, type SqlDatabase } from '../../src/sql/types';
import { createCodexV1, L } from '../fixtures/codex-v1';
import {
  FakeCipherDatabase, MemorySecureStore, TestClock, cipherDisk, cipherOpener, expectOk, fileSha256, newId, randomBytesSync, sha256, tempDir,
} from '../support';

let tmp: ReturnType<typeof tempDir>;
let secure: MemorySecureStore;
let clock: TestClock;

beforeEach(() => {
  tmp = tempDir();
  secure = new MemorySecureStore();
  secure.items.set(LEGACY_OWNER_KEY, `device:${L.owner}`); // la app anterior ya tenía este identificador
  clock = new TestClock(Date.parse('2026-11-04T12:00:00Z'));
});
afterEach(() => { vi.restoreAllMocks(); tmp.cleanup(); });

const openStore = () => openAthleteData({ openDatabase: cipherOpener(tmp.dir).open, secureStore: secure, randomBytes: randomBytesSync, clock });
const IMPORT = { deviceTimeZone: 'UTC', sha256 };

/** Base heredada en claro + copia; la copia se abre en solo lectura y registra cada sentencia. */
async function legacyCopy(options: Parameters<typeof createCodexV1>[1] = {}) {
  const original = join(tmp.dir, `legacy-${newId()}.db`);
  const setup = new DatabaseSync(original);
  const db = new SerializedDatabase({
    exec: async (s) => { setup.exec(s); },
    run: async (s, p) => ({ changes: Number(setup.prepare(s).run(...p).changes) }),
    all: async (s, p) => setup.prepare(s).all(...p) as never,
    close: async () => setup.close(),
  });
  await createCodexV1(db, options);
  await db.close();
  const copy = `${original}.copy`;
  copyFileSync(original, copy);
  const reader = new DatabaseSync(copy, { readOnly: true });
  const statements: string[] = [];
  const legacy: SqlDatabase = new SerializedDatabase({
    exec: async (s) => { statements.push(s); reader.exec(s); },
    run: async (s, p) => { statements.push(s); return { changes: Number(reader.prepare(s).run(...p).changes) }; },
    all: async (s, p) => { statements.push(s); return reader.prepare(s).all(...p) as never; },
    close: async () => reader.close(),
  });
  return { legacy, statements, original, copy, originalSha: fileSha256(original), copySha: fileSha256(copy) };
}

async function rawCount(d: OpenedAthleteData, sql: string): Promise<number> {
  const rows = await (d as unknown as { sync: { store: LocalStore } }).sync.store.db.all<{ n: number }>(sql);
  return Number(rows[0]?.n ?? 0);
}

describe('importador de la capa anterior (codex-mobile v1)', () => {
  it('importa, transforma, pone en cuarentena lo inválido, verifica y no escribe en el origen', async () => {
    const src = await legacyCopy();
    const d = await openStore();
    expect(d.identity.localUserId).toBe(L.owner);
    const { alreadyImported, report } = await d.importLegacyStore(src.legacy, IMPORT);

    expect(alreadyImported).toBe(false);
    expect(report.imported).toEqual({
      training_plan: 2, training_day: 2, training_day_exercise: 3, workout_session: 3, session_exercise: 4,
      strength_set: 6, body_weight: 2, body_measurement: 1, profile: 1,
    });
    expect(report.tombstoned).toBe(7);
    expect(report.enqueued).toBe(17);
    expect(report.skippedEmptySets).toBe(2);
    expect(report.unlinkedSessionTargets).toBe(0);
    expect(report.quarantined).toEqual({ unmapped_exercise: 2, other_owner: 1, contract_validation: 2, preferred_sport_needs_choice: 1 });
    expect(report.checks).toEqual({ setCount: 6, rirCount: 5, volumeKg: 2450.3 });

    // Origen intacto: solo lecturas sobre la copia y ningún archivo modificado.
    expect(src.statements.every((s) => /^\s*(SELECT|PRAGMA user_version)/i.test(s))).toBe(true);
    expect(fileSha256(src.original)).toBe(src.originalSha);
    expect(fileSha256(src.copy)).toBe(src.copySha);

    // Valores: RIR 0 conservado, peso redondeado a 2 decimales, calentamiento, enlace al plan.
    const done = expectOk(await d.sessions.getDetail(L.sessionDone));
    expect(done.status).toBe('completed');
    expect(done.localDate).toBe('2026-11-02'); // 04:30 UTC → día anterior en America/Mexico_City (zona de las preferencias)
    expect(done.timeZone).toBe('America/Mexico_City');
    const squat = done.exercises.find((e) => e.id === L.seSquat)!;
    expect(squat.exerciseId).toBe(CATALOG_EXERCISE_ID['back-squat']);
    expect(squat.trainingDayExerciseId).toBe(L.reSquat);
    expect(squat.sets.map((s) => [s.setType, s.weightKg, s.reps, s.rir])).toEqual([['warmup', 60, 8, null], ['working', 102.06, 5, 2], ['working', 100, 4, 0]]);
    expect(done.exercises.find((e) => e.id === L.seRow)?.exerciseId).toBe(CATALOG_EXERCISE_ID['seated-cable-row']);

    // Rutina → plan con un día y objetivos.
    const plan = expectOk(await d.plans.getPlan(L.routineA));
    expect(plan.days[0]?.exercises.map((e) => [e.id, e.targetSets, e.targetRepsMin, e.targetRepsMax, e.targetRestSeconds]))
      .toEqual([[L.reSquat, 3, 5, 5, 180], [L.reRow, 3, 10, 10, 90]]);
    expect(expectOk(await d.plans.listPlans()).map((p) => p.id)).toEqual([L.routineA]); // la eliminada no aparece

    // Sesión en curso recuperable; eliminada no visible; perfil desde preferencias, sin inventar disciplinas.
    expect(expectOk(await d.sessions.getActive())?.id).toBe(L.sessionActive);
    expect(codeOf(await d.sessions.getDetail(L.sessionDeleted))).toBe('NOT_FOUND');
    expect(expectOk(await d.profile.get())).toMatchObject({ id: L.owner, displayName: 'Gabo', sports: [], timeZone: 'America/Mexico_City' });
    const store = (d as unknown as { sync: { store: LocalStore } }).sync.store;
    expect(await store.db.all('SELECT id, weight_kg, deleted_at IS NOT NULL AS deleted FROM body_weights ORDER BY weight_kg'))
      .toEqual([{ id: L.bw, weight_kg: 81.235, deleted: 0 }, { id: L.bwDeleted, weight_kg: 82, deleted: 1 }]);
    expect(await store.db.all('SELECT site, value_cm FROM body_measurements')).toEqual([{ site: 'waist', value_cm: 84.46 }]);

    // Outbox: padres antes que hijos.
    const order = (await (d as unknown as { sync: { store: LocalStore } }).sync.store.db.all<{ entity: string }>('SELECT entity FROM outbox ORDER BY seq')).map((r) => r.entity);
    const first = (e: string) => order.indexOf(e);
    expect(first('training_plan')).toBeLessThan(first('training_day'));
    expect(first('training_day')).toBeLessThan(first('training_day_exercise'));
    expect(first('workout_session')).toBeLessThan(first('session_exercise'));
    expect(first('session_exercise')).toBeLessThan(first('strength_set'));
    expect(order).toHaveLength(17);
    await d.close();
  });

  it('es idempotente y rechaza una segunda base distinta sin escribir', async () => {
    const d = await openStore();
    const first = await d.importLegacyStore((await legacyCopy()).legacy, IMPORT);
    const outbox = await rawCount(d, 'SELECT COUNT(*) AS n FROM outbox');
    const again = await d.importLegacyStore((await legacyCopy()).legacy, IMPORT);
    expect(again).toEqual({ alreadyImported: true, report: first.report });
    expect(await rawCount(d, 'SELECT COUNT(*) AS n FROM outbox')).toBe(outbox);

    const other = await d.importLegacyStore((await legacyCopy({ preferredSport: 'strength' })).legacy, IMPORT).then(() => null, (e: unknown) => e);
    expect(other).toBeInstanceOf(LegacyImportError);
    expect(other).toMatchObject({ code: 'already-imported-different-source' });
    expect(await rawCount(d, 'SELECT COUNT(*) AS n FROM outbox')).toBe(outbox);
    await d.close();
  });

  it.each([
    ['outbox heredada ya enviada', { outboxStatus: 'acked' }],
    ['registro con versión de servidor', { serverVersion: 3 }],
  ])('precondición fallida (%s): legacy-already-synced y el almacén queda intacto', async (_, opts) => {
    const d = await openStore();
    const before = await rawCount(d, 'SELECT COUNT(*) AS n FROM outbox');
    const e = await d.importLegacyStore((await legacyCopy(opts)).legacy, IMPORT).then(() => null, (x: unknown) => x);
    expect(e).toMatchObject({ code: 'legacy-already-synced' });
    expect(await rawCount(d, 'SELECT COUNT(*) AS n FROM outbox')).toBe(before);
    expect(await rawCount(d, 'SELECT COUNT(*) AS n FROM workout_sessions')).toBe(0);
    await d.close();
  });

  it('si la verificación falla, ROLLBACK completo: ni filas, ni mutaciones, ni cuarentena, ni estado', async () => {
    const d = await openStore();
    const real = LocalStore.prototype.importRecord;
    vi.spyOn(LocalStore.prototype, 'importRecord').mockImplementation(async function (this: LocalStore, tx, entity, row, o) {
      if (row.id === L.setRir0) return; // fallo silencioso simulado en una escritura
      return real.call(this, tx, entity, row, o);
    });
    const e = await d.importLegacyStore((await legacyCopy()).legacy, IMPORT).then(() => null, (x: unknown) => x);
    expect(e).toMatchObject({ code: 'verification-failed' });
    for (const t of ['training_plans', 'workout_sessions', 'strength_sets', 'body_weights', 'outbox', 'legacy_quarantine']) {
      expect([t, await rawCount(d, `SELECT COUNT(*) AS n FROM ${t}`)]).toEqual([t, 0]);
    }
    expect(await rawCount(d, "SELECT COUNT(*) AS n FROM sync_state WHERE key = 'legacy_import'")).toBe(0);
    vi.restoreAllMocks();
    expect((await d.importLegacyStore((await legacyCopy()).legacy, IMPORT)).alreadyImported).toBe(false); // reintento limpio
    await d.close();
  });

  it('respeta "una sesión en curso": si el almacén ya tiene una, la heredada va a cuarentena', async () => {
    const d = await openStore();
    expectOk(await d.sessions.start({ id: newId(), startedAt: clock.now(), timeZone: 'UTC' }));
    const { report } = await d.importLegacyStore((await legacyCopy()).legacy, IMPORT);
    expect(report.quarantined.active_session_conflict).toBe(1);
    expect(report.imported.workout_session).toBe(2);
    await d.close();
  });

  it('después de importar, el ciclo sigue: continuar la sesión en curso, finalizar, historial, reabrir', async () => {
    let d = await openStore();
    await d.importLegacyStore((await legacyCopy()).legacy, IMPORT);
    expectOk(await d.sessions.logSet({ id: newId(), sessionExerciseId: L.seActive, weightKg: 72.5, reps: 8, rir: 0, completedAt: clock.now() }));
    clock.advance(60_000);
    expectOk(await d.sessions.complete({ sessionId: L.sessionActive, endedAt: clock.now() }));
    await d.close();
    d = await openStore();
    expect(expectOk(await d.sessions.listHistory({})).items.map((h) => h.sessionId)).toEqual([L.sessionActive, L.sessionDone]);
    expect(expectOk(await d.sessions.getDetail(L.sessionActive)).exercises[0]?.sets.map((s) => s.rir)).toEqual([1, 0]);
    await d.close();
  });

  it('extremo a extremo cifrado: copia de la base heredada abierta con su clave original, sin crear claves', async () => {
    // Base heredada cifrada con la clave de la capa anterior.
    const legacyKey = 'd'.repeat(64);
    secure.items.set(LEGACY_DATABASE_KEY_NAME, legacyKey);
    const appDir = join(tmp.dir, 'app');
    const backupDir = join(tmp.dir, 'backups', 'legacy-1');
    mkdirSync(appDir, { recursive: true });
    mkdirSync(backupDir, { recursive: true });
    const legacyRaw = new FakeCipherDatabase(join(appDir, 'athlete3.db'));
    const legacy = await fromExpoSqlite(legacyRaw, { encryptionKey: legacyKey });
    await createCodexV1(legacy);
    await legacy.close();
    for (const suffix of ['', '-wal', '-shm']) {
      const from = join(appDir, `athlete3.db${suffix}`);
      if (existsSync(from)) copyFileSync(from, join(backupDir, `athlete3.db${suffix}`));
    }
    cipherDisk.set(join(backupDir, 'athlete3.db'), cipherDisk.get(join(appDir, 'athlete3.db')) ?? null);
    const originalSha = fileSha256(join(appDir, 'athlete3.db'));
    const secretsBefore = new Map(secure.items);

    const copy = await openLegacyDatabaseCopy({ name: 'athlete3.db', open: async (n) => new FakeCipherDatabase(join(backupDir, n)), secureStore: secure });
    const d = await openStore();
    const { report } = await d.importLegacyStore(copy, IMPORT);
    await copy.close();
    expect(report.imported.strength_set).toBe(6);
    expect(fileSha256(join(appDir, 'athlete3.db'))).toBe(originalSha);
    // Solo se añadieron la identidad y la clave de la base nueva; la clave heredada no cambió.
    expect(secure.items.get(LEGACY_DATABASE_KEY_NAME)).toBe(legacyKey);
    expect([...secure.items.keys()].filter((k) => !secretsBefore.has(k)).sort()).toEqual(
      ['athlete3.identity.v1', `athlete3.sqlcipher-key.athlete3-${L.owner}.db.v1`]);
    await d.close();
  });
});

function codeOf(r: { ok: boolean; error?: { code: string } }) {
  return r.ok ? null : r.error!.code;
}
