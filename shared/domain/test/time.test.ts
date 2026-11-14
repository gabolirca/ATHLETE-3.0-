import { describe, expect, it } from 'vitest';
import { addDays, elapsedSeconds, isWithinRange, localDateOf, startOfWeek, weekDates } from '../src/time';

describe('localDateOf', () => {
  it('usa la zona del atleta, no el recorte UTC', () => {
    // 22:30 del 3 nov en Ciudad de México = 04:30 UTC del 4 nov
    expect(localDateOf('2026-11-04T04:30:00Z', 'America/Mexico_City')).toBe('2026-11-03');
    expect(localDateOf('2026-11-04T04:30:00Z', 'UTC')).toBe('2026-11-04');
  });
  it('respeta desplazamientos explícitos', () => {
    expect(localDateOf('2026-11-03T23:59:00-06:00', 'America/Mexico_City')).toBe('2026-11-03');
  });
  it('maneja zonas por delante de UTC', () => {
    expect(localDateOf('2026-11-03T15:30:00Z', 'Pacific/Auckland')).toBe('2026-11-04');
  });
  it('rechaza instantes no válidos', () => {
    expect(() => localDateOf('no-es-fecha', 'UTC')).toThrow(RangeError);
  });
});

describe('calendario local', () => {
  it('suma días cruzando meses y años bisiestos', () => {
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
  it('no se ve afectado por cambios de horario', () => {
    // EE. UU. cambia de horario el 1 nov 2026
    expect(addDays('2026-10-31', 2)).toBe('2026-11-02');
  });
  it('calcula el inicio de semana (lunes por defecto, configurable)', () => {
    // 3 nov 2026 es martes
    expect(startOfWeek('2026-11-03')).toBe('2026-11-02');
    expect(startOfWeek('2026-11-03', 0)).toBe('2026-11-01');
    expect(startOfWeek('2026-11-02')).toBe('2026-11-02');
    expect(weekDates('2026-11-08')).toEqual([
      '2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08',
    ]);
  });
  it('evalúa rangos inclusivos', () => {
    expect(isWithinRange('2026-11-03', '2026-11-03', '2026-11-03')).toBe(true);
    expect(isWithinRange('2026-11-04', undefined, '2026-11-03')).toBe(false);
  });
  it('calcula duración y no inventa fines', () => {
    expect(elapsedSeconds('2026-11-03T10:00:00Z', '2026-11-03T11:15:30Z')).toBe(4530);
    expect(elapsedSeconds('2026-11-03T10:00:00Z', null)).toBeNull();
    expect(elapsedSeconds('2026-11-03T10:00:00Z', '2026-11-03T09:00:00Z')).toBeNull();
  });
});
