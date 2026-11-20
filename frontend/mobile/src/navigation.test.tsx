import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

const mockNavigation = { push: jest.fn() };
const mockScreens: Array<Record<string, unknown>> = [];
const mockRepository = {
  searchExercises: jest.fn().mockResolvedValue([]),
  listRoutines: jest.fn().mockResolvedValue([]),
  getOverview: jest.fn().mockResolvedValue({ sessionsThisWeek: 0, activityMinutesThisWeek: 0, pendingSyncCount: 0, latestWorkout: null }),
  createRoutine: jest.fn().mockResolvedValue('p1'), startWorkout: jest.fn().mockResolvedValue('s1'),
  getWeeklyMuscleVolume: jest.fn().mockResolvedValue({ items: [], totalSets: 0, sessions: 0 }),
  listPrograms: jest.fn().mockResolvedValue([]), programWeekStatus: jest.fn().mockResolvedValue({}),
};

jest.mock('expo-router', () => {
  const ReactModule = require('react');
  const { View, Text } = require('react-native');
  const Screen = ({ options }: { options: { title: string } }) => { mockScreens.push(options); return <Text>{options.title}</Text>; };
  const Tabs = ({ children }: { children: React.ReactNode }) => <View>{children}</View>;
  Tabs.Screen = Screen;
  return { Tabs, useRouter: () => mockNavigation, useFocusEffect: (callback: () => void | (() => void)) => ReactModule.useEffect(callback, [callback]) };
});
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null, MaterialCommunityIcons: () => null }));
jest.mock('./data/MobileTrainingContext', () => ({ useTrainingRepository: () => mockRepository, useLocalDataReady: () => ({ ready: true, error: false }) }));

import TabLayout from '../app/(tabs)/_layout';
import TrainScreen from '../app/(tabs)/train';

test('barra de 4 pestañas: Inicio · Entrenar · Nutrición · Progreso (sin pestañas ocultas)', async () => {
  const screen = await render(<TabLayout />);
  const titles = screen.getAllByText(/.+/).map((t) => t.props.children);
  expect(titles).toEqual(['Inicio', 'Entrenar', 'Nutrición', 'Progreso']);
});

test('Entrenar: mi programa (plantillas híbridas), mis rutinas, crear rutina y sesión libre', async () => {
  mockRepository.listRoutines.mockResolvedValue([{ id: 'r1', name: 'Pierna A', exercises: [], updatedAt: new Date().toISOString() }]);
  const screen = await render(<TrainScreen />);
  await waitFor(() => expect(screen.getByText('MI PROGRAMA')).toBeTruthy());
  await waitFor(() => expect(screen.getByText('Elige tu programa')).toBeTruthy());
  await fireEvent.press(screen.getByLabelText('Crear rutina'));
  expect(mockNavigation.push).toHaveBeenCalledWith('/routines/new');
  await fireEvent.press(screen.getByLabelText('Empezar Pierna A'));
  await waitFor(() => expect(mockNavigation.push).toHaveBeenCalledWith('/workout/s1'));
});
