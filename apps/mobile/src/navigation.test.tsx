import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

const mockNavigation = { push: jest.fn() };
const mockScreens: Array<Record<string, unknown>> = [];
const mockRepository = {
  searchExercises: jest.fn().mockResolvedValue([]),
  listRoutines: jest.fn().mockResolvedValue([]),
  getOverview: jest.fn().mockResolvedValue({ sessionsThisWeek: 0, activityMinutesThisWeek: 0, pendingSyncCount: 0, latestWorkout: null }),
};

jest.mock('expo-router', () => {
  const ReactModule = require('react');
  const { View, Text } = require('react-native');
  const Screen = ({ options }: { options: { title: string } }) => { mockScreens.push(options); return <Text>{options.title}</Text>; };
  const Tabs = ({ children }: { children: React.ReactNode }) => <View>{children}</View>;
  Tabs.Screen = Screen;
  return { Tabs, useRouter: () => mockNavigation, useFocusEffect: (callback: () => void | (() => void)) => ReactModule.useEffect(callback, [callback]) };
});
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('./data/MobileTrainingContext', () => ({ useTrainingRepository: () => mockRepository, useLocalDataReady: () => ({ ready: true, error: false }) }));

import TabLayout from '../app/(tabs)/_layout';
import TrainScreen from '../app/(tabs)/train';

test('barra: Inicio · Entrenar · ＋ · Progreso · Nutrición; Perfil sale de la barra (se abre desde el avatar)', async () => {
  const screen = await render(<TabLayout />);
  const titles = screen.getAllByText(/.+/).map((t) => t.props.children);
  expect(titles).toEqual(['Inicio', 'Entrenar', 'Registrar', 'Progreso', 'Nutrición', 'Perfil']);
  expect(mockScreens.find((o) => o.title === 'Perfil')).toMatchObject({ href: null });
  expect(typeof mockScreens.find((o) => o.title === 'Registrar')?.tabBarButton).toBe('function');
});

test('the free workout action navigates to the real session start route', async () => {
  const screen = await render(<TrainScreen />);
  await waitFor(() => expect(screen.getByText('Empieza cuando quieras')).toBeTruthy());
  await fireEvent.press(screen.getByText('Iniciar sesión libre'));
  expect(mockNavigation.push).toHaveBeenCalledWith('/workout/new');
});
