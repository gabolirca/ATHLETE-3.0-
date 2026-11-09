import {
  appError,
  type AppError,
  type CatalogSnapshot,
  type Clock,
  type ConflictResolution,
  type IdGenerator,
  type OutboxEntry,
  type RemoteChange,
  type SyncEntity,
  type SyncMutation,
  type SyncStatus,
} from '@athlete/contracts';
import { decideRemoteApply } from '@athlete/domain';
import type { SqlDatabase, SqlExecutor, SqlRow, SqlValue } from '../sql/types';
import { ENTITIES, allColumns, metaFor, type EntityMeta, type LocalRow } from './entities';
import { migrateLocalDatabase } from './schema';

/** Error interno con forma `AppError`; los repositorios lo convierten en `Result`. */
export class DataError extends Error {
  constructor(readonly appError: AppError) {
    super(appError.message);
  }
}

export const fail = (...args: Parameters<typeof appError>): never => {
  throw new DataError(appError(...args));
};

export type StoreContext = { userId: string; clock: Clock; ids: IdGenerator };

type OutboxRow = {
  seq: number;
  mutation_id: string;
  entity: string;
  entity_id: string;
  op: 'upsert' | 'delete';
  base_revision: number | null;
  payload: string | null;
  client_recorded_at: string;
  status: OutboxEntry['status'];
  attempts: number;
  last_error: string | null;
  next_attempt_at: string | null;
  enqueued_at: string;
  server_revision: number | null;
  server_record: string | null;
  server_deleted: number | null;
};

const LIVE_STATUSES = "('pending','in_flight','failed','conflict')";

function requireMeta(entity: SyncEntity): EntityMeta {
  const meta = metaFor(entity);
  if (!meta) throw new Error(`Entidad no soportada localmente: ${entity}`);
  return meta;
}

/**
 * Almacén local: filas de negocio + outbox + estado de sync en una sola base SQLite.
 * Toda escritura de negocio y su mutación se confirman en la MISMA transacción, de modo que
 * tras un cierre inesperado nunca hay un dato sin su mutación pendiente (ni al revés).
 */
export class LocalStore {
  private constructor(
    readonly db: SqlDatabase,
    readonly ctx: StoreContext,
    readonly deviceId: string,
  ) {}

  static async open(db: SqlDatabase, ctx: StoreContext): Promise<LocalStore> {
    await migrateLocalDatabase(db);
    // Mutaciones que estaban en vuelo cuando se cerró la app: su resultado es desconocido.
    // Se reintentan; la idempotencia del servidor devuelve `duplicate` si ya se aplicaron.
    await db.run("UPDATE outbox SET status = 'pending' WHERE status = 'in_flight'");
    let device = await db.get<{ value: string }>("SELECT value FROM sync_state WHERE key = 'device_id'");
    if (!device) {
      device = { value: ctx.ids.newId() };
      await db.run("INSERT INTO sync_state (key, value) VALUES ('device_id', ?)", [device.value]);
    }
    const owner = await db.get<{ value: string }>("SELECT value FROM sync_state WHERE key = 'user_id'");
    if (owner && owner.value !== ctx.userId) {
      throw new Error('La base local pertenece a otro usuario (usar una base por usuario)');
    }
    if (!owner) await db.run("INSERT INTO sync_state (key, value) VALUES ('user_id', ?)", [ctx.userId]);
    return new LocalStore(db, ctx, device.value);
  }

  // ---------------- Codificación ----------------

  private encode(meta: EntityMeta, row: LocalRow): { names: string[]; values: SqlValue[] } {
    const names: string[] = [];
    const values: SqlValue[] = [];
    for (const [name, kind] of Object.entries(allColumns(meta))) {
      const v = row[name];
      names.push(name);
      if (v === undefined || v === null) values.push(null);
      else if (kind === 'json') values.push(JSON.stringify(v));
      else if (kind === 'bool') values.push(v === true || v === 1 || v === '1' ? 1 : 0);
      else if (kind === 'int' || kind === 'real') values.push(Number(v));
      else values.push(String(v));
    }
    return { names, values };
  }

