import React from 'react';
import { render, waitFor, fireEvent } from '@testing-library/react-native';
import { donutArcs, OTHERS_COLOR } from '@/charts/Donut';
import { formatSets, lowMuscles, muscleSegments } from './muscleVolume';
import type { WeeklyMuscleVolume } from '@/data/trainingTypes';

const mockRouter = { push: jest.fn() };
const volume: WeeklyMuscleVolume = {
  totalSets: 16, sessions: 2,
  items: [
    { muscle: 'chest', name: 'Pecho', sets: 12, status: 'ok', range: [10, 20] },
    { muscle: 'triceps', name: 'Tríceps', sets: 6, status: 'ok', range: [6, 16] },
    { muscle: 'shoulders', name: 'Hombros', sets: 5.5, status: 'low', range: [8, 20] },
    { muscle: 'back', name: 'Espalda', sets: 4, status: 'low', range: [10, 20] },
    { muscle: 'biceps', name: 'Bíceps', sets: 2, status: 'low', range: [6, 16] },
    { muscle: 'forearms', name: 'Antebrazos', sets: 1, status: 'untracked', range: null },
    { muscle: 'core', name: 'Core', sets: 0.5, status: 'low', range: [6, 16] },
    { muscle: 'quadriceps', name: 'Cuádriceps', sets: 0, status: 'low', range: [10, 20] },
  ],
};
const mockRepository = {
  getPreferences: jest.fn().mockResolvedValue({ displayName: 'Gabo' }),
  getOverview: jest.fn().mockResolvedValue({ sessionsThisWeek: 3, strengthSessionsThisWeek: 2, cardioSessionsThisWeek: 1, activityMinutesThisWeek: 140, pendingSyncCount: 0, latestWorkout: null }),
  getWeeklyMuscleVolume: jest.fn().mockResolvedValue(volume),
};
jest.mock('expo-router', () => {
  const ReactModule = require('react');
  return { useRouter: () => mockRouter, useFocusEffect: (cb: () => void) => ReactModule.useEffect(cb, [cb]) };
});
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('@/data/MobileTrainingContext', () => ({ useTrainingRepository: () => mockRepository, useLocalDataReady: () => ({ ready: true, error: false }) }));

import HomeScreen from '../../app/(tabs)/index';

test('arcos de la dona: proporcionales, con separación y sin segmentos vacíos', () => {
  const arcs = donutArcs([{ key: 'a', value: 3, color: 'x' }, { key: 'b', value: 1, color: 'y' }, { key: 'c', value: 0, color: 'z' }], 400, 4);
  expect(arcs).toEqual([{ key: 'a', color: 'x', length: 296, offset: -0 }, { key: 'b', color: 'y', length: 96, offset: -300 }]);
  expect(donutArcs([{ key: 'a', value: 2, color: 'x' }], 400)).toEqual([{ key: 'a', color: 'x', length: 400, offset: -0 }]);
  expect(donutArcs([], 400)).toEqual([]);
});

test('segmentos: los 5 músculos con más series y el resto en "Otros"; avisos de músculos bajos', () => {
  const segs = muscleSegments(volume);
  expect(segs.map((s) => [s.name, s.sets])).toEqual([['Pecho', 12], ['Tríceps', 6], ['Hombros', 5.5], ['Espalda', 4], ['Bíceps', 2], ['Otros', 1.5]]);
  expect(segs[5]!.color).toBe(OTHERS_COLOR);
  expect(muscleSegments(null)).toEqual([]);
  expect(lowMuscles(volume).map((m) => m.name)).toEqual(['Hombros', 'Espalda', 'Bíceps', 'Core', 'Cuádriceps']);
  expect([formatSets(3), formatSets(1.5)]).toEqual(['3', '1.5']);
});

test('Inicio muestra la dona de la semana con leyenda, totales y aviso; tocarla lleva a Progreso', async () => {
  const screen = await render(<HomeScreen/>);
  await waitFor(() => expect(screen.getByLabelText('16 series')).toBeTruthy());
  expect(screen.getByText('Pecho')).toBeTruthy();
  expect(screen.getByText('5.5')).toBeTruthy();
  expect(screen.getByText('140')).toBeTruthy();
  expect(screen.getByText('Por debajo de la referencia: Hombros, Espalda, Bíceps y 2 más')).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('Ver detalle de tu semana en Progreso'));
  expect(mockRouter.push).toHaveBeenCalledWith('/progress');
});
