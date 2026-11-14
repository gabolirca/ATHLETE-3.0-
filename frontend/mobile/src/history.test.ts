import { effortDescription } from '../app/history/[sessionId]';

describe('effortDescription', () => {
  test('returns empty string when value is null', () => {
    expect(effortDescription(null)).toBe('');
  });

  test('formats zero RIR as distinct effort', () => {
    expect(effortDescription(0)).toBe(' · ninguna repetición más');
  });

  test('formats half-step 0.5 RIR correctly', () => {
    expect(effortDescription(0.5)).toBe(' · 0.5 media repetición más');
  });

  test('formats 1 RIR correctly singular', () => {
    expect(effortDescription(1)).toBe(' · 1 repetición más');
  });

  test('formats integer and half-step RIR up to 10 plural', () => {
    expect(effortDescription(1.5)).toBe(' · 1.5 repeticiones más');
    expect(effortDescription(2)).toBe(' · 2 repeticiones más');
    expect(effortDescription(3.5)).toBe(' · 3.5 repeticiones más');
    expect(effortDescription(10)).toBe(' · 10 repeticiones más');
  });

  test('warns when value is outside 0-10 or not a multiple of 0.5', () => {
    expect(effortDescription(-1)).toBe(' · valor guardado fuera del rango permitido (-1)');
    expect(effortDescription(10.5)).toBe(' · valor guardado fuera del rango permitido (10.5)');
    expect(effortDescription(1.2)).toBe(' · valor guardado fuera del rango permitido (1.2)');
    expect(effortDescription(0.25)).toBe(' · valor guardado fuera del rango permitido (0.25)');
  });
});
