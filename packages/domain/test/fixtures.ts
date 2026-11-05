import type { StrengthSet } from '@athlete/contracts';
import type { HistoricalSet } from '../src/records';

let n = 0;
export const uuid = () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;

export function set(overrides: Partial<StrengthSet> = {}): StrengthSet {
  return {
    id: uuid(),
    userId: '00000000-0000-4000-8000-aaaaaaaaaaaa',
    createdAt: '2026-11-03T10:00:00Z',
    updatedAt: '2026-11-03T10:00:00Z',
    deletedAt: null,
    revision: null,
    sessionExerciseId: '00000000-0000-4000-8000-bbbbbbbbbbbb',
    position: 0,
    setType: 'working',
    weightKg: 100,
    reps: 5,
    rir: null,
    rpe: null,
    restSeconds: null,
    durationSeconds: null,
    distanceMeters: null,
    completedAt: '2026-11-03T10:05:00Z',
    notes: null,
    ...overrides,
  };
}

export function hset(sessionId: string, localDate: string, overrides: Partial<StrengthSet> = {}): HistoricalSet {
  return { ...set({ completedAt: `${localDate}T10:00:00Z`, ...overrides }), sessionId, localDate };
}
