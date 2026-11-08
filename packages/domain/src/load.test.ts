import { describe, expect, it } from 'vitest';
import { loadTrend, sessionLoad, weekStartOf, weeklyLoads } from './load';

describe('carga de sesión (sRPE)', () => {
  it('RPE × minutos; sin RPE no hay carga', () => {
    expect(sessionLoad(7, 60)).toBe(420);
    expect(sessionLoad(7.5, 45)).toBe(338);
    expect(sessionLoad(null, 60)).toBeNull();
  });
  it('la semana empieza en lunes', () => {
    expect(weekStartOf('2026-11-08')).toBe('2026-11-02'); // domingo
    expect(weekStartOf('2026-11-09')).toBe('2026-11-09'); // lunes
  });
  it('suma por semana y por tipo, cuenta sesiones sin RPE y compara contra el promedio', () => {
    const w = weeklyLoads([
      { localDate: '2026-10-20', minutes: 60, rpe: 7, kind: 'strength' },
      { localDate: '2026-10-28', minutes: 60, rpe: 7, kind: 'strength' },
      { localDate: '2026-11-03', minutes: 60, rpe: 7, kind: 'strength' },
      { localDate: '2026-11-09', minutes: 60, rpe: 8, kind: 'strength' },
      { localDate: '2026-11-10', minutes: 50, rpe: 4, kind: 'cardio' },
      { localDate: '2026-11-11', minutes: 75, rpe: 8, kind: 'conditioning' },
      { localDate: '2026-11-11', minutes: 30, rpe: null, kind: 'cardio' },
      { localDate: '2026-09-01', minutes: 60, rpe: 7, kind: 'strength' },
    ], '2026-11-11', 4);
    expect(w.map((x) => [x.weekStart, x.total])).toEqual([['2026-10-19', 420], ['2026-10-26', 420], ['2026-11-02', 420], ['2026-11-09', 1280]]);
    expect(w[3]).toMatchObject({ byKind: { strength: 480, cardio: 200, conditioning: 600 }, sessions: 4, missingRpe: 1 });
    expect(loadTrend(w)).toEqual({ ratio: 3.05, status: 'spike' });
    expect(loadTrend(w.slice(0, 2))).toEqual({ ratio: null, status: 'low_data' });
  });
});
