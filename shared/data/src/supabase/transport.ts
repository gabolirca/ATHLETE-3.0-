import {
  Equipment,
  MuscleGroup,
  PullRequest,
  PullResponse,
  PushRequest,
  PushResponse,
  appError,
  err,
  ok,
  type CatalogSnapshot,
  type Result,
  type SyncTransport,
} from '@athlete/contracts';
import { z } from 'zod';
import { fromSupabaseError, type SupabaseErrorLike } from './errors';

/** Subconjunto de `SupabaseClient` que usa el transporte (solo RPC en el esquema athlete3). */
export interface RpcClientLike {
  rpc(fn: string, args?: Record<string, unknown>): PromiseLike<{ data: unknown; error: SupabaseErrorLike | null }>;
}

const CatalogSnapshotSchema = z.object({
  muscleGroups: z.array(MuscleGroup),
  equipment: z.array(Equipment),
  exercises: z.array(z.record(z.string(), z.unknown())),
});

/**
 * Transporte de sync sobre las RPC `athlete3.sync_push`, `athlete3.sync_pull` y `athlete3.catalog_snapshot`.
 * El cliente debe crearse con `db.schema = 'athlete3'` (ver `createAthleteSupabaseClient`).
 * Valida petición y respuesta con Zod: una respuesta inesperada nunca llega a SQLite.
 */
export class SupabaseSyncTransport implements SyncTransport {
  constructor(private readonly client: RpcClientLike) {}

  private async call<T>(fn: string, args: Record<string, unknown> | undefined, schema: z.ZodType<T>): Promise<Result<T>> {
    let response: { data: unknown; error: SupabaseErrorLike | null };
    try {
      response = await this.client.rpc(fn, args);
    } catch (e) {
      return err(fromSupabaseError({ message: e instanceof Error ? e.message : String(e) }));
    }
    if (response.error) return err(fromSupabaseError(response.error));
    const parsed = schema.safeParse(response.data);
    if (!parsed.success) return err(appError('INTERNAL', 'Respuesta inesperada del servidor.', { retryable: true }));
    return ok(parsed.data);
  }

  push(request: PushRequest): Promise<Result<PushResponse>> {
    const req = PushRequest.safeParse(request);
    if (!req.success) return Promise.resolve(err(appError('VALIDATION_FAILED', 'Lote de sincronización no válido.')));
    return this.call('sync_push', { p_device_id: req.data.deviceId, p_mutations: req.data.mutations }, PushResponse);
  }

  pull(request: PullRequest): Promise<Result<PullResponse>> {
    const req = PullRequest.safeParse(request);
    if (!req.success) return Promise.resolve(err(appError('VALIDATION_FAILED', 'Solicitud de sincronización no válida.')));
    return this.call('sync_pull', { p_cursor: req.data.cursor, p_limit: req.data.limit }, PullResponse);
  }

  pullCatalog(): Promise<Result<CatalogSnapshot>> {
    return this.call('catalog_snapshot', undefined, CatalogSnapshotSchema);
  }
}