  decode(meta: EntityMeta, raw: SqlRow): LocalRow {
    const out: Record<string, unknown> = {};
    for (const [name, kind] of Object.entries(allColumns(meta))) {
      const v = raw[name];
      if (v === undefined || v === null) out[name] = null;
      else if (kind === 'json' && typeof v === 'string') out[name] = JSON.parse(v);
      else if (kind === 'bool') out[name] = Number(v) === 1;
      else out[name] = v;
    }
    return out as LocalRow;
  }

  private async writeRow(tx: SqlExecutor, meta: EntityMeta, row: LocalRow): Promise<void> {
    const { names, values } = this.encode(meta, row);
    await tx.run(
      `INSERT OR REPLACE INTO ${meta.table} (${names.join(', ')}) VALUES (${names.map(() => '?').join(', ')})`,
      values,
    );
  }

  // ---------------- Lectura ----------------

  async get(entity: SyncEntity, id: string, tx: SqlExecutor = this.db): Promise<LocalRow | null> {
    const meta = requireMeta(entity);
    const raw = await tx.get(`SELECT * FROM ${meta.table} WHERE id = ?`, [id]);
    return raw ? this.decode(meta, raw) : null;
  }

  async select(entity: SyncEntity, where: string, params: readonly SqlValue[] = [], tx: SqlExecutor = this.db): Promise<LocalRow[]> {
    const meta = requireMeta(entity);
    const rows = await tx.all(`SELECT * FROM ${meta.table} ${where}`, params);
    return rows.map((r) => this.decode(meta, r));
  }

  toContract<T>(entity: SyncEntity, row: LocalRow): T {
    return requireMeta(entity).toContract(row) as T;
  }

  // ---------------- Escritura local (siempre con outbox) ----------------

  /**
   * Crea o modifica un registro. `changes` contiene columnas de negocio (snake_case).
   * Devuelve la fila resultante. Falla con INVALID_STATE si el registro está eliminado.
   */
  async upsert(entity: SyncEntity, id: string, changes: Record<string, unknown>, tx?: SqlExecutor): Promise<LocalRow> {
    const run = async (t: SqlExecutor) => {
      const meta = requireMeta(entity);
      const now = this.ctx.clock.now();
      const existing = await this.get(entity, id, t);
      if (existing?.deleted_at) fail('INVALID_STATE', 'El registro fue eliminado.');
      if (existing && existing.user_id !== null && existing.user_id !== this.ctx.userId) fail('FORBIDDEN', 'Operación no permitida.');
      for (const key of Object.keys(changes)) {
        if (!(key in meta.columns)) throw new Error(`Columna no escribible: ${meta.table}.${key}`);
      }
      const base: LocalRow = existing ?? {
        id,
        user_id: this.ctx.userId,
        created_at: now,
        updated_at: now,
        deleted_at: null,
        revision: null,
      };
      const row: LocalRow = { ...base, ...changes, id, updated_at: now };
      await this.writeRow(t, meta, row);
      const payload: Record<string, unknown> = {};
      for (const col of Object.keys(meta.columns)) payload[col] = row[col] ?? null;
      await this.enqueue(t, entity, id, 'upsert', payload, (existing?.revision as number | null) ?? null);
      return row;
    };
    return tx ? run(tx) : this.db.transaction(run);
  }

  /** Borrado lógico local + cascada a hijos; encola un único `delete` (el servidor propaga). */
  async remove(entity: SyncEntity, id: string, tx?: SqlExecutor): Promise<void> {
    const run = async (t: SqlExecutor) => {
      const existing = await this.get(entity, id, t);
      if (!existing) fail('NOT_FOUND', 'El registro no existe.');
      if (existing!.deleted_at) return; // idempotente
      const now = this.ctx.clock.now();
      await this.tombstoneLocal(t, requireMeta(entity), id, now);
      await this.enqueue(t, entity, id, 'delete', null, (existing!.revision as number | null) ?? null);
    };
    return tx ? run(tx) : this.db.transaction(run);
  }

