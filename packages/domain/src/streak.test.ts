import { describe, expect, it } from 'vitest';
import { computeStreak, weeksStreak } from './streak';

const set = (...d: string[]) => new Set(d);
// Noviembre 2026: lunes 2, 9, 16.
describe('racha con programa (descanso planeado no rompe)', () => {
  const plan = new Set([1, 2, 3, 4, 5, 6]); // domingo descanso
  it('cuenta los días entrenados y el domingo de descanso; hoy pendiente no rompe', () => {
    const s = computeStreak({ activeDates: set('2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07', '2026-11-09'), today: '2026-11-10', plannedWeekdays: plan });
    expect(s).toEqual({ current: 8, best: 8, todayDone: false, atRisk: true, daysSinceLast: 1 });
  });
  it('un día planeado sin entrenar rompe la racha', () => {
    const s = computeStreak({ activeDates: set('2026-11-02', '2026-11-03', '2026-11-05', '2026-11-06'), today: '2026-11-06', plannedWeekdays: plan });
    expect(s).toMatchObject({ current: 2, best: 2, todayDone: true, atRisk: false, daysSinceLast: 0 });
  });
});

describe('racha sin programa (un día libre permitido)', () => {
  it('un día libre no rompe; dos seguidos sí', () => {
    expect(computeStreak({ activeDates: set('2026-11-02', '2026-11-04', '2026-11-05'), today: '2026-11-05', plannedWeekdays: null })).toMatchObject({ current: 4, todayDone: true });
    expect(computeStreak({ activeDates: set('2026-11-02', '2026-11-05'), today: '2026-11-05', plannedWeekdays: null })).toMatchObject({ current: 1, best: 2 });
  });
  it('días sin entrenar y riesgo de perderla', () => {
    expect(computeStreak({ activeDates: set('2026-11-02', '2026-11-03'), today: '2026-11-04', plannedWeekdays: null })).toMatchObject({ current: 2, atRisk: true, daysSinceLast: 1 });
    expect(computeStreak({ activeDates: set('2026-11-02'), today: '2026-11-08', plannedWeekdays: null })).toMatchObject({ current: 0, daysSinceLast: 6 });
    expect(computeStreak({ activeDates: set(), today: '2026-11-08', plannedWeekdays: null })).toMatchObject({ current: 0, daysSinceLast: null });
  });
});

describe('racha de semanas', () => {
  it('semanas seguidas con ≥ 80 %; la actual suma solo si ya se cumplió', () => {
    expect(weeksStreak([{ done: 10, planned: 10 }, { done: 6, planned: 10 }, { done: 9, planned: 10 }, { done: 8, planned: 10 }, { done: 3, planned: 10 }])).toEqual({ current: 2, best: 2 });
    expect(weeksStreak([{ done: 10, planned: 10 }, { done: 9, planned: 10 }, { done: 8, planned: 10 }])).toEqual({ current: 3, best: 3 });
  });
});
