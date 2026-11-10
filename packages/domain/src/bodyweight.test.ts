import { describe, expect, it } from 'vitest';
import { toGoal, weightTrend } from './bodyweight';

describe('peso promedio', () => {
  it('promedia 7 días y compara con la semana anterior', () => {
    const t = weightTrend([
      { localDate: '2026-11-09', kg: 80.4 }, { localDate: '2026-11-07', kg: 80.0 }, { localDate: '2026-11-04', kg: 80.2 },
      { localDate: '2026-11-01', kg: 81.0 }, { localDate: '2026-10-29', kg: 81.2 },
    ], '2026-11-09');
    expect(t).toMatchObject({ avg7: 80.2, prevAvg7: 81.1, weeklyChange: -0.9, count7: 3 });
    expect(t.latest).toEqual({ localDate: '2026-11-09', kg: 80.4 });
  });
  it('sin pesajes no inventa nada', () => {
    expect(weightTrend([], '2026-11-09')).toMatchObject({ avg7: null, weeklyChange: null, latest: null });
  });
  it('meta: cuánto falta y hacia dónde', () => {
    expect(toGoal(80.2, 75)).toEqual({ remaining: 5.2, direction: 'down' });
    expect(toGoal(70, 72)).toEqual({ remaining: 2, direction: 'up' });
    expect(toGoal(75, 75)).toEqual({ remaining: 0, direction: 'done' });
    expect(toGoal(null, 75)).toBeNull();
  });
});
