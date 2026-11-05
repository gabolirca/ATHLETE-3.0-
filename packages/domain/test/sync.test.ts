import { describe, expect, it } from 'vitest';
import type { OutboxEntry } from '@athlete/contracts';
import { decideRemoteApply, isConflict, outboxActionFor, resolveConflict, retryDelayMs } from '../src/sync';

const M = '00000000-0000-4000-8000-000000000001';
const M2 = '00000000-0000-4000-8000-000000000002';

describe('aplicación de cambios remotos (pull)', () => {
  it('nunca sobrescribe cambios locales pendientes', () => {
    expect(decideRemoteApply({ revision: 1, deleted: false }, { revision: 5, deleted: false }, true)).toBe('defer_pending');
    expect(decideRemoteApply(null, { revision: 1, deleted: true }, true)).toBe('defer_pending');
  });
  it('ignora cambios iguales o más antiguos', () => {
    expect(decideRemoteApply({ revision: 5, deleted: false }, { revision: 5, deleted: false }, false)).toBe('skip_stale');
    expect(decideRemoteApply({ revision: 6, deleted: false }, { revision: 3, deleted: true }, false)).toBe('skip_stale');
  });
  it('aplica altas, actualizaciones y tombstones', () => {
    expect(decideRemoteApply(null, { revision: 1, deleted: false }, false)).toBe('apply');
    expect(decideRemoteApply({ revision: null, deleted: false }, { revision: 1, deleted: false }, false)).toBe('apply');
    expect(decideRemoteApply({ revision: 2, deleted: false }, { revision: 3, deleted: true }, false)).toBe('apply_tombstone');
    expect(decideRemoteApply(null, { revision: 3, deleted: true }, false)).toBe('apply_tombstone');
  });
});

describe('push', () => {
  it('duplicate es éxito idempotente', () => {
    expect(outboxActionFor({ status: 'duplicate', mutationId: M, revision: 4 })).toEqual({ action: 'acknowledge', revision: 4 });
    expect(outboxActionFor({ status: 'applied', mutationId: M, revision: 1 })).toEqual({ action: 'acknowledge', revision: 1 });
  });
  it('conflictos y rechazos se reportan explícitamente', () => {
    expect(
      outboxActionFor({ status: 'conflict', mutationId: M, serverRevision: 7, serverDeleted: false, serverRecord: { a: 1 } }),
    ).toEqual({ action: 'conflict', serverRevision: 7, serverRecord: { a: 1 } });
    const error = { code: 'VALIDATION_FAILED' as const, message: 'x', retryable: false };
    expect(outboxActionFor({ status: 'rejected', mutationId: M, error })).toEqual({ action: 'reject', error });
  });
  it('detección de conflicto por revisión', () => {
    expect(isConflict(null, null)).toBe(false);
    expect(isConflict(3, 3)).toBe(false);
    expect(isConflict(2, 3)).toBe(true);
    expect(isConflict(null, 1)).toBe(true);
  });
  it('backoff exponencial con tope y jitter inyectable', () => {
    expect([1, 2, 3, 4].map((a) => retryDelayMs(a))).toEqual([1000, 2000, 4000, 8000]);
    expect(retryDelayMs(30)).toBe(300_000);
    expect(retryDelayMs(3, { jitter: () => 0 })).toBe(2000);
  });
});

describe('resolución de conflictos', () => {
  const entry: OutboxEntry = {
    mutation: {
      mutationId: M,
      deviceId: M,
      entity: 'strength_set',
      entityId: M,
      op: 'upsert',
      baseRevision: 2,
      payload: { reps: 8 },
      clientRecordedAt: '2026-11-03T10:00:00Z',
    },
    status: 'conflict',
    attempts: 1,
    lastError: null,
    enqueuedAt: '2026-11-03T10:00:00Z',
    nextAttemptAt: null,
  };
  const conflict = { serverRevision: 5, serverRecord: { reps: 6 } };

  it('keep_local reenvía con nueva identidad y base del servidor', () => {
    const out = resolveConflict(entry, conflict, 'keep_local', M2, '2026-11-03T11:00:00Z');
    expect(out.kind).toBe('resend');
    if (out.kind === 'resend') {
      expect(out.mutation.mutationId).toBe(M2);
      expect(out.mutation.baseRevision).toBe(5);
      expect(out.mutation.payload).toEqual({ reps: 8 });
    }
  });
  it('keep_remote adopta el registro del servidor', () => {
    expect(resolveConflict(entry, conflict, 'keep_remote', M2, '2026-11-03T11:00:00Z')).toEqual({
      kind: 'adopt_remote',
      record: { reps: 6 },
      revision: 5,
    });
  });
});
