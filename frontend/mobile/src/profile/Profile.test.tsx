import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { achievements } from './achievements';

const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => true };
const workout = (id: string, startedAt: string) => ({ id, state: 'completed', startedAt, completedAt: startedAt, localVersion: 1, serverVersion: 1, syncStatus: 'synced', exerciseCount: 5, setCount: 15, durationMinutes: 60 });
const mockRepo = {
  getPreferences: jest.fn(async () => ({ displayName: 'Gabo Lirca' })),
  getAthleteProfile: jest.fn(async () => ({ goals: ['Hyrox'], experienceLevel: 'intermediate' })),
  listHistory: jest.fn(async () => [workout('w1', '2026-11-09T14:00:00Z'), workout('w2', '2026-11-08T14:00:00Z')]),
  listCardio: jest.fn(async () => [{ id: 'c1', activity: 'run', startedAt: '2026-11-07T12:00:00Z', durationSeconds: 1800, distanceMeters: 5000 }]),
  getStreak: jest.fn(async () => ({ days: { current: 3, best: 8, todayDone: true, atRisk: false, daysSinceLast: 0 }, weeks: { current: 1, best: 1 }, programName: null })),
  getProgress: jest.fn(async () => ({ records: [{ exerciseId: 'e1', exerciseName: 'Sentadilla', weightKg: 120, reps: 5, measuredAt: '', e1rm: null }] })),
  getBenchmarks: jest.fn(async () => []), listPrograms: jest.fn(async () => []), programWeekStatus: jest.fn(async () => ({})),
};
jest.mock('expo-router', () => {
  const { useEffect } = jest.requireActual('react');
  return { useRouter: () => mockRouter, useFocusEffect: (cb: () => void) => useEffect(cb, [cb]) };
});
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('@/data/MobileTrainingContext', () => ({ useTrainingRepository: () => mockRepo }));

import ProfileScreen from '../../app/profile';

test('perfil privado: números, destacados, cuadrícula y logros con datos reales', async () => {
  const screen = await render(<ProfileScreen/>);
  await waitFor(() => expect(screen.getByText('Gabo Lirca')).toBeTruthy());
  expect(screen.getByText('Hyrox · Intermedio')).toBeTruthy();
  expect(screen.getByText('Privado')).toBeTruthy();
  expect(screen.getByText('Sesiones')).toBeTruthy();
  expect(screen.getByText('Mejor racha')).toBeTruthy();
  expect(screen.getByText('Sentadilla')).toBeTruthy();
  expect(screen.getByLabelText(/Carrera del/)).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('Logros'));
  expect(screen.getByLabelText('Racha de 7 días: logrado')).toBeTruthy();
  expect(screen.getByLabelText('Atleta híbrido: logrado')).toBeTruthy();
  expect(screen.getByLabelText('10 sesiones: pendiente')).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('Ajustes'));
  expect(mockRouter.push).toHaveBeenCalledWith('/settings');
});

test('logros: nada se marca sin datos', () => {
  expect(achievements({ workouts: 0, cardio: 0, bestStreak: 0, weeksCompleted: 0, records: 0, benchmarks: 0 }).every((a) => !a.done)).toBe(true);
});
