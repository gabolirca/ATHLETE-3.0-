import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

const mockNavigation = { push: jest.fn() };
const mockRepository = {
  searchExercises: jest.fn().mockResolvedValue([]),
  listRoutines: jest.fn().mockResolvedValue([]),
  getOverview: jest.fn().mockResolvedValue({ sessionsThisWeek: 0, activityMinutesThisWeek: 0, pendingSyncCount: 0, latestWorkout: null }),
};

jest.mock('expo-router', () => {
  const ReactModule = require('react');
  const { View, Text } = require('react-native');
  const Screen = ({ options }: { options: { title: string } }) => <Text>{options.title}</Text>;
  const Tabs = ({ children }: { children: React.ReactNode }) => <View>{children}</View>;
  Tabs.Screen = Screen;
  return { Tabs, useRouter: () => mockNavigation, useFocusEffect: (callback: () => void | (() => void)) => ReactModule.useEffect(callback, [callback]) };
});
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('./data/MobileTrainingContext', () => ({ useTrainingRepository: () => mockRepository, useLocalDataReady: () => ({ ready: true, error: false }) }));

import TabLayout from '../app/(tabs)/_layout';
import TrainScreen from '../app/(tabs)/train';

test('registers all five persistent main tabs with the intended labels', async () => {
  const screen = await render(<TabLayout />);
  for (const title of ['Inicio', 'Entrenar', 'Progreso', 'Nutrición', 'Perfil']) {
    expect(screen.getByText(title)).toBeTruthy();
  }
});

test('the free workout action navigates to the real session start route', async () => {
  const screen = await render(<TrainScreen />);
  await waitFor(() => expect(screen.getByText('Empieza cuando quieras')).toBeTruthy());
  await fireEvent.press(screen.getByText('Iniciar sesión libre'));
  expect(mockNavigation.push).toHaveBeenCalledWith('/workout/new');
});
