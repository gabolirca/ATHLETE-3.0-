import { describe, expect, it } from 'vitest';
import { benchmarks, programCycle, swimPaces, weeklyMeters } from './benchmarks';

const p = (localDate: string, rounds: number | null, reps: number | null = null, seconds: number | null = null, format = 'amrap', key = 'amrap-sab') =>
  ({ blockKey: key, name: 'AMRAP 15 min', format, localDate, roundsCompleted: rounds, extraReps: reps, durationSeconds: seconds });

describe('benchmarks', () => {
  it('AMRAP: mejor, último, anterior y tendencia por rondas + reps', () => {
    const [b] = benchmarks([p('2026-10-24', 5, 10), p('2026-11-07', 6, 4), p('2026-10-31', 6, 1)]);
    expect(b).toMatchObject({ best: { localDate: '2026-11-07' }, last: { roundsCompleted: 6, extraReps: 4 }, previous: { extraReps: 1 }, trend: 'up' });
    expect(b!.points.map((x) => x.localDate)).toEqual(['2026-10-24', '2026-10-31', '2026-11-07']);
  });
  it('por tiempo: menos es mejor; sin resultado no cuenta; un solo resultado no tiene tendencia', () => {
    const list = benchmarks([p('2026-11-01', null, null, 1500, 'for_time', 'sim'), p('2026-11-08', null, null, 1560, 'for_time', 'sim'), p('2026-11-08', null, null, null, 'amrap', 'vacío'), p('2026-11-02', 3, null, null, 'rounds', 'r')]);
    expect(list.find((x) => x.key === 'sim')).toMatchObject({ trend: 'down', best: { durationSeconds: 1500 } });
    expect(list.find((x) => x.key === 'r')!.trend).toBeNull();
    expect(list.some((x) => x.key === 'vacío')).toBe(false);
  });
});

describe('natación y ciclo', () => {
  const swim = (localDate: string, durationSeconds: number, distanceMeters: number | null) => ({ activity: 'swim' as const, localDate, durationSeconds, distanceMeters, swim: null });
  it('metros por semana y ritmo por 100 m', () => {
    const sessions = [swim('2026-11-02', 2400, 1400), swim('2026-11-04', 2100, 1200), swim('2026-11-09', 2300, 1500), swim('2026-11-09', 60, 100), { activity: 'run' as const, localDate: '2026-11-09', durationSeconds: 1800, distanceMeters: 5000, swim: null }];
    expect(weeklyMeters(sessions, 'swim', '2026-11-10', 3)).toEqual([{ weekStart: '2026-10-26', meters: 0 }, { weekStart: '2026-11-02', meters: 2600 }, { weekStart: '2026-11-09', meters: 1600 }]);
    expect(swimPaces(sessions).map((x) => [x.localDate, Math.round(x.pace)])).toEqual([['2026-11-02', 171], ['2026-11-04', 175], ['2026-11-09', 153]]);
  });
  it('semana del programa y descarga en la 6', () => {
    expect(programCycle('2026-11-08', '2026-11-08')).toEqual({ week: 1, cycleWeek: 1, cycleLength: 6, deloadWeek: false });
    expect(programCycle('2026-11-02', '2026-12-08')).toEqual({ week: 6, cycleWeek: 6, cycleLength: 6, deloadWeek: true });
    expect(programCycle('2026-11-02', '2026-12-14')).toMatchObject({ week: 7, cycleWeek: 1 });
  });
});
