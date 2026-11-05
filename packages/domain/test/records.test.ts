import { describe, expect, it } from 'vitest';
import { computePersonalRecords, newRecordsInSession } from '../src/records';
import { hset } from './fixtures';

const S1 = '00000000-0000-4000-8000-0000000000a1';
const S2 = '00000000-0000-4000-8000-0000000000a2';

describe('récords personales', () => {
  it('calcula cada tipo de récord ignorando calentamientos', () => {
    const records = computePersonalRecords([
      hset(S1, '2026-10-01', { weightKg: 100, reps: 5 }),
      hset(S1, '2026-10-01', { weightKg: 200, reps: 1, setType: 'warmup' }),
      hset(S2, '2026-10-08', { weightKg: 110, reps: 2 }),
      hset(S2, '2026-10-08', { weightKg: 60, reps: 15 }),
    ]);
    expect(records.max_weight?.value).toBe(110);
    expect(records.max_reps?.value).toBe(15);
    expect(records.max_set_volume?.value).toBe(900);
    // Epley: 110×2 → 117.33 supera a 100×5 → 116.67; 60×15 queda fuera del rango fiable
    expect(records.best_e1rm?.value).toBeCloseTo(117.333, 3);
    expect(records.best_e1rm?.weightKg).toBe(110);
  });
  it('en empate conserva el primero en lograrse', () => {
    const first = hset(S1, '2026-10-01', { weightKg: 100, reps: 5 });
    const later = hset(S2, '2026-10-08', { weightKg: 100, reps: 5 });
    expect(computePersonalRecords([later, first]).max_weight?.setId).toBe(first.id);
  });
  it('detecta récords nuevos de una sesión', () => {
    const history = [hset(S1, '2026-10-01', { weightKg: 100, reps: 5 })];
    const today = [hset(S2, '2026-10-08', { weightKg: 105, reps: 3 })];
    const kinds = newRecordsInSession([...history, ...today], S2).map((r) => r.kind);
    expect(kinds).toContain('max_weight');
    expect(kinds).not.toContain('max_reps');
  });
  it('la primera sesión no genera récords salvo que se pida', () => {
    const only = [hset(S1, '2026-10-01', { weightKg: 100, reps: 5 })];
    expect(newRecordsInSession(only, S1)).toEqual([]);
    expect(newRecordsInSession(only, S1, { countFirstAsRecord: true })).toHaveLength(4);
  });
});