  private async tombstoneLocal(tx: SqlExecutor, meta: EntityMeta, id: string, now: string): Promise<void> {
    await tx.run(`UPDATE ${meta.table} SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL`, [now, now, id]);
    for (const child of meta.children ?? []) {
      const childMeta = requireMeta(child.entity);
      const kids = await tx.all<{ id: string }>(`SELECT id FROM ${childMeta.table} WHERE ${child.fk} = ? AND deleted_at IS NULL`, [id]);
      for (const k of kids) await this.tombstoneLocal(tx, childMeta, k.id, now);
    }
  }

  private async enqueue(
    tx: SqlExecutor,
    entity: SyncEntity,
    entityId: string,
    op: 'upsert' | 'delete',
    payload: Record<string, unknown> | null,
    baseRevision: number | null,
  ): Promise<void> {
    const now = this.ctx.clock.now();
    const entries = await tx.all<OutboxRow>(
      `SELECT * FROM outbox WHERE entity = ? AND entity_id = ? AND status IN ${LIVE_STATUSES} ORDER BY seq`,
      [entity, entityId],
    );
    const last = entries[entries.length - 1];
    const neverSent = (e: OutboxRow) => e.status === 'pending' && e.attempts === 0;

    if (op === 'upsert' && last && last.op === 'upsert' && neverSent(last)) {
      // Coalescencia: la última mutación aún no salió del dispositivo → se actualiza su instantánea.
      await tx.run('UPDATE outbox SET payload = ?, client_recorded_at = ? WHERE seq = ?', [JSON.stringify(payload), now, last.seq]);
      return;
    }
    if (op === 'delete') {
      if (baseRevision === null && entries.every(neverSent)) {
        // El registro nunca llegó al servidor: el borrado es puramente local.
        await tx.run(`DELETE FROM outbox WHERE entity = ? AND entity_id = ? AND status = 'pending' AND attempts = 0`, [entity, entityId]);
        return;
      }
      // Ediciones no enviadas quedan superadas por el borrado.
      await tx.run(
        `DELETE FROM outbox WHERE entity = ? AND entity_id = ? AND status = 'pending' AND attempts = 0 AND op = 'upsert'`,
        [entity, entityId],
      );
    }
    await tx.run(
      `INSERT INTO outbox (mutation_id, entity, entity_id, op, base_revision, payload, client_recorded_at, status, attempts, enqueued_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', 0, ?)`,
      [this.ctx.ids.newId(), entity, entityId, op, baseRevision, payload === null ? null : JSON.stringify(payload), now, now],
    );
  }

  // ---------------- Outbox (lado del motor de sync) ----------------

  private toMutation(r: OutboxRow): SyncMutation {
    return {
      mutationId: r.mutation_id,
      deviceId: this.deviceId,
      entity: r.entity as SyncEntity,
      entityId: r.entity_id,
      op: r.op,
      baseRevision: r.base_revision,
      payload: r.payload === null ? null : JSON.parse(r.payload),
      clientRecordedAt: r.client_recorded_at,
    };
  }

  private toEntry(r: OutboxRow): OutboxEntry {
    return {
      mutation: this.toMutation(r),
      status: r.status,
      attempts: r.attempts,
      lastError: r.last_error ? JSON.parse(r.last_error) : null,
      enqueuedAt: r.enqueued_at,
      nextAttemptAt: r.next_attempt_at,
    };
  }

  /**
   * Siguiente lote a enviar, en orden FIFO:
   *  - como máximo una mutación por registro (la siguiente se re-basa al confirmar la anterior);
   *  - un registro con conflicto/rechazo/en vuelo bloquea sus mutaciones posteriores;
   *  - si la primera mutación lista está en espera de reintento, se detiene todo (backoff global),
   *    para no enviar hijos antes que su padre.
   */
  async nextBatch(now: string, limit: number): Promise<SyncMutation[]> {
    const rows = await this.db.all<OutboxRow>(`SELECT * FROM outbox WHERE status IN ('pending','failed','conflict','rejected','in_flight') ORDER BY seq`);
    const blocked = new Set<string>();
    const out: SyncMutation[] = [];
    for (const r of rows) {
      const key = `${r.entity}:${r.entity_id}`;
      if (r.status === 'conflict' || r.status === 'rejected' || r.status === 'in_flight') {
        blocked.add(key);
        continue;
      }
      if (blocked.has(key)) continue;
      blocked.add(key);
      if (r.status === 'failed' && r.next_attempt_at !== null && r.next_attempt_at > now) break;
      out.push(this.toMutation(r));
      if (out.length >= limit) break;
    }
    return out;
  }

