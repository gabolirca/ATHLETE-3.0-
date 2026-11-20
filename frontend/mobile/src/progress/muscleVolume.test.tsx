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
  getAthleteProfile: jest.fn().mockResolvedValue({ goals: ['4 días por semana'] }),
  getOverview: jest.fn().mockResolvedValue({ sessionsThisWeek: 3, strengthSessionsThisWeek: 2, cardioSessionsThisWeek: 1, activityMinutesThisWeek: 140, pendingSyncCount: 0, latestWorkout: null }),
  getWeeklyMuscleVolume: jest.fn().mockResolvedValue(volume),
  getStreak: jest.fn().mockResolvedValue({ days: { current: 5, best: 9, todayDone: true, atRisk: false, daysSinceLast: 0 }, weeks: null, programName: null }),
  listHistory: jest.fn().mockResolvedValue([]), listRoutines: jest.fn().mockResolvedValue([]),
  createRoutine: jest.fn().mockResolvedValue('plan-pierna'), startWorkout: jest.fn().mockResolvedValue('s-nueva'),
  listPrograms: jest.fn().mockResolvedValue([]), programWeekStatus: jest.fn().mockResolvedValue({}),
  startProgramDay: jest.fn().mockResolvedValue('s-programa'),
  listBodyMeasurements: jest.fn().mockResolvedValue([]), getBodyGoals: jest.fn().mockResolvedValue({ weight_kg: null }),
};
const todayWd = ((new Date().getDay() + 6) % 7) + 1;
const program = { id: 'p1', name: 'Híbrido 3 días', templateSlug: 'hibrido-3-dias', startedOn: null,
  days: [{ id: 'd1', name: 'Fuerza A', weekday: todayWd, modality: 'strength', targetRpe: 7, targetDurationMinutes: 60, blocks: [], exercises: [] }] };
jest.mock('expo-router', () => {
  const ReactModule = require('react');
  return { useRouter: () => mockRouter, useFocusEffect: (cb: () => void) => ReactModule.useEffect(cb, [cb]) };
});
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null, MaterialCommunityIcons: () => null }));
jest.mock('@/data/MobileTrainingContext', () => ({ useTrainingRepository: () => mockRepository, useLocalDataReady: () => ({ ready: true, error: false }) }));

import HomeScreen from '../../app/(tabs)/index';

beforeEach(() => { mockRouter.push.mockClear(); mockRepository.createRoutine.mockClear(); mockRepository.startWorkout.mockClear(); });

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

test('Inicio con programa: "Hoy te toca" sale del programa y EMPEZAR abre la sesión del día', async () => {
  mockRepository.listPrograms.mockResolvedValueOnce([program]);
  const screen = await render(<HomeScreen/>);
  await waitFor(() => expect(screen.getByText('Hola, Gabo')).toBeTruthy());
  await waitFor(() => expect(screen.getByText('HOY TE TOCA')).toBeTruthy());
  expect(screen.getAllByText('Fuerza A').length).toBeGreaterThan(0);
  expect(screen.getByText('60 MIN')).toBeTruthy();
  expect(screen.getByLabelText('Racha de 5 días')).toBeTruthy();
  await fireEvent.press(screen.getByText('Empezar  →'));
  await waitFor(() => expect(mockRepository.startProgramDay).toHaveBeenCalledWith('d1'));
  await waitFor(() => expect(mockRouter.push).toHaveBeenCalledWith('/workout/s-programa'));
  await fireEvent.press(screen.getByLabelText('Tu semana: ver progreso'));
  expect(mockRouter.push).toHaveBeenCalledWith('/progress');
});

test('Inicio sin programa: entrenamiento libre', async () => {
  const screen = await render(<HomeScreen/>);
  await waitFor(() => expect(screen.getByText('ENTRENA HOY')).toBeTruthy());
  await fireEvent.press(screen.getByText('Empezar  →'));
  expect(mockRouter.push).toHaveBeenCalledWith('/workout/new');
});

test('Inicio con sesión en curso: el botón es Continuar y no crea otra', async () => {
  mockRepository.getOverview.mockResolvedValueOnce({ sessionsThisWeek: 1, strengthSessionsThisWeek: 1, cardioSessionsThisWeek: 0, activityMinutesThisWeek: 0, pendingSyncCount: 0, latestWorkout: { id: 's-activa', state: 'active', exerciseCount: 6, setCount: 3 } });
  const screen = await render(<HomeScreen/>);
  await waitFor(() => expect(screen.getByText('SESIÓN EN CURSO')).toBeTruthy());
  await fireEvent.press(screen.getByText('Continuar  →'));
  expect(mockRouter.push).toHaveBeenCalledWith('/workout/s-activa');
  expect(mockRepository.startWorkout).not.toHaveBeenCalled();
});
