import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn() };
const mockStore = new Map<string, string>();
const set = (id: string, reps: number | null) => ({ id, setIndex: 0, weightKg: reps === null ? null : 80, reps, rir: null, isWarmup: false });
const exercise = (id: string, name: string, setsTarget: number, sets: ReturnType<typeof set>[]) => ({
  id, exerciseId: `e-${id}`, exerciseName: name, sortOrder: 0, setsTarget, repsTarget: 5, restSeconds: 120, targetRir: null, sets, newRecords: [], previous: null,
});
const workout = (exercises: ReturnType<typeof exercise>[]) => ({
  workout: { id: 's1', state: 'active', startedAt: new Date().toISOString(), completedAt: null, localVersion: 1, serverVersion: null, syncStatus: 'pending', exerciseCount: exercises.length, setCount: 0, durationMinutes: null },
  exercises,
});
const mockRepository = { getWorkout: jest.fn(), saveSet: jest.fn().mockResolvedValue(undefined), finishWorkout: jest.fn(), addSet: jest.fn(), addExercise: jest.fn() };

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

beforeEach(() => { jest.clearAllMocks(); mockStore.clear(); });

test('muestra en qué vas: ejercicio actual abierto, terminados plegados con su resumen', async () => {
  mockRepository.getWorkout.mockResolvedValue(workout([
    exercise('a', 'Sentadilla', 2, [set('a1', 5), set('a2', 5), set('a3', null)]),
    exercise('b', 'Prensa', 3, [set('b1', 10), set('b2', null)]),
    exercise('c', 'Curl femoral', 2, [set('c1', null)]),
  ]));
  const screen = await render(<WorkoutScreen />);
  await waitFor(() => expect(screen.getByText('Ejercicio 2 de 3')).toBeTruthy());
  expect(screen.getByText('3 de 7 series')).toBeTruthy();
  expect(screen.getByText('✓ COMPLETADO')).toBeTruthy();
  expect(screen.getByText('AHORA')).toBeTruthy();
  expect(screen.getByText('Serie 2 de 3 · descanso 120 s')).toBeTruthy();
  expect(screen.getByText('80 kg × 5 · 80 kg × 5')).toBeTruthy(); // resumen del ejercicio terminado
  expect(screen.getAllByText(/^SERIE \d(\/\d)?$/)).toHaveLength(2); // solo las series del ejercicio actual
  // Tocar un ejercicio plegado lo abre.
  await fireEvent.press(screen.getByLabelText('Curl femoral, después'));
  expect(screen.getAllByText(/^SERIE \d(\/\d)?$/)).toHaveLength(3);
});

test('al guardar una serie arranca el descanso diciendo qué sigue; con descanso obligatorio va a pantalla completa', async () => {
  mockStore.set('athlete3.pref.strict-rest', '1');
  const before = workout([exercise('a', 'Sentadilla', 1, [set('a1', null)]), exercise('b', 'Prensa', 3, [set('b1', null)])]);
  const after = workout([exercise('a', 'Sentadilla', 1, [set('a1', 5)]), exercise('b', 'Prensa', 3, [set('b1', null)])]);
  mockRepository.getWorkout.mockResolvedValueOnce(before).mockResolvedValue(after);
  const screen = await render(<WorkoutScreen />);
  await waitFor(() => expect(screen.getByText('Ejercicio 1 de 2')).toBeTruthy());
  await fireEvent.changeText(screen.getAllByLabelText('Peso (kg)')[0]!, '80');
  await fireEvent.changeText(screen.getAllByLabelText('Repeticiones')[0]!, '5');
  await fireEvent(screen.getAllByLabelText('Repeticiones')[0]!, 'blur');
  await waitFor(() => expect(screen.getByText('DESCANSO OBLIGATORIO')).toBeTruthy());
  expect(screen.getAllByText('Siguiente ejercicio: Prensa').length).toBeGreaterThan(0);
  expect(screen.queryByText('Saltar')).toBeNull();
});