  async markInFlight(ids: readonly string[]): Promise<void> {
    await this.db.transaction(async (tx) => {
      for (const id of ids) await tx.run("UPDATE outbox SET status = 'in_flight' WHERE mutation_id = ?", [id]);
    });
  }

  /** Vuelve a pendiente sin consumir intento (p. ej. sesión expirada: no es culpa de la mutación). */
  async releaseInFlight(ids: readonly string[]): Promise<void> {
    await this.db.transaction(async (tx) => {
      for (const id of ids) await tx.run("UPDATE outbox SET status = 'pending' WHERE mutation_id = ? AND status = 'in_flight'", [id]);
    });
  }

  async markFailed(ids: readonly string[], error: AppError, nextAttemptAt: (attempts: number) => string): Promise<void> {
    await this.db.transaction(async (tx) => {
      for (const id of ids) {
        const r = await tx.get<{ attempts: number }>('SELECT attempts FROM outbox WHERE mutation_id = ?', [id]);
        if (!r) continue;
        const attempts = r.attempts + 1;
        await tx.run("UPDATE outbox SET status = 'failed', attempts = ?, last_error = ?, next_attempt_at = ? WHERE mutation_id = ?",
          [attempts, JSON.stringify(error), nextAttemptAt(attempts), id]);
      }
    });
  }

  /** Confirmación del servidor: actualiza la revisión conocida y re-basa las mutaciones posteriores del registro. */
  async acknowledge(mutationId: string, revision: number): Promise<void> {
    await this.db.transaction(async (tx) => {
      const r = await tx.get<OutboxRow>('SELECT * FROM outbox WHERE mutation_id = ?', [mutationId]);
      if (!r) return;
      const meta = requireMeta(r.entity as SyncEntity);
      await tx.run(`UPDATE ${meta.table} SET revision = ? WHERE id = ? AND (revision IS NULL OR revision < ?)`, [revision, r.entity_id, revision]);
      await tx.run(
        `UPDATE outbox SET base_revision = ? WHERE entity = ? AND entity_id = ? AND seq > ? AND status IN ('pending','failed')`,
        [revision, r.entity, r.entity_id, r.seq],
      );
      await tx.run('DELETE FROM outbox WHERE seq = ?', [r.seq]);
    });
  }

  async markConflict(mutationId: string, serverRevision: number, serverDeleted: boolean, serverRecord: Record<string, unknown> | null): Promise<void> {
    await this.db.run(
      "UPDATE outbox SET status = 'conflict', server_revision = ?, server_deleted = ?, server_record = ? WHERE mutation_id = ?",
      [serverRevision, serverDeleted ? 1 : 0, serverRecord === null ? null : JSON.stringify(serverRecord), mutationId],
    );
  }

  async markRejected(mutationId: string, error: AppError): Promise<void> {
    await this.db.run("UPDATE outbox SET status = 'rejected', last_error = ? WHERE mutation_id = ?", [JSON.stringify(error), mutationId]);
  }

  async listEntries(status: OutboxEntry['status']): Promise<OutboxEntry[]> {
    const rows = await this.db.all<OutboxRow>('SELECT * FROM outbox WHERE status = ? ORDER BY seq', [status]);
    return rows.map((r) => this.toEntry(r));
  }

  async conflictDetail(mutationId: string): Promise<{ entry: OutboxEntry; serverRevision: number; serverDeleted: boolean; serverRecord: Record<string, unknown> | null } | null> {
    const r = await this.db.get<OutboxRow>("SELECT * FROM outbox WHERE mutation_id = ? AND status = 'conflict'", [mutationId]);
    if (!r) return null;
    return {
      entry: this.toEntry(r),
      serverRevision: r.server_revision ?? 0,
      serverDeleted: r.server_deleted === 1,
      serverRecord: r.server_record ? JSON.parse(r.server_record) : null,
    };
  }

