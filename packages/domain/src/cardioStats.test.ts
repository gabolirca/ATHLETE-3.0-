import { describe, expect, it } from 'vitest';
import { cardioBests, cardioTotalsByActivity } from './cardio';

const c = (activity: 'run' | 'swim' | 'bike' | 'circuit', localDate: string, durationSeconds: number, distanceMeters: number | null, swim: { poolType: 'pool'; poolLengthMeters: number; laps: number; stroke: null } | null = null) =>
  ({ activity, localDate, durationSeconds, distanceMeters, swim });

describe('cardio: totales y marcas', () => {
  const sessions = [
    c('run', '2026-11-02', 1800, 5000), c('run', '2026-11-05', 1500, 4000), c('run', '2026-11-06', 120, 500),
    c('swim', '2026-11-04', 2400, null, { poolType: 'pool', poolLengthMeters: 25, laps: 60, stroke: null }),
    c('circuit', '2026-11-07', 900, null), c('run', '2026-10-20', 3500, 10000),
  ];
  it('totales por actividad desde una fecha; natación con largos; sin distancia queda null', () => {
    expect(cardioTotalsByActivity(sessions, '2026-11-02')).toEqual([
      { activity: 'run', sessions: 3, durationSeconds: 3420, distanceMeters: 9500 },
      { activity: 'swim', sessions: 1, durationSeconds: 2400, distanceMeters: 1500 },
      { activity: 'circuit', sessions: 1, durationSeconds: 900, distanceMeters: null },
    ]);
  });
  it('marcas: la más larga y el mejor ritmo (con distancia mínima)', () => {
    const b = Object.fromEntries(cardioBests(sessions).map((x) => [x.activity, x]));
    expect(b.run!.longest).toEqual({ distanceMeters: 10000, localDate: '2026-10-20' });
    expect(b.run!.fastest).toEqual({ paceSeconds: 350, distanceMeters: 10000, localDate: '2026-10-20' }); // 500 m a 4:00/km no cuenta
    expect(b.swim!.fastest).toEqual({ paceSeconds: 160, distanceMeters: 1500, localDate: '2026-11-04' });
    expect(b.circuit).toBeUndefined();
  });
});
