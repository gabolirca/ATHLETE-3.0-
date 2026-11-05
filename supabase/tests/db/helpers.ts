import { randomUUID } from 'node:crypto';
import pg from 'pg';

/**
 * Conexión SOLO local. La suite se niega a ejecutarse contra hosts remotos.
 * Por defecto apunta a la base creada por `harness/reset-local-db.sh`.
 * Con `supabase start` (Docker) usar: postgresql://postgres:postgres@127.0.0.1:54322/postgres
 */
export const DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgresql://postgres@127.0.0.1:54329/athlete3_test';

const host = new URL(DATABASE_URL).hostname;
if (!['127.0.0.1', 'localhost', '::1', '[::1]'].includes(host)) {
  throw new Error(`Rechazado: TEST_DATABASE_URL debe ser local (host=${host})`);
}

export const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 6 });

export type Db = pg.PoolClient;

export const uuid = () => randomUUID();

/** Crea un usuario en auth.users como administrador (equivalente a registrarse en Supabase Auth). */
export async function createUser(): Promise<string> {
  const id = uuid();
  await pool.query('insert into auth.users (id, email) values ($1, $2)', [id, `${id}@test.local`]);
  return id;
}

async function withRole<T>(role: 'authenticated' | 'anon', claims: Record<string, unknown> | null, fn: (db: Db) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query(`set local role ${role}`);
    if (claims) await client.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify(claims)]);
    const result = await fn(client);
    await client.query('commit');
    return result;
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

/** Ejecuta como el rol `authenticated` con el JWT de `userId` (lo que hace PostgREST tras verificar el token). */
export const asUser = <T>(userId: string, fn: (db: Db) => Promise<T>) =>
  withRole('authenticated', { sub: userId, role: 'authenticated' }, fn);

/** Rol authenticated pero SIN claims (token ausente o no verificado). */
export const asAuthenticatedWithoutClaims = <T>(fn: (db: Db) => Promise<T>) => withRole('authenticated', null, fn);

export const asAnon = <T>(fn: (db: Db) => Promise<T>) => withRole('anon', { role: 'anon' }, fn);

/** Captura el error de Postgres de una operación que debe fallar. */
export async function pgError(promise: Promise<unknown>): Promise<{ code: string; message: string }> {
  try {
    await promise;
  } catch (error) {
    const e = error as { code?: string; message?: string };
    return { code: e.code ?? '', message: e.message ?? '' };
  }
  throw new Error('Se esperaba un error de base de datos');
}

// ---------- Sync ----------

export type Mutation = {
  mutationId: string;
  deviceId: string;
  entity: string;
  entityId: string;
  op: 'upsert' | 'delete';
  baseRevision: number | null;
  payload: Record<string, unknown> | null;
  clientRecordedAt: string;
};

export const DEVICE = uuid();

export function upsert(entity: string, entityId: string, payload: Record<string, unknown>, baseRevision: number | null = null, deviceId = DEVICE): Mutation {
  return { mutationId: uuid(), deviceId, entity, entityId, op: 'upsert', baseRevision, payload, clientRecordedAt: new Date().toISOString() };
}

export function del(entity: string, entityId: string, baseRevision: number | null, deviceId = DEVICE): Mutation {
  return { mutationId: uuid(), deviceId, entity, entityId, op: 'delete', baseRevision, payload: null, clientRecordedAt: new Date().toISOString() };
}

export type MutationResult =
  | { status: 'applied' | 'duplicate'; mutationId: string; revision: number }
  | { status: 'conflict'; mutationId: string; serverRevision: number; serverDeleted: boolean; serverRecord: Record<string, unknown> | null }
  | { status: 'rejected'; mutationId: string; error: { code: string; message: string; retryable: boolean; details?: Record<string, unknown> } };

export async function push(db: Db, mutations: Mutation[], deviceId = DEVICE): Promise<MutationResult[]> {
  const { rows } = await db.query('select athlete3.sync_push($1, $2::jsonb) as r', [deviceId, JSON.stringify(mutations)]);
  return rows[0].r.results;
}

export type PullResponse = {
  changes: Array<{ entity: string; entityId: string; revision: number; deleted: boolean; record: Record<string, unknown> | null; lastMutationId: string | null }>;
  nextCursor: string;
  hasMore: boolean;
};

export async function pull(db: Db, cursor: string | null = null, limit = 200): Promise<PullResponse> {
  const { rows } = await db.query('select athlete3.sync_pull($1, $2) as r', [cursor, limit]);
  return rows[0].r;
}

// ---------- Datos de ejemplo ----------

export const SQUAT = '30000000-0000-4000-8000-000000000001';
export const TZ = 'America/Mexico_City';

export const sessionPayload = (overrides: Record<string, unknown> = {}) => ({
  status: 'in_progress',
  started_at: '2026-11-03T22:30:00-06:00',
  time_zone: TZ,
  local_date: '2026-11-03',
  source: 'manual',
  ...overrides,
});

/** Crea sesión + ejercicio + serie vía sync y devuelve sus ids. */
export async function seedSession(userId: string) {
  const ids = { session: uuid(), sessionExercise: uuid(), set: uuid() };
  const results = await asUser(userId, (db) =>
    push(db, [
      upsert('workout_session', ids.session, sessionPayload()),
      upsert('session_exercise', ids.sessionExercise, { session_id: ids.session, exercise_id: SQUAT, position: 0 }),
      upsert('strength_set', ids.set, {
        session_exercise_id: ids.sessionExercise, position: 0, set_type: 'working',
        weight_kg: 100, reps: 5, rir: 2, completed_at: '2026-11-04T04:40:00Z',
      }),
    ]),
  );
  if (!results.every((r) => r.status === 'applied')) throw new Error(`seed falló: ${JSON.stringify(results)}`);
  return ids;
}
