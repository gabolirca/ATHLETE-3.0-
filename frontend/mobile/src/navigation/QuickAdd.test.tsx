import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';

const mockRouter = { push: jest.fn() };
jest.mock('expo-router', () => ({ useRouter: () => mockRouter }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));

import { QuickAddButton } from './QuickAdd';
import { greeting, initials } from '../../app/(tabs)/index';

jest.mock('@/data/MobileTrainingContext', () => ({ useTrainingRepository: () => null, useLocalDataReady: () => ({ ready: true, error: false }) }));

test('el "+" abre la hoja y cada opción lleva a su registro', async () => {
  const screen = await render(<QuickAddButton/>);
  expect(screen.queryByText('¿Qué quieres registrar?')).toBeNull();
  await fireEvent.press(screen.getByLabelText('Registrar'));
  expect(screen.getByText('¿Qué quieres registrar?')).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('Cardio'));
  expect(mockRouter.push).toHaveBeenCalledWith('/cardio/new');
  expect(screen.queryByText('¿Qué quieres registrar?')).toBeNull();
  await fireEvent.press(screen.getByLabelText('Registrar'));
  await fireEvent.press(screen.getByLabelText('Comida'));
  expect(mockRouter.push).toHaveBeenLastCalledWith('/nutrition/new');
});

test('saludo por hora e iniciales del avatar', () => {
  expect([7, 15, 22, 3].map((h) => greeting(new Date(2026, 10, 8, h)))).toEqual(['Buenos días', 'Buenas tardes', 'Buenas noches', 'Buenas noches']);
  expect(initials('Gabriel Lira Castelán')).toBe('GL');
  expect(initials('  gabo ')).toBe('G');
  expect(initials('')).toBe('');
});
