import { describe, expect, it } from 'vitest';
import { fromCm, fromKg, roundTo, toCm, toKg } from '../src/units';

describe('unidades', () => {
  it('convierte lb ↔ kg con el factor exacto', () => {
    expect(toKg(100, 'lb')).toBeCloseTo(45.359237, 9);
    expect(fromKg(toKg(225, 'lb'), 'lb')).toBeCloseTo(225, 9);
    expect(toKg(80, 'kg')).toBe(80);
  });
  it('convierte in ↔ cm', () => {
    expect(toCm(10, 'in')).toBeCloseTo(25.4, 9);
    expect(fromCm(25.4, 'in')).toBeCloseTo(10, 9);
  });
  it('redondea para presentación', () => {
    expect(roundTo(1.005, 2)).toBe(1.01);
    expect(roundTo(45.359237, 1)).toBe(45.4);
  });
});
