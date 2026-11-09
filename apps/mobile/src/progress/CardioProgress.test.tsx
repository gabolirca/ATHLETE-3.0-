import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import { localDateOfDevice } from '@/lib/localDate';

const today = localDateOfDevice(new Date());
const entry = (id: string, activity: string, localDate: string, durationSeconds: number, distanceMeters: number | null) =>
  ({ id, activity, localDate, startedAt: `${localDate}T12:00:00.000Z`, durationSeconds, distanceMeters, rounds: null, rpe: null, avgHeartRateBpm: null, maxHeartRateBpm: null, swim: null, notes: null, syncStatus: 'synced' });
const mockRepository = {
  listCardio: jest.fn().mockResolvedValue([entry('a', 'run', today, 1500, 5000), entry('b', 'swim', today, 2400, 1500), entry('c', 'run', '2026-01-10', 3000, 10000)]),
  getPreferences: jest.fn().mockResolvedValue({ unitSystem: 'metric' }),
};
jest.mock('expo-router', () => { const R = require('react'); return { useFocusEffect: (cb: () => void) => R.useEffect(cb, [cb]) }; });
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('@/data/MobileTrainingContext', () => ({ useTrainingRepository: () => mockRepository }));

import { CardioProgress } from './CardioProgress';

test('Progreso de cardio: distancia de la semana por actividad y mejores marcas', async () => {
  const screen = await render(<CardioProgress/>);
  await waitFor(() => expect(screen.getByText('5.00 km')).toBeTruthy());
  expect(screen.getAllByText('1500 m').length).toBeGreaterThan(0);
  expect(screen.getByText('10.00 km')).toBeTruthy(); // más larga (fuera de la semana)
  expect(screen.getByText('5:00 /km')).toBeTruthy(); // mejor ritmo: 5 km en 25 min
  expect(screen.getAllByText('2:40 /100 m').length).toBeGreaterThan(0);
  expect(screen.getByText('NATACIÓN · METROS POR SEMANA')).toBeTruthy();
});
