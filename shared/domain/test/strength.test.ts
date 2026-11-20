import { describe, expect, it } from 'vitest';
import { estimateE1rm, isEffectiveSet, setVolumeKg, summarizeSets, summarizeStrengthSession } from '../src/strength';
import { set } from './fixtures';

describe('series efectivas', () => {
  it('excluye calentamientos, no ejecutadas, eliminadas y sin repeticiones', () => {
    expect(isEffectiveSet(set())).toBe(true);
    expect(isEffectiveSet(set({ setType: 'warmup' }))).toBe(false);
    expect(isEffectiveSet(set({ completedAt: null }))).toBe(false);
    expect(isEffectiveSet(set({ deletedAt: '2026-11-03T11:00:00Z' }))).toBe(false);
    expect(isEffectiveSet(set({ reps: 0 }))).toBe(false);
    expect(isEffectiveSet(set({ reps: null }))).toBe(false);
  });
  it('cuenta series de trabajo sin peso (peso corporal)', () => {
    expect(isEffectiveSet(set({ weightKg: null, reps: 10 }))).toBe(true);
  });
});

describe('volumen', () => {
  it('peso × repeticiones; null si falta un dato', () => {
    expect(setVolumeKg(set({ weightKg: 60, reps: 8 }))).toBe(480);
    expect(setVolumeKg(set({ weightKg: null }))).toBeNull();
  });
  it('resume sin contar calentamientos ni inventar volumen', () => {
    const summary = summarizeSets([
      set({ setType: 'warmup', weightKg: 40, reps: 10 }),
      set({ weightKg: 100, reps: 5 }),
      set({ weightKg: 100, reps: 5, rir: null }),
      set({ weightKg: null, reps: 12 }),
      set({ completedAt: null }),
    ]);
    expect(summary).toEqual({
      workingSetCount: 3,
      warmupSetCount: 1,
      totalReps: 22,
      volumeKg: 1000,
      effectiveSetsWithoutLoad: 1,
    });
  });
  it('devuelve volumen null si ninguna serie tiene carga', () => {
    expect(summarizeSets([set({ weightKg: null })]).volumeKg).toBeNull();
    expect(summarizeSets([]).volumeKg).toBeNull();
  });
  it('resume una sesión ignorando ejercicios eliminados', () => {
    const live = { deletedAt: null, sets: [set({ weightKg: 50, reps: 10 })] };
    const removed = { deletedAt: '2026-11-03T11:00:00Z', sets: [set({ weightKg: 500, reps: 10 })] };
    const summary = summarizeStrengthSession({ exercises: [live, removed] as never });
    expect(summary.exerciseCount).toBe(1);
    expect(summary.volumeKg).toBe(500);
  });
});

describe('e1RM', () => {
  it('Epley y Brzycki', () => {
    expect(estimateE1rm(100, 5)).toBeCloseTo(116.667, 3);
    expect(estimateE1rm(100, 5, { formula: 'brzycki' })).toBeCloseTo(112.5, 3);
  });
  it('1 repetición = peso levantado', () => {
    expect(estimateE1rm(140, 1)).toBe(140);
  });
  it('null fuera de rango o sin datos', () => {
    expect(estimateE1rm(100, 13)).toBeNull();
    expect(estimateE1rm(100, 15, { maxReps: 20 })).toBeCloseTo(150, 6);
    expect(estimateE1rm(null, 5)).toBeNull();
    expect(estimateE1rm(0, 5)).toBeNull();
    expect(estimateE1rm(100, 0)).toBeNull();
  });
});
