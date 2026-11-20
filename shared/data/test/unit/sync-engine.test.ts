import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { appError, err, ok } from '@athlete/contracts';
import { FakeTransport, SQUAT, TestClock, expectOk, newId, openDevice, tempDir } from '../support';

const USER = '6f1c2d3e-4b5a-4c6d-8e7f-9a0b1c2d3e4f';
let tmp: ReturnType<typeof tempDir>;
let transport: FakeTransport;
let clock: TestClock;
beforeEach(() => { tmp = tempDir(); transport = new FakeTransport(); clock = new TestClock(); });
afterEach(() => tmp.cleanup());

const open = () => openDevice(join(tmp.dir, 'd.db'), USER, transport, clock);

describe('outbox', () => {
  it('coalesce ediciones no enviadas en una sola mutación', async () => {
    const d = await open();
    expectOk(await d.sync.syncNow());
    transport.online = false;
    const w = expectOk(await d.body.logWeight({ id: newId(), measuredAt: '2026-11-04T07:00:00Z', timeZone: 'UTC', value: 80, inputUnit: 'kg' }));
    expectOk(await d.profile.initialize('UTC'));
    expectOk(await d.profile.update({ displayName: 'A' }));
    expectOk(await d.profile.update({ displayName: 'B' }));
    expect((await d.sync.status()).pendingCount).toBe(2); // peso + perfil (coalescido)
    transport.online = true;
    expectOk(await d.sync.syncNow());
    const sent = transport.pushes.flatMap((p) => p.mutations);
    expect(sent.map((m) => m.entity)).toEqual(['body_weight', 'profile']);
    expect(sent[1]?.payload?.display_name).toBe('B');
    expect(sent[0]?.entityId).toBe(w.id);
    await d.close();
  });

  it('borrar algo nunca sincronizado no genera tráfico', async () => {
    const d = await open();
    expectOk(await d.sync.syncNow());
    transport.online = false;
    const w = expectOk(await d.body.logWeight({ id: newId(), measuredAt: '2026-11-04T07:00:00Z', timeZone: 'UTC', value: 80, inputUnit: 'kg' }));
    expectOk(await d.body.deleteWeight(w.id));
    expect((await d.sync.status()).pendingCount).toBe(0);
    await d.close();
  });

  it('una mutación por registro y lote; la siguiente se re-basa con la revisión confirmada', async () => {
    const d = await open();
    expectOk(await d.sync.syncNow());
    expectOk(await d.profile.initialize('UTC'));
    // Simula "en vuelo" con fallo de red para que la siguiente edición no se coalesca.
    transport.online = false;
    await d.sync.syncNow();
    expectOk(await d.profile.update({ displayName: 'Nuevo' }));
    transport.online = true;
    clock.advance(10 * 60_000);
    expectOk(await d.sync.syncNow());
    const sent = transport.pushes.flatMap((p) => p.mutations);
    expect(sent.map((m) => [m.op, m.baseRevision])).toEqual([['upsert', null], ['upsert', 1]]);
    expect(transport.pushes.every((p) => new Set(p.mutations.map((m) => m.entityId)).size === p.mutations.length)).toBe(true);
    await d.close();
  });

  it('fallo de red → reintento con backoff; no se reenvía antes de tiempo', async () => {
    const d = await open();
    expectOk(await d.sync.syncNow());
    expectOk(await d.profile.initialize('UTC'));
    transport.online = false;
    const r = await d.sync.syncNow();
    expect(r.ok === false && r.error.code).toBe('NETWORK_UNAVAILABLE');
    expect((await d.sync.status()).online).toBe(false);
    transport.online = true;
    const before = transport.pushes.length;
    expectOk(await d.sync.syncNow()); // aún dentro del backoff (1 s)
    expect(transport.pushes.length).toBe(before);
    clock.advance(1500);
    expectOk(await d.sync.syncNow());
    expect(transport.pushes.length).toBe(before + 1);
    expect((await d.sync.status()).pendingCount).toBe(0);
    await d.close();
  });

  it('sesión expirada: no consume intentos y conserva las mutaciones', async () => {
    const d = await open();
    expectOk(await d.sync.syncNow());
    expectOk(await d.profile.initialize('UTC'));
    transport.pushHandler = () => err(appError('SESSION_EXPIRED', 'x'));
    const r = await d.sync.syncNow();
    expect(r.ok === false && r.error.code).toBe('SESSION_EXPIRED');
    const pending = await d.sync.status();
    expect(pending.pendingCount).toBe(1);
    await d.close();
  });

  it('rechazos quedan visibles y bloquean solo su registro', async () => {
    const d = await open();
    expectOk(await d.sync.syncNow());
    const a = expectOk(await d.body.logWeight({ id: newId(), measuredAt: '2026-11-04T07:00:00Z', timeZone: 'UTC', value: 80, inputUnit: 'kg' }));
    expectOk(await d.body.logWeight({ id: newId(), measuredAt: '2026-11-04T08:00:00Z', timeZone: 'UTC', value: 81, inputUnit: 'kg' }));
    transport.pushHandler = (req) => ok({ results: req.mutations.map((m) => m.entityId === a.id
      ? { status: 'rejected' as const, mutationId: m.mutationId, error: appError('VALIDATION_FAILED', 'x') }
      : { status: 'applied' as const, mutationId: m.mutationId, revision: 1 }) });
    expectOk(await d.sync.syncNow());
    expect(await d.sync.status()).toMatchObject({ pendingCount: 0, rejectedCount: 1 });
    await d.close();
  });
});

