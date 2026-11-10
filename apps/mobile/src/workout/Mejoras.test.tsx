import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { toDisplay, toKg, __resetWeightUnitsCache } from '@/settings/weightUnits';
import { exerciseProgress } from '@/workout/guide';

const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn() };
const mockStore = new Map<string, string>();
type S = { id: string; setIndex: number; weightKg: number | null; reps: number | null; rir: number | null; isWarmup: boolean; durationSeconds?: number | null; distanceMeters?: number | null };
const set = (id: string, setIndex: number, weightKg: number | null, reps: number | null, rir: number | null = null): S => ({ id, setIndex, weightKg, reps, rir, isWarmup: false, durationSeconds: null, distanceMeters: null });
const exercise = (id: string, name: string, setsTarget: number | null, sets: S[], extra: Record<string, unknown> = {}) => ({
  id, exerciseId: `e-${id}`, exerciseName: name, sortOrder: 0, setsTarget, repsTarget: 8, restSeconds: 90, targetRir: null, sets, newRecords: [], previous: null, loadType: 'external', ...extra,
});
const workout = (exercises: ReturnType<typeof exercise>[], trainingDayId: string | null = 'd1') => ({
  workout: { id: 's1', state: 'active', startedAt: new Date().toISOString(), completedAt: null, localVersion: 1, serverVersion: null, syncStatus: 'pending', exerciseCount: exercises.length, setCount: 0, durationMinutes: null },
  exercises, trainingDayId,
});
const mockRepository = { getWorkout: jest.fn(), saveSet: jest.fn().mockResolvedValue(undefined), finishWorkout: jest.fn(), addSet: jest.fn(), addExercise: jest.fn(), removeWorkoutExercise: jest.fn().mockResolvedValue(undefined) };

jest.mock('expo-router', () => {
  const { useEffect } = jest.requireActual('react');
  return { useRouter: () => mockRouter, useLocalSearchParams: () => ({ sessionId: 's1' }), useFocusEffect: (cb: () => void) => useEffect(cb, [cb]) };
});
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('@/data/MobileTrainingContext', () => ({ useTrainingRepository: () => mockRepository }));
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async (k: string) => mockStore.get(k) ?? null),
  setItemAsync: jest.fn(async (k: string, v: string) => { mockStore.set(k, v); }),
}));

import WorkoutScreen from '../../app/workout/[sessionId]';

beforeEach(() => { jest.clearAllMocks(); mockStore.clear(); __resetWeightUnitsCache(); });

test('kg siempre por dentro: lb se convierte y se muestra redondeado a 0.5', () => {
  expect(toKg(135, 'lb')).toBe(61.23);
  expect(toDisplay(61.23, 'lb')).toBe(135);
  expect(toDisplay(60, 'kg')).toBe(60);
});

test('la plancha (serie por tiempo) cuenta como hecha: ya no se queda abierta para siempre', () => {
  const sets = [{ ...set('p1', 0, null, null), durationSeconds: 40 }, { ...set('p2', 1, null, null), durationSeconds: 40 }];
  expect(exerciseProgress({ sets, setsTarget: 2 })).toEqual({ done: 2, target: 2, complete: true });
});

test('series hechas se pliegan y se ve "SERIE 3/3"; la máquina en lb guarda kg', async () => {
  mockStore.set('athlete3.units.v1', JSON.stringify({ 'e-a': 'lb' }));
  mockRepository.getWorkout.mockResolvedValue(workout([
    exercise('a', 'Press en máquina', 3, [set('a1', 0, 61.23, 10, 2), set('a2', 1, 61.23, 9, 1), set('a3', 2, null, null)]),
  ]));
  const screen = await render(<WorkoutScreen />);
  await waitFor(() => expect(screen.getByText('SERIE 3/3')).toBeTruthy());
  expect(screen.getAllByText('135 lb × 10 · 2 en reserva')).toHaveLength(1); // plegada
  expect(screen.getByText('✓ SERIE 1/3')).toBeTruthy();
  await fireEvent.changeText(screen.getByLabelText('Peso (lb)'), '135');
  await fireEvent.changeText(screen.getByLabelText('Repeticiones'), '8');
  await fireEvent(screen.getByLabelText('Repeticiones'), 'blur');
  await waitFor(() => expect(mockRepository.saveSet).toHaveBeenCalledWith('s1', 'a3', expect.objectContaining({ weightKg: 61.23, reps: 8 })));
});

test('en un entrenamiento del plan solo se quitan los ejercicios agregados; en libre, todos', async () => {
  mockRepository.getWorkout.mockResolvedValue(workout([
    exercise('a', 'Sentadilla', 3, [set('a1', 0, null, null)], { fromPlan: true }),
    exercise('b', 'Curl', null, [set('b1', 0, null, null)], { fromPlan: false }),
  ]));
  const screen = await render(<WorkoutScreen />);
  await waitFor(() => expect(screen.getByLabelText('Quitar Curl')).toBeTruthy());
  expect(screen.queryByLabelText('Quitar Sentadilla')).toBeNull();

  mockRepository.getWorkout.mockResolvedValue(workout([exercise('a', 'Sentadilla', null, [set('a1', 0, null, null)], { fromPlan: false })], null));
  const free = await render(<WorkoutScreen />);
  await waitFor(() => expect(free.getByLabelText('Quitar Sentadilla')).toBeTruthy());
});

test('peso corporal: pide lastre opcional, no peso', async () => {
  mockRepository.getWorkout.mockResolvedValue(workout([exercise('a', 'Lagartijas', 3, [set('a1', 0, null, null)], { loadType: 'bodyweight' })]));
  const screen = await render(<WorkoutScreen />);
  await waitFor(() => expect(screen.getByLabelText('Lastre (kg, opcional)')).toBeTruthy());
});
