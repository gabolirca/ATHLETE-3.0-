import { mergeHistory } from './history';
import type { CardioEntry, Workout } from './trainingTypes';

const workout = (id: string, startedAt: string): Workout => ({ id, state: 'completed', startedAt, completedAt: startedAt, localVersion: null, serverVersion: null, syncStatus: 'pending', exerciseCount: 1, setCount: 3, durationMinutes: 40 });
const cardio = (id: string, startedAt: string): CardioEntry => ({ id, activity: 'run', startedAt, localDate: startedAt.slice(0, 10), durationSeconds: 1800, distanceMeters: 5000, rounds: null, rpe: null, avgHeartRateBpm: null, maxHeartRateBpm: null, swim: null, notes: null, syncStatus: 'pending' });

test('mezcla fuerza y cardio del más reciente al más antiguo', () => {
  const items = mergeHistory(
    [workout('w1', '2026-11-03T10:00:00.000Z'), workout('w2', '2026-11-05T10:00:00.000Z')],
    [cardio('c1', '2026-11-04T07:00:00.000Z')],
  );
  expect(items.map((i) => (i.kind === 'strength' ? i.workout.id : i.cardio.id))).toEqual(['w2', 'c1', 'w1']);
});

test('sin registros devuelve lista vacía', () => {
  expect(mergeHistory([], [])).toEqual([]);
});