  /**
   * Resolución explícita de un conflicto.
   * - keep_remote: adopta el registro del servidor (o su tombstone) y descarta los cambios locales del registro.
   * - keep_local: reenvía la versión local actual con la revisión del servidor como base (nuevo mutation_id).
   *   No se permite "resucitar" un registro eliminado en el servidor.
   */
  async resolveConflict(mutationId: string, resolution: ConflictResolution): Promise<void> {
    await this.db.transaction(async (tx) => {
      const r = await tx.get<OutboxRow>("SELECT * FROM outbox WHERE mutation_id = ? AND status = 'conflict'", [mutationId]);
      if (!r) fail('NOT_FOUND', 'El conflicto no existe.');
      const c = r!;
      const entity = c.entity as SyncEntity;
      const meta = requireMeta(entity);
      const revision = c.server_revision ?? 0;
      const deleted = c.server_deleted === 1;

      if (resolution === 'keep_remote') {
        if (deleted) {
          await this.tombstoneLocal(tx, meta, c.entity_id, this.ctx.clock.now());
          await tx.run(`UPDATE ${meta.table} SET revision = ? WHERE id = ?`, [revision, c.entity_id]);
        } else if (c.server_record) {
          await this.writeRow(tx, meta, this.rowFromRecord(meta, JSON.parse(c.server_record), revision));
        }
        await tx.run(`DELETE FROM outbox WHERE entity = ? AND entity_id = ? AND status IN ${LIVE_STATUSES}`, [c.entity, c.entity_id]);
        return;
      }

      if (deleted && c.op === 'upsert') fail('INVALID_STATE', 'El registro fue eliminado en otro dispositivo.');
      const local = await this.get(entity, c.entity_id, tx);
      let payload: string | null = null;
      if (c.op === 'upsert' && local) {
        const p: Record<string, unknown> = {};
        for (const col of Object.keys(meta.columns)) p[col] = local[col] ?? null;
        payload = JSON.stringify(p);
      } else {
        payload = c.payload;
      }
      await tx.run(
        `UPDATE outbox SET mutation_id = ?, base_revision = ?, payload = ?, status = 'pending', attempts = 0,
           last_error = NULL, next_attempt_at = NULL, server_revision = NULL, server_record = NULL, server_deleted = NULL,
           client_recorded_at = ? WHERE seq = ?`,
        [this.ctx.ids.newId(), revision, payload, this.ctx.clock.now(), c.seq],
      );
      await tx.run(`UPDATE ${meta.table} SET revision = ? WHERE id = ?`, [revision, c.entity_id]);
    });
  }

  // ---------------- Pull ----------------

  private rowFromRecord(meta: EntityMeta, record: Record<string, unknown>, revision: number): LocalRow {
    const row: Record<string, unknown> = {};
    for (const col of Object.keys(allColumns(meta))) row[col] = record[col] ?? null;
    row.revision = revision;
    return row as LocalRow;
  }

  /**
   * Aplica una página de cambios remotos y avanza el cursor en la MISMA transacción.
   * Nunca sobrescribe registros con mutaciones locales sin confirmar ni con revisiones más antiguas.
   */
  async applyRemoteChanges(changes: readonly RemoteChange[], nextCursor: string): Promise<{ applied: number; skipped: number; deferred: number }> {
    return this.db.transaction(async (tx) => {
      const stats = { applied: 0, skipped: 0, deferred: 0 };
      for (const change of changes) {
        const meta = metaFor(change.entity);
        if (!meta) {
          stats.skipped++;
          continue;
        }
        const local = await this.get(change.entity, change.entityId, tx);
        const pending = await tx.get(
          `SELECT 1 AS x FROM outbox WHERE entity = ? AND entity_id = ? AND status IN ${LIVE_STATUSES} LIMIT 1`,
          [change.entity, change.entityId],
        );
        const decision = decideRemoteApply(
          local ? { revision: (local.revision as number | null) ?? null, deleted: local.deleted_at !== null } : null,
          change,
          pending !== null,
        );
        if (decision === 'defer_pending') stats.deferred++;
        else if (decision === 'skip_stale') stats.skipped++;
        else if (decision === 'apply_tombstone') {
          if (local) {
            await tx.run(`UPDATE ${meta.table} SET deleted_at = COALESCE(deleted_at, ?), revision = ? WHERE id = ?`,
              [this.ctx.clock.now(), change.revision, change.entityId]);
          }
          stats.applied++;
        } else if (change.record) {
          await this.writeRow(tx, meta, this.rowFromRecord(meta, change.record, change.revision));
          stats.applied++;
        }
      }
      await tx.run("INSERT OR REPLACE INTO sync_state (key, value) VALUES ('pull_cursor', ?)", [nextCursor]);
      return stats;
    });
  }

