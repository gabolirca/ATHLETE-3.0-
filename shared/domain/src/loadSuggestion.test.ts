import { describe, expect, it } from 'vitest';
import { suggestLoad } from './loadSuggestion';

const s = (weightKg: number | null, reps: number | null, rir: number | null = null) => ({ weightKg, reps, rir });

describe('suggestLoad con RIR', () => {
  it('le sobró margen → sube (limitado a 2 incrementos)', () => {
    expect(suggestLoad({ lastSets: [s(80, 5, 4)], targetReps: 5, targetRir: 2 })).toMatchObject({ weightKg: 85, reps: 5, action: 'increase' });
    expect(suggestLoad({ lastSets: [s(80, 5, 3)], targetReps: 5, targetRir: 2 })).toMatchObject({ weightKg: 82.5, action: 'increase' });
    expect(suggestLoad({ lastSets: [s(80, 5, 9)], targetReps: 5, targetRir: 2 })!.weightKg).toBe(85);
  });
  it('justo en el objetivo → repite; pasado del objetivo → baja', () => {
    expect(suggestLoad({ lastSets: [s(80, 5, 2)], targetReps: 5, targetRir: 2 })).toMatchObject({ weightKg: 80, action: 'repeat' });
    expect(suggestLoad({ lastSets: [s(80, 5, 0)], targetReps: 5, targetRir: 2 })).toMatchObject({ weightKg: 75, action: 'decrease' });
  });
  it('usa la serie más pesada y sin objetivo de RIR asume 2', () => {
    const r = suggestLoad({ lastSets: [s(60, 10, 2), s(80, 5, 2), s(80, 4, 2)], targetReps: 5, targetRir: null })!;
    expect(r).toMatchObject({ weightKg: 80, reps: 5, action: 'repeat' });
    expect(r.reason).toContain('80 kg × 5 con 2 en reserva');
  });
  it('respeta el incremento del equipo', () => {
    expect(suggestLoad({ lastSets: [s(20, 10, 5)], targetReps: 10, targetRir: 2, incrementKg: 2 })).toMatchObject({ weightKg: 22, action: 'increase' });
    expect(suggestLoad({ lastSets: [s(20, 10, 3)], targetReps: 10, targetRir: 2, incrementKg: 2 })).toMatchObject({ weightKg: 20, action: 'repeat' });
  });
});

describe('suggestLoad sin RIR (doble progresión)', () => {
  it('todas las series llegaron a las reps → sube un incremento', () => {
    expect(suggestLoad({ lastSets: [s(60, 8), s(60, 8), s(60, 8)], targetReps: 8, targetRir: 2 })).toMatchObject({ weightKg: 62.5, reps: 8, action: 'increase' });
  });
  it('faltaron pocas → repite; faltaron muchas → baja 5 %', () => {
    expect(suggestLoad({ lastSets: [s(60, 8), s(60, 7)], targetReps: 8, targetRir: 2 })).toMatchObject({ weightKg: 60, action: 'repeat' });
    expect(suggestLoad({ lastSets: [s(60, 5)], targetReps: 8, targetRir: 2 })).toMatchObject({ weightKg: 57.5, action: 'decrease' });
  });
  it('sin objetivo de reps → mismo peso y una más; peso corporal → una más', () => {
    expect(suggestLoad({ lastSets: [s(60, 8)], targetReps: null, targetRir: null })).toMatchObject({ weightKg: 60, reps: 9, action: 'more_reps' });
    expect(suggestLoad({ lastSets: [s(null, 10), s(null, 12)], targetReps: 10, targetRir: 2 })).toMatchObject({ weightKg: null, reps: 13, action: 'more_reps' });
  });
  it('sin series válidas no sugiere nada', () => {
    expect(suggestLoad({ lastSets: [s(60, null)], targetReps: 5, targetRir: 2 })).toBeNull();
  });
});