describe('pull', () => {
  it('nunca sobrescribe datos locales pendientes ni aplica revisiones antiguas', async () => {
    const d = await open();
    expectOk(await d.sync.syncNow());
    const s = expectOk(await d.sessions.start({ id: newId(), startedAt: '2026-11-04T10:00:00Z', timeZone: 'UTC' }));
    expectOk(await d.sync.syncNow()); // revisión 1 confirmada
    transport.online = false;
    expectOk(await d.sessions.update({ sessionId: s.id, notes: 'local nuevo' }));
    transport.online = true;
    const remote = (revision: number, notes: string) => ({
      entity: 'workout_session' as const, entityId: s.id, revision, deleted: false, lastMutationId: null,
      record: { id: s.id, user_id: USER, status: 'in_progress', training_day_id: null, title: null, started_at: '2026-11-04T10:00:00+00:00', ended_at: null, time_zone: 'UTC', local_date: '2026-11-04', source: 'manual', notes, created_at: '2026-11-04T10:00:00+00:00', updated_at: '2026-11-04T10:00:00+00:00', deleted_at: null, revision },
    });
    // El push falla (offline simulado solo para push) → el pull llega con una versión remota.
    transport.pushHandler = () => err(appError('TIMEOUT', 't'));
    transport.pullHandler = () => ok({ changes: [remote(2, 'remoto')], nextCursor: '10', hasMore: false });
    await d.sync.syncNow(); // push falla → la mutación queda en espera de reintento
    let pulls = 0;
    transport.pullHandler = () => { pulls++; return ok({ changes: [remote(2, 'remoto')], nextCursor: '10', hasMore: false }); };
    expectOk(await d.sync.syncNow()); // dentro del backoff: no hay push, pero sí pull
    expect(pulls).toBe(1);
    expect(expectOk(await d.sessions.getDetail(s.id)).notes).toBe('local nuevo');

    // Sin pendientes: una revisión vieja no pisa la local.
    transport.pushHandler = (req) => ok({ results: req.mutations.map((m) => ({ status: 'applied' as const, mutationId: m.mutationId, revision: 3 })) });
    transport.pullHandler = () => ok({ changes: [remote(2, 'viejo')], nextCursor: '11', hasMore: false });
    clock.advance(60_000);
    expectOk(await d.sync.syncNow());
    expect(expectOk(await d.sessions.getDetail(s.id))).toMatchObject({ notes: 'local nuevo', revision: 3 });

    // Una revisión más nueva sí se aplica.
    transport.pullHandler = () => ok({ changes: [remote(4, 'desde otro dispositivo')], nextCursor: '12', hasMore: false });
    expectOk(await d.sync.syncNow());
    expect(expectOk(await d.sessions.getDetail(s.id)).notes).toBe('desde otro dispositivo');
    await d.close();
  });

  it('tombstones remotos eliminan localmente', async () => {
    const d = await open();
    expectOk(await d.sync.syncNow());
    const w = expectOk(await d.body.logWeight({ id: newId(), measuredAt: '2026-11-04T07:00:00Z', timeZone: 'UTC', value: 80, inputUnit: 'kg' }));
    expectOk(await d.sync.syncNow());
    transport.pullHandler = () => ok({ changes: [{ entity: 'body_weight', entityId: w.id, revision: 2, deleted: true, record: null, lastMutationId: null }], nextCursor: '20', hasMore: false });
    expectOk(await d.sync.syncNow());
    expect(expectOk(await d.body.listWeights({}))).toEqual([]);
    await d.close();
  });

  it('los ciclos concurrentes no se solapan', async () => {
    const d = await open();
    const [a, b] = await Promise.all([d.sync.syncNow(), d.sync.syncNow()]);
    expect(a).toBe(b);
    await d.close();
  });
});

