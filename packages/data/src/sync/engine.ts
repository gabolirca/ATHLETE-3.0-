import { appError, MAX_PUSH_BATCH, ok, err, type AppError, type ConflictResolution, type OutboxEntry, type Result, type SyncService, type SyncStatus, type SyncTransport } from '@athlete/contracts';
import { outboxActionFor, retryDelayMs } from '@athlete/domain';
import { DataError, type LocalStore } from '../local/store';
import { silentLogger, type Logger } from '../logging';

export type SyncEngineOptions = {
  logger?: Logger;
  /** Recarga del catálogo global si es más antiguo que esto (ms). */
  catalogMaxAgeMs?: number;
  pullPageSize?: number;
  /** Tope de páginas por ciclo para no bloquear indefinidamente. */
  maxPullPages?: number;
  jitter?: () => number;
};

/**
 * Motor de sincronización independiente de la UI (ADR-0003). Un ciclo = push de la outbox
 * seguido de pull incremental. Seguro de invocar repetidamente: los ciclos no se solapan.
 */
export class SyncEngine implements SyncService {
  private running: Promise<Result<SyncStatus>> | null = null;
  private online = true;
  private readonly log: Logger;

  constructor(
    private readonly store: LocalStore,
    private readonly transport: SyncTransport,
    private readonly options: SyncEngineOptions = {},
  ) {
    this.log = options.logger ?? silentLogger;
  }

  status(): Promise<SyncStatus> {
    return this.store.status(this.online);
  }

  listConflicts(): Promise<OutboxEntry[]> {
    return this.store.listEntries('conflict');
  }

  async resolveConflict(mutationId: string, resolution: ConflictResolution): Promise<Result<void>> {
    try {
      await this.store.resolveConflict(mutationId, resolution);
      return ok(undefined);
    } catch (e) {
      if (e instanceof DataError) return err(e.appError);
      throw e;
    }
  }

  syncNow(): Promise<Result<SyncStatus>> {
    this.running ??= this.cycle().finally(() => {
      this.running = null;
    });
    return this.running;
  }

  private async cycle(): Promise<Result<SyncStatus>> {
    const pushed = await this.pushAll();
    if (!pushed.ok) return this.finish(pushed.error);
    const catalog = await this.refreshCatalogIfStale();
    if (!catalog.ok) return this.finish(catalog.error);
    const pulled = await this.pullAll();
    if (!pulled.ok) return this.finish(pulled.error);
    this.online = true;
    return ok(await this.status());
  }

  private async finish(error: AppError): Promise<Result<SyncStatus>> {
    if (error.code === 'NETWORK_UNAVAILABLE' || error.code === 'TIMEOUT') this.online = false;
    this.log.warn('sync.cycle_failed', { code: error.code });
    return err(error);
  }

  private async pushAll(): Promise<Result<void>> {
    const clock = this.store.ctx.clock;
    for (let round = 0; round < 50; round++) {
      const batch = await this.store.nextBatch(clock.now(), MAX_PUSH_BATCH);
      if (batch.length === 0) return ok(undefined);
      const ids = batch.map((m) => m.mutationId);
      await this.store.markInFlight(ids);

      const res = await this.transport.push({ deviceId: this.store.deviceId, mutations: batch });
      if (!res.ok) {
        if (res.error.retryable) {
          const now = Date.parse(clock.now());
          await this.store.markFailed(ids, res.error, (attempts) =>
            new Date(now + retryDelayMs(attempts, this.options.jitter ? { jitter: this.options.jitter } : {})).toISOString());
        } else {
          // Sesión inválida, etc.: las mutaciones no tienen la culpa; quedan pendientes.
          await this.store.releaseInFlight(ids);
        }
        return err(res.error);
      }

      const byId = new Map(res.value.results.map((r) => [r.mutationId, r]));
      let applied = 0;
      for (const id of ids) {
        const result = byId.get(id);
        if (!result) {
          await this.store.markFailed([id], appError('INTERNAL', 'Respuesta incompleta del servidor.'), () => clock.now());
          continue;
        }
        const action = outboxActionFor(result);
        if (action.action === 'acknowledge') {
          await this.store.acknowledge(id, action.revision);
          applied++;
        } else if (action.action === 'conflict' && result.status === 'conflict') {
          await this.store.markConflict(id, result.serverRevision, result.serverDeleted, result.serverRecord);
        } else if (action.action === 'reject') {
          await this.store.markRejected(id, action.error);
        }
      }
      await this.store.setState('last_push_at', clock.now());
      this.log.info('sync.push', { sent: ids.length, applied });
    }
    return ok(undefined);
  }

  private async pullAll(): Promise<Result<void>> {
    const maxPages = this.options.maxPullPages ?? 50;
    for (let page = 0; page < maxPages; page++) {
      const cursor = await this.store.getState('pull_cursor');
      const res = await this.transport.pull({ cursor, limit: this.options.pullPageSize ?? 200 });
      if (!res.ok) return err(res.error);
      const stats = await this.store.applyRemoteChanges(res.value.changes, res.value.nextCursor);
      this.log.info('sync.pull', { received: res.value.changes.length, ...stats });
      if (!res.value.hasMore) break;
    }
    await this.store.setState('last_pull_at', this.store.ctx.clock.now());
    return ok(undefined);
  }

  private async refreshCatalogIfStale(): Promise<Result<void>> {
    const at = await this.store.getState('catalog_at');
    const maxAge = this.options.catalogMaxAgeMs ?? 24 * 3600_000;
    if (at && Date.parse(this.store.ctx.clock.now()) - Date.parse(at) < maxAge) return ok(undefined);
    const res = await this.transport.pullCatalog();
    if (!res.ok) return err(res.error);
    await this.store.applyCatalog(res.value);
    return ok(undefined);
  }
}
