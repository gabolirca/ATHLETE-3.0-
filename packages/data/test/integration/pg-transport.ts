import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { PullResponse, PushResponse, appError, err, ok, type CatalogSnapshot, type PullRequest, type PushRequest, type Result, type SyncTransport } from '@athlete/contracts';
import { fromSupabaseError } from '../../src/supabase/errors';

export const DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'postgresql://postgres@127.0.0.1:54329/athlete3_test';
if (!['127.0.0.1', 'localhost', '::1'].includes(new URL(DATABASE_URL).hostname)) throw new Error('TEST_DATABASE_URL debe ser local');

export const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 4 });

export async function createUser(): Promise<string> {
  const id = randomUUID();
  await pool.query('insert into auth.users (id, email) values ($1, $2)', [id, `${id}@test.local`]);
  return id;
}

/**
 * Transporte de prueba que ejecuta las mismas RPC que `SupabaseSyncTransport`, con la identidad
 * del usuario fijada como lo hace PostgREST tras verificar el JWT (rol authenticated + claims).
 */
export class PgTransport implements SyncTransport {
  online = true;
  /** Aplica en el servidor pero "pierde" la respuesta (corte de red tras el commit). */
  loseNextPushResponse = false;
  pushCalls = 0;

  constructor(private readonly userId: string) {}

  private async rpc(sql: string, params: unknown[]): Promise<Result<unknown>> {
    if (!this.online) return err(appError('NETWORK_UNAVAILABLE', 'offline'));
    const c = await pool.connect();
    try {
      await c.query('begin');
      await c.query('set local role authenticated');
      await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: this.userId, role: 'authenticated' })]);
      const { rows } = await c.query(sql, params);
      await c.query('commit');
      return ok(rows[0].r);
    } catch (e) {
      await c.query('rollback').catch(() => undefined);
      return err(fromSupabaseError(e as { message?: string; code?: string }));
    } finally {
      c.release();
    }
  }

  async push(req: PushRequest) {
    this.pushCalls++;
    const r = await this.rpc('select athlete3.sync_push($1, $2::jsonb) as r', [req.deviceId, JSON.stringify(req.mutations)]);
    if (this.loseNextPushResponse) {
      this.loseNextPushResponse = false;
      return err<PushResponse>(appError('NETWORK_UNAVAILABLE', 'respuesta perdida'));
    }
    return r.ok ? ok(PushResponse.parse(r.value)) : (r as Result<never>);
  }

  async pull(req: PullRequest) {
    const r = await this.rpc('select athlete3.sync_pull($1, $2) as r', [req.cursor, req.limit ?? 200]);
    return r.ok ? ok(PullResponse.parse(r.value)) : (r as Result<never>);
  }

  async pullCatalog() {
    const r = await this.rpc('select athlete3.catalog_snapshot() as r', []);
    return r.ok ? ok(r.value as CatalogSnapshot) : (r as Result<never>);
  }
}
