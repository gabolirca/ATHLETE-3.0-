import { describe, expect, it } from 'vitest';
import { formatDuration, pacePer100mSeconds, paceSecondsPerKm, speedKmh, swimDistanceFromLaps } from '../src/cardio';

describe('cardio', () => {
  it('ritmo y velocidad derivados', () => {
    expect(paceSecondsPerKm(1500, 5000)).toBe(300);
    expect(speedKmh(3600, 30_000)).toBe(30);
    expect(pacePer100mSeconds(1200, 1000)).toBe(120);
  });
  it('null sin distancia o duración', () => {
    expect(paceSecondsPerKm(1500, null)).toBeNull();
    expect(speedKmh(0, 1000)).toBeNull();
    expect(pacePer100mSeconds(600, 0)).toBeNull();
  });
  it('distancia de natación por largos solo si no se registró', () => {
    const swim = { poolType: 'pool' as const, poolLengthMeters: 25, laps: 40, stroke: null };
    expect(swimDistanceFromLaps({ distanceMeters: null, swim })).toBe(1000);
    expect(swimDistanceFromLaps({ distanceMeters: 950, swim })).toBe(950);
    expect(swimDistanceFromLaps({ distanceMeters: null, swim: { ...swim, laps: null } })).toBeNull();
    expect(swimDistanceFromLaps({ distanceMeters: null, swim: { ...swim, poolType: 'open_water' } })).toBeNull();
  });
  it('formatea duraciones', () => {
    expect(formatDuration(65)).toBe('1:05');
    expect(formatDuration(3725)).toBe('1:02:05');
  });
});