describe('conflictos', () => {
  async function conflictOnProfile() {
    const d = await open();
    expectOk(await d.sync.syncNow());
    expectOk(await d.profile.initialize('UTC'));
    expectOk(await d.sync.syncNow());
    expectOk(await d.profile.update({ displayName: 'Local' }));
    transport.pushHandler = (req) => ok({ results: req.mutations.map((m) => ({
      status: 'conflict' as const, mutationId: m.mutationId, serverRevision: 5, serverDeleted: false,
      serverRecord: { ...m.payload, id: USER, user_id: USER, display_name: 'Servidor', created_at: '2026-11-04T00:00:00+00:00', updated_at: '2026-11-04T00:00:00+00:00', deleted_at: null, revision: 5 },
    })) });
    expectOk(await d.sync.syncNow());
    const [c] = await d.sync.listConflicts();
    return { d, c: c! };
  }

  it('se reportan explícitamente y no se sobrescriben datos', async () => {
    const { d, c } = await conflictOnProfile();
    expect(c.mutation.entity).toBe('profile');
    expect(expectOk(await d.profile.get()).displayName).toBe('Local');
    expect((await d.sync.status()).conflictCount).toBe(1);
    await d.close();
  });

  it('keep_remote adopta el servidor', async () => {
    const { d, c } = await conflictOnProfile();
    expectOk(await d.sync.resolveConflict(c.mutation.mutationId, 'keep_remote'));
    expect(expectOk(await d.profile.get())).toMatchObject({ displayName: 'Servidor', revision: 5 });
    expect((await d.sync.status()).conflictCount).toBe(0);
    await d.close();
  });

  it('keep_local reenvía con base del servidor y nuevo mutationId', async () => {
    const { d, c } = await conflictOnProfile();
    expectOk(await d.sync.resolveConflict(c.mutation.mutationId, 'keep_local'));
    transport.pushHandler = (req) => ok({ results: req.mutations.map((m) => ({ status: 'applied' as const, mutationId: m.mutationId, revision: 6 })) });
    expectOk(await d.sync.syncNow());
    const last = transport.pushes.at(-1)!.mutations[0]!;
    expect(last.baseRevision).toBe(5);
    expect(last.mutationId).not.toBe(c.mutation.mutationId);
    expect(last.payload?.display_name).toBe('Local');
    await d.close();
  });

  it('resolver un conflicto inexistente devuelve NOT_FOUND', async () => {
    const d = await open();
    const r = await d.sync.resolveConflict(newId(), 'keep_local');
    expect(r.ok === false && r.error.code).toBe('NOT_FOUND');
    await d.close();
  });
});