  private async writeCatalog(tx: SqlExecutor, catalog: CatalogSnapshot): Promise<void> {
    const meta = requireMeta('exercise');
    for (const g of catalog.muscleGroups) await tx.run('INSERT OR REPLACE INTO muscle_groups (id, slug, name) VALUES (?, ?, ?)', [g.id, g.slug, g.name]);
    for (const e of catalog.equipment) await tx.run('INSERT OR REPLACE INTO equipment (id, slug, name) VALUES (?, ?, ?)', [e.id, e.slug, e.name]);
    for (const x of catalog.exercises) {
      if (x.user_id !== null && x.user_id !== undefined) continue; // solo globales
      await this.writeRow(tx, meta, this.rowFromRecord(meta, x, Number(x.revision ?? 1)));
    }
  }

  async applyCatalog(catalog: CatalogSnapshot): Promise<void> {
    await this.db.transaction(async (tx) => {
      await this.writeCatalog(tx, catalog);
      await tx.run("INSERT OR REPLACE INTO sync_state (key, value) VALUES ('catalog_at', ?)", [this.ctx.clock.now()]);
    });
  }

  /**
   * Catálogo incluido en la app (sin red ni cuenta). No marca `catalog_at`, de modo que la primera sync con cuenta
   * descarga el catálogo real de inmediato. Devuelve true si escribió algo.
   *
   * Si ya hay un catálogo descargado del servidor, NO lo pisa, pero cuando la app trae una versión nueva del catálogo
   * agrega los músculos, equipos y ejercicios que falten (por id) y olvida `catalog_at` para que la siguiente sync
   * descargue el del servidor. Sin esto, un teléfono que descargó el catálogo antes de una actualización se quedaba
   * hasta 24 h sin los ejercicios nuevos y las plantillas que los usan fallaban (8-nov-2026).
   */
  async applyBundledCatalog(catalog: CatalogSnapshot, version: string): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const state = async (key: string) => (await tx.get<{ value: string }>('SELECT value FROM sync_state WHERE key = ?', [key]))?.value ?? null;
      if ((await state('catalog_bundled')) === version) return false;
      const downloaded = await state('catalog_at');
      if (downloaded) await this.writeMissingCatalog(tx, catalog);
      else await this.writeCatalog(tx, catalog);
      await tx.run("INSERT OR REPLACE INTO sync_state (key, value) VALUES ('catalog_bundled', ?)", [version]);
      if (downloaded) await tx.run("DELETE FROM sync_state WHERE key = 'catalog_at'");
      return true;
    });
  }

  /** Solo inserta lo que no existe (no cambia nada de lo descargado del servidor). */
  private async writeMissingCatalog(tx: SqlExecutor, catalog: CatalogSnapshot): Promise<void> {
    const meta = requireMeta('exercise');
    for (const g of catalog.muscleGroups) await tx.run('INSERT OR IGNORE INTO muscle_groups (id, slug, name) VALUES (?, ?, ?)', [g.id, g.slug, g.name]);
    for (const e of catalog.equipment) await tx.run('INSERT OR IGNORE INTO equipment (id, slug, name) VALUES (?, ?, ?)', [e.id, e.slug, e.name]);
    for (const x of catalog.exercises) {
      if (x.user_id !== null && x.user_id !== undefined) continue;
      if (await this.get('exercise', String(x.id), tx)) continue;
      await this.writeRow(tx, meta, this.rowFromRecord(meta, x, Number(x.revision ?? 1)));
    }
  }

  // ---------------- Importación y propiedad ----------------

  /**
   * Escribe una fila completa (metadatos incluidos) dentro de una transacción del llamador. Solo para el importador
   * de la capa heredada: valida la entidad y las columnas, fija `user_id` al usuario del almacén y, si `enqueue`,
   * encola un `upsert` sin revisión base (el servidor nunca vio el registro).
   */
  async importRecord(tx: SqlExecutor, entity: SyncEntity, row: LocalRow, options: { enqueue: boolean }): Promise<void> {
    const meta = requireMeta(entity);
    for (const key of Object.keys(row)) {
      if (!(key in allColumns(meta))) throw new Error(`Columna desconocida: ${meta.table}.${key}`);
    }
    if (await this.get(entity, row.id, tx)) fail('DUPLICATE', 'El registro ya existe.', { details: { entity, id: row.id } });
    const full: LocalRow = { ...row, user_id: entity === 'exercise' && row.user_id === null ? null : this.ctx.userId, revision: null };
    await this.writeRow(tx, meta, full);
    if (options.enqueue) {
      const payload: Record<string, unknown> = {};
      for (const col of Object.keys(meta.columns)) payload[col] = full[col] ?? null;
      await this.enqueue(tx, entity, row.id, 'upsert', payload, null);
    }
  }

  /**
   * Adopta los datos locales para una cuenta: reasigna `user_id` (y el `id` del perfil, que es el del usuario)
   * en una sola transacción. Las mutaciones de la outbox no llevan `user_id` (lo asigna el servidor), así que
   * siguen siendo válidas; solo se actualiza la del perfil, cuyo `entity_id` es el usuario.
   * El almacén actual queda obsoleto: hay que reabrir con el nuevo usuario.
   */
  async reassignOwner(newUserId: string): Promise<void> {
    const oldUserId = this.ctx.userId;
    if (newUserId === oldUserId) return;
    await this.db.transaction(async (tx) => {
      const owner = await tx.get<{ value: string }>("SELECT value FROM sync_state WHERE key = 'user_id'");
      if (owner?.value !== oldUserId) fail('FORBIDDEN', 'La base local no pertenece a este usuario.');
      const pushed = await tx.get<{ n: number }>("SELECT COUNT(*) AS n FROM outbox WHERE status IN ('in_flight','conflict','rejected')");
      if (Number(pushed?.n ?? 0) > 0) fail('INVALID_STATE', 'Hay mutaciones en curso o con conflicto.');
      for (const meta of Object.values(ENTITIES)) {
        await tx.run(`UPDATE ${meta.table} SET user_id = ? WHERE user_id = ?`, [newUserId, oldUserId]);
      }
      if (await tx.get('SELECT 1 AS x FROM profiles WHERE id = ?', [newUserId])) fail('DUPLICATE', 'Ya existe un perfil para esa cuenta.');
      await tx.run('UPDATE profiles SET id = ? WHERE id = ?', [newUserId, oldUserId]);
      await tx.run("UPDATE outbox SET entity_id = ? WHERE entity = 'profile' AND entity_id = ?", [newUserId, oldUserId]);
      await tx.run("UPDATE sync_state SET value = ? WHERE key = 'user_id'", [newUserId]);
      await tx.run("INSERT OR REPLACE INTO sync_state (key, value) VALUES ('adopted_from_local_user', ?)", [oldUserId]);
    });
  }

  // ---------------- Estado ----------------

  async getState(key: string): Promise<string | null> {
    return (await this.db.get<{ value: string }>('SELECT value FROM sync_state WHERE key = ?', [key]))?.value ?? null;
  }

  async setState(key: string, value: string): Promise<void> {
    await this.db.run('INSERT OR REPLACE INTO sync_state (key, value) VALUES (?, ?)', [key, value]);
  }

  async status(online: boolean): Promise<SyncStatus> {
    const counts = await this.db.all<{ status: string; n: number }>('SELECT status, COUNT(*) AS n FROM outbox GROUP BY status');
    const n = (s: string) => Number(counts.find((c) => c.status === s)?.n ?? 0);
    return {
      pendingCount: n('pending') + n('failed') + n('in_flight'),
      conflictCount: n('conflict'),
      rejectedCount: n('rejected'),
      lastPushAt: await this.getState('last_push_at'),
      lastPullAt: await this.getState('last_pull_at'),
      online,
    };
  }
}
