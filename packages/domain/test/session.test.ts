import { describe, expect, it } from 'vitest';
import { assertCanStart, assertTransition, canEditContent, canTransition, nextPosition, planReorder, validateSessionTimes } from '../src/session';

describe('estado de la sesión', () => {
  it('solo permite in_progress → completed | discarded', () => {
    expect(canTransition('in_progress', 'completed')).toBe(true);
    expect(canTransition('in_progress', 'discarded')).toBe(true);
    expect(canTransition('completed', 'in_progress')).toBe(false);
    expect(canTransition('discarded', 'completed')).toBe(false);
    const r = assertTransition('completed', 'discarded');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('INVALID_STATE');
  });
  it('permite editar sesiones completadas pero no descartadas', () => {
    expect(canEditContent('completed')).toBe(true);
    expect(canEditContent('discarded')).toBe(false);
  });
  it('valida horas', () => {
    expect(validateSessionTimes('2026-11-03T10:00:00Z', '2026-11-03T09:00:00Z').ok).toBe(false);
    expect(validateSessionTimes('2026-11-03T10:00:00Z', null).ok).toBe(true);
    // mismos instantes con distinto desplazamiento
    expect(validateSessionTimes('2026-11-03T10:00:00-06:00', '2026-11-03T16:30:00Z').ok).toBe(true);
  });
  it('impide dos sesiones en curso', () => {
    const active = { id: 'a', status: 'in_progress' as const, deletedAt: null };
    expect(assertCanStart([active]).ok).toBe(false);
    expect(assertCanStart([{ ...active, deletedAt: '2026-11-03T00:00:00Z' }]).ok).toBe(true);
    expect(assertCanStart([{ ...active, status: 'completed' as const }]).ok).toBe(true);
  });
});

describe('orden', () => {
  it('calcula la siguiente posición ignorando eliminados', () => {
    expect(nextPosition([])).toBe(0);
    expect(nextPosition([{ position: 0, deletedAt: null }, { position: 5, deletedAt: 'x' }])).toBe(1);
  });
  it('valida reordenamientos', () => {
    const r = planReorder(['a', 'b', 'c'], ['c', 'a', 'b']);
    expect(r.ok && [...r.value]).toEqual([['c', 0], ['a', 1], ['b', 2]]);
    expect(planReorder(['a', 'b'], ['a']).ok).toBe(false);
    expect(planReorder(['a', 'b'], ['a', 'a']).ok).toBe(false);
    expect(planReorder(['a', 'b'], ['a', 'z']).ok).toBe(false);
  });
});
