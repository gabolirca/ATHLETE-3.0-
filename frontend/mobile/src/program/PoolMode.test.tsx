import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn() };
const mockStore = new Map<string, string>();
const e = (id: string, name: string, o: Record<string, unknown>) => ({ id, exerciseId: id, exerciseName: name, modality: 'cardio', loadType: 'time', sets: null, repsMin: null, repsMax: null, durationSeconds: null, distanceMeters: null, restSeconds: null, perSide: false, targetRpe: null, notes: null, ...o });
const day = { id: 'swim-1', name: 'Natación · Técnica', weekday: 3, modality: 'swim', targetRpe: 4.5, targetDurationMinutes: 45, notes: null, blocks: [
  { id: 'w', name: 'Calentamiento', kind: 'warmup', format: 'continuous', rounds: null, timeCapSeconds: null, restSeconds: null, targetRpe: null, notes: null, exercises: [e('a', 'Natación (libre)', { distanceMeters: 200 })] },
  { id: 't', name: 'Drills', kind: 'swim', format: 'intervals', rounds: null, timeCapSeconds: null, restSeconds: null, targetRpe: null, notes: null, exercises: [e('c', 'Drills', { sets: 2, distanceMeters: 50, restSeconds: 20 })] },
] };
const mockRepository = { listPrograms: jest.fn().mockResolvedValue([{ id: 'p', name: 'H', templateSlug: null, days: [day] }]), logCardio: jest.fn().mockResolvedValue('c-9') };
jest.mock('expo-router', () => {
  const { useEffect } = jest.requireActual('react');
  return { useRouter: () => mockRouter, useLocalSearchParams: () => ({ dayId: 'swim-1' }), useFocusEffect: (cb: () => void) => useEffect(cb, [cb]) };
});
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('@/data/MobileTrainingContext', () => ({ useTrainingRepository: () => mockRepository }));
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async (k: string) => mockStore.get(k) ?? null),
  setItemAsync: jest.fn(async (k: string, v: string) => { mockStore.set(k, v); }),
  deleteItemAsync: jest.fn(async (k: string) => { mockStore.delete(k); }),
}));

import PoolModeScreen from '../../app/program/pool/[dayId]';

test('modo alberca: empezar, palomear series (con descanso), y guardar metros + RPE ligados al día', async () => {
  const screen = await render(<PoolModeScreen/>);
  await waitFor(() => expect(screen.getByText('Natación · Técnica')).toBeTruthy());
  await fireEvent.press(screen.getByText('Empezar'));
  expect(mockStore.size).toBe(1); // el avance sobrevive si se cierra la app
  await fireEvent.press(screen.getByLabelText('Natación (libre) · 200 m'));
  await fireEvent.press(screen.getByLabelText('Drills · 1 de 2 · 50 m'));
  expect(screen.getByText(/Siguiente: Drills · 2 de 2/)).toBeTruthy(); // arrancó el descanso de 20 s
  await fireEvent.press(screen.getByLabelText('RPE 4'));
  await fireEvent.press(screen.getByText('Terminar y guardar · 250 m'));
  await waitFor(() => expect(mockRepository.logCardio).toHaveBeenCalledWith(expect.objectContaining({ activity: 'swim', distanceMeters: 250, rpe: 4, trainingDayId: 'swim-1', notes: 'Natación · Técnica — Calentamiento: 1/1 ✓ · Drills: 1/2' })));
  expect(mockRouter.replace).toHaveBeenCalledWith('/cardio/c-9');
  expect(mockStore.size).toBe(0);
});
