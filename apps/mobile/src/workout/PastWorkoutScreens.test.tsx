import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { localDateOfDevice, shiftDay } from '@/lib/localDate';

const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn() };
let mockParams: Record<string, string> = {};
const mockRepository = {
  listRoutines: jest.fn().mockResolvedValue([]),
  startWorkout: jest.fn().mockResolvedValue('s1'),
  getWorkout: jest.fn(),
  finishWorkout: jest.fn().mockResolvedValue(undefined),
};

jest.mock('expo-router', () => {
  const { useEffect } = jest.requireActual('react');
  return {
    useRouter: () => mockRouter,
    useLocalSearchParams: () => mockParams,
    useFocusEffect: (cb: () => void) => useEffect(cb, [cb]),
  };
});
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('@/data/MobileTrainingContext', () => ({ useTrainingRepository: () => mockRepository }));

import StartWorkoutScreen from '../../app/workout/new';
import WorkoutScreen from '../../app/workout/[sessionId]';

beforeEach(() => { jest.clearAllMocks(); mockParams = {}; });

async function pickYesterday(screen: Awaited<ReturnType<typeof render>>) {
  await fireEvent.press(screen.getByLabelText(/^Día: Hoy/));
  if (new Date().getDate() === 1) await fireEvent.press(screen.getByLabelText('Mes anterior'));
  await fireEvent.press(screen.getByLabelText('Ayer'));
}

test('hoy: empieza ahora, como siempre', async () => {
  const screen = await render(<StartWorkoutScreen />);
  await fireEvent.press(screen.getByText('Comenzar sesión libre'));
  await waitFor(() => expect(mockRepository.startWorkout).toHaveBeenCalledWith(undefined, {}));
  expect(mockRouter.replace).toHaveBeenCalledWith('/workout/s1');
});

test('otro día: pide la hora y registra el entrenamiento en esa fecha', async () => {
  const screen = await render(<StartWorkoutScreen />);
  await pickYesterday(screen);
  await waitFor(() => expect(screen.getByText('Registrar entrenamiento')).toBeTruthy());
  await fireEvent.press(screen.getByText('Registrar sesión libre'));
  await waitFor(() => expect(screen.getByText('Indica a qué hora empezaste (HH:MM, por ejemplo 18:30).')).toBeTruthy());
  expect(mockRepository.startWorkout).not.toHaveBeenCalled();

  await fireEvent.changeText(screen.getByLabelText('Hora de inicio (HH:MM)'), '18:30');
  await fireEvent.press(screen.getByText('Registrar sesión libre'));
  await waitFor(() => expect(mockRepository.startWorkout).toHaveBeenCalledTimes(1));
  const started = new Date(mockRepository.startWorkout.mock.calls[0][1].startedAt);
  expect(localDateOfDevice(started)).toBe(shiftDay(localDateOfDevice(new Date()), -1));
  expect([started.getHours(), started.getMinutes()]).toEqual([18, 30]);
});

test('con un entrenamiento en curso avisa en vez de abrirlo', async () => {
  mockRepository.startWorkout.mockRejectedValueOnce(new Error('ACTIVE_WORKOUT_EXISTS'));
  const screen = await render(<StartWorkoutScreen />);
  await pickYesterday(screen);
  await fireEvent.changeText(screen.getByLabelText('Hora de inicio (HH:MM)'), '07:00');
  await fireEvent.press(screen.getByText('Registrar sesión libre'));
  await waitFor(() => expect(screen.getByText(/Tienes un entrenamiento en curso/)).toBeTruthy());
  expect(mockRouter.replace).not.toHaveBeenCalled();
});

test('al finalizar un entrenamiento pasado pide la duración y la envía', async () => {
  mockParams = { sessionId: 's1' };
  const startedAt = new Date(Date.now() - 2 * 86_400_000).toISOString();
  mockRepository.getWorkout.mockResolvedValue({
    workout: { id: 's1', state: 'active', startedAt, completedAt: null, localVersion: 1, serverVersion: null, syncStatus: 'pending', exerciseCount: 0, setCount: 0, durationMinutes: null },
    exercises: [],
  });
  const screen = await render(<WorkoutScreen />);
  await waitFor(() => expect(screen.getByText('Entrenamiento pasado')).toBeTruthy());
  await fireEvent.changeText(screen.getByLabelText('¿Cuánto duró? (minutos)'), '0');
  await fireEvent.press(screen.getByText('Finalizar y guardar sesión'));
  await waitFor(() => expect(screen.getByText('Indica cuántos minutos duró (entre 1 y 600).')).toBeTruthy());
  await fireEvent.changeText(screen.getByLabelText('¿Cuánto duró? (minutos)'), '75');
  await fireEvent.press(screen.getByText('Finalizar y guardar sesión'));
  await waitFor(() => expect(mockRepository.finishWorkout).toHaveBeenCalledWith('s1', { durationMinutes: 75 }));
});
