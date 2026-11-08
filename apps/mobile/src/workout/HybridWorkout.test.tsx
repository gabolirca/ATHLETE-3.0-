import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn() };
const draft = (id: string) => ({ id, setIndex: 0, weightKg: null, reps: null, rir: null, isWarmup: false, durationSeconds: null, distanceMeters: null });
const ex = (id: string, name: string, blockId: string, over: Record<string, unknown> = {}) => ({
  id, exerciseId: `e-${id}`, exerciseName: name, sortOrder: 0, setsTarget: null, repsTarget: null, repsMax: null, restSeconds: null, targetRir: null,
  sets: [draft(`${id}-d`)], newRecords: [], previous: null, blockId, modality: 'strength', loadType: 'external', targetDurationSeconds: null, targetDistanceMeters: null, perSide: false, ...over,
});
const block = (id: string, name: string, format: string, over: Record<string, unknown> = {}) => ({ id, name, kind: 'wod', format, rounds: null, timeCapSeconds: null, restSeconds: null, targetRpe: null, notes: null, result: null, ...over });
const detail = {
  workout: { id: 's1', state: 'active', startedAt: new Date().toISOString(), completedAt: null, localVersion: 1, serverVersion: null, syncStatus: 'pending', exerciseCount: 3, setCount: 0, durationMinutes: null },
  dayName: 'Hybrid Conditioning', sessionRpe: null, trainingDayId: 'd',
  blocks: [block('a', 'A · Activación', 'continuous', { kind: 'warmup' }), block('c', 'C · AMRAP 15 min', 'amrap', { timeCapSeconds: 900, targetRpe: 7.5 })],
  exercises: [
    ex('bike', 'Bicicleta fija / air bike', 'a', { modality: 'cardio', loadType: 'time', targetDurationSeconds: 300 }),
    ex('wb', 'Wall ball', 'c', { repsTarget: 12, repsMax: 12 }),
    ex('row', 'Remo ergómetro', 'c', { modality: 'cardio', loadType: 'time', targetDistanceMeters: 200 }),
  ],
};
const mockRepository = { getWorkout: jest.fn().mockResolvedValue(detail), saveSet: jest.fn().mockResolvedValue(undefined), saveBlockResult: jest.fn().mockResolvedValue(undefined), finishWorkout: jest.fn().mockResolvedValue(undefined), addSet: jest.fn(), addExercise: jest.fn() };

jest.mock('expo-router', () => {
  const { useEffect } = jest.requireActual('react');
  return { useRouter: () => mockRouter, useLocalSearchParams: () => ({ sessionId: 's1' }), useFocusEffect: (cb: () => void) => useEffect(cb, [cb]) };
});
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('@/data/MobileTrainingContext', () => ({ useTrainingRepository: () => mockRepository }));
jest.mock('expo-secure-store', () => ({ getItemAsync: jest.fn(async () => null), setItemAsync: jest.fn(async () => undefined) }));

import WorkoutScreen from '../../app/workout/[sessionId]';

test('sesión por bloques: encabezados, AMRAP con resultado, cardio por tiempo y RPE al finalizar', async () => {
  const screen = await render(<WorkoutScreen />);
  await waitFor(() => expect(screen.getByText('Hybrid Conditioning')).toBeTruthy());
  expect(screen.getByText('A · Activación')).toBeTruthy();
  expect(screen.getByText('AMRAP 15 min · RPE 7.5')).toBeTruthy();
  // El AMRAP se lista como receta (sin series por ejercicio)
  expect(screen.getByText('Wall ball')).toBeTruthy();
  expect(screen.getByText('200 m')).toBeTruthy();
  expect(screen.queryByText('Ejercicio 1 de 3')).toBeNull(); // sin la guía de rutinas
  // La bici del calentamiento se registra por tiempo
  await fireEvent.press(screen.getByLabelText('Como el plan: REGISTRO'));
  await waitFor(() => expect(mockRepository.saveSet).toHaveBeenCalledWith('s1', 'bike-d', expect.objectContaining({ durationSeconds: 300, distanceMeters: null })));
  // Resultado del AMRAP
  await fireEvent.changeText(screen.getByLabelText('Rondas completas'), '5');
  await fireEvent.changeText(screen.getByLabelText('Reps extra'), '14');
  await fireEvent.press(screen.getByLabelText('Guardar resultado de C · AMRAP 15 min'));
  await waitFor(() => expect(mockRepository.saveBlockResult).toHaveBeenCalledWith('s1', 'c', { roundsCompleted: 5, extraReps: 14, durationSeconds: 900 }));
  // RPE y finalizar
  await fireEvent.press(screen.getByLabelText('RPE 8'));
  await fireEvent.press(screen.getByText('Finalizar y guardar sesión'));
  await waitFor(() => expect(mockRepository.finishWorkout).toHaveBeenCalledWith('s1', { sessionRpe: 8 }));
  expect(mockRouter.replace).toHaveBeenCalledWith('/history/s1');
});
