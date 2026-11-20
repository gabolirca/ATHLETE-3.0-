import { closeIfStale, estimatedMinutes, isStale } from './staleSession';

jest.mock('@/data/OfficialTrainingRepository', () => ({ PAST_WORKOUT_MS: 12 * 3_600_000 }));

const now = Date.parse('2026-11-20T18:00:00Z');
const w = (hoursAgo: number, setCount: number) => ({ id: 's1', state: 'active' as const, startedAt: new Date(now - hoursAgo * 3_600_000).toISOString(), completedAt: null, localVersion: 1, serverVersion: null, syncStatus: 'pending' as const, exerciseCount: 3, setCount, durationMinutes: null });

test('una sesión de más de 12 h se cierra sola; vacía se descarta; reciente no se toca', async () => {
  const repo = { finishWorkout: jest.fn().mockResolvedValue(undefined), tombstoneWorkout: jest.fn().mockResolvedValue(undefined) };
  expect(isStale(w(2, 5), now)).toBe(false);
  expect(await closeIfStale(repo as never, w(2, 5), now)).toBeNull();
  expect(await closeIfStale(repo as never, w(30, 12), now)).toBe('closed');
  expect(repo.finishWorkout).toHaveBeenCalledWith('s1', { durationMinutes: 46 });
  expect(await closeIfStale(repo as never, w(30, 0), now)).toBe('discarded');
  expect(repo.tombstoneWorkout).toHaveBeenCalledWith('s1');
  expect([estimatedMinutes(0), estimatedMinutes(40)]).toEqual([15, 120]);
});
