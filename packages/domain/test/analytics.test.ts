import { describe, expect, it } from 'vitest';
import { summarizeNutritionDay, summarizeWeek } from '../src/analytics';

const strength = (localDate: string, overrides: Record<string, unknown> = {}) => ({
  status: 'completed' as const,
  deletedAt: null,
  localDate,
  startedAt: `${localDate}T10:00:00Z`,
  endedAt: `${localDate}T11:00:00Z` as string | null,
  ...overrides,
});

describe('resumen semanal', () => {
  it('agrupa por fecha local, excluye eliminadas/no completadas y no estima duraciones', () => {
    const week = summarizeWeek(
      '2026-11-04',
      [
        strength('2026-11-02'),
        strength('2026-11-03', { endedAt: null }),
        strength('2026-11-03', { status: 'in_progress' }),
        strength('2026-11-04', { deletedAt: '2026-11-04T12:00:00Z' }),
        strength('2026-11-09'), // semana siguiente
      ],
      [{ deletedAt: null, localDate: '2026-11-03', durationSeconds: 1800 }],
    );
    expect(week.weekStart).toBe('2026-11-02');
    expect(week.weekEnd).toBe('2026-11-08');
    expect(week.completedStrengthSessions).toBe(2);
    expect(week.cardioSessions).toBe(1);
    expect(week.activeSeconds).toBe(3600 + 1800);
    expect(week.activeDays).toBe(2);
    expect(week.strengthSessionsWithoutDuration).toBe(1);
    expect(week.days).toHaveLength(7);
  });
});

describe('resumen nutricional', () => {
  it('suma solo valores registrados', () => {
    const e = (energyKcal: number | null, proteinG: number | null) => ({
      localDate: '2026-11-03',
      deletedAt: null,
      energyKcal,
      proteinG,
      carbsG: null,
      fatG: null,
    });
    const s = summarizeNutritionDay('2026-11-03', [e(500, 30), e(null, 20), { ...e(900, 1), deletedAt: 'x' }]);
    expect(s).toEqual({
      localDate: '2026-11-03',
      entryCount: 2,
      energyKcal: 500,
      proteinG: 50,
      carbsG: null,
      fatG: null,
      entriesMissingEnergy: 1,
    });
  });
});
