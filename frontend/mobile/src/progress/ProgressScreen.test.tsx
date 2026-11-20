import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

const today = new Date().toISOString();
const mockRepository = {
  getWeeklyLoad: jest.fn().mockResolvedValue(null), listPrograms: jest.fn().mockResolvedValue([]), programWeeks: jest.fn().mockResolvedValue([]), getBenchmarks: jest.fn().mockResolvedValue([]),
  getProgress: jest.fn().mockResolvedValue({ weeklyVolumeKg: 0, sessionsThisMonth: 4, dailyVolumeKg: [], measurements: [
    { id: 'm1', type: 'weight_kg', value: 78, unit: 'kg', measuredAt: new Date(Date.now() - 28 * 86_400_000).toISOString(), localVersion: null, serverVersion: null, syncStatus: 'synced' },
    { id: 'm2', type: 'weight_kg', value: 76.5, unit: 'kg', measuredAt: today, localVersion: null, serverVersion: null, syncStatus: 'synced' },
  ], records: [{ exerciseId: 'e1', exerciseName: 'Sentadilla', weightKg: 100, reps: 5, measuredAt: today, e1rm: { valueKg: 116.7, weightKg: 100, reps: 5, localDate: today.slice(0, 10) } }] }),
  getOverview: jest.fn().mockResolvedValue({ sessionsThisWeek: 3, activityMinutesThisWeek: 0, pendingSyncCount: 0, latestWorkout: null }),
  getWeeklyMuscleVolume: jest.fn().mockResolvedValue({ items: [], totalSets: 0, sessions: 0 }),
  getStreak: jest.fn().mockResolvedValue({ days: { current: 4, best: 9, todayDone: true, atRisk: false, daysSinceLast: 0 }, weeks: { current: 3, best: 3 }, programName: null }),
  getBodyGoals: jest.fn().mockResolvedValue({ weight_kg: 75, waist_cm: null, chest_cm: null, hip_cm: null }),
  getAthleteProfile: jest.fn().mockResolvedValue({ displayName: 'Gabo', goals: ['Bajar grasa', '5 días por semana'], experienceLevel: null, heightCm: null, weightKg: null, sports: [] }),
  addBodyMeasurement: jest.fn().mockResolvedValue(undefined), tombstoneBodyMeasurement: jest.fn(), saveBodyGoal: jest.fn(),
  listCardio: jest.fn().mockResolvedValue([{ localDate: today.slice(0, 10) }]),
  listHistory: jest.fn().mockResolvedValue([{ startedAt: today, setCount: 18 }, { startedAt: today, setCount: 12 }]), getPreferences: jest.fn().mockResolvedValue({ unitSystem: 'metric' }),
};
jest.mock('expo-router', () => {
  const R = require('react');
  return { useRouter: () => ({ push: jest.fn() }), useFocusEffect: (cb: () => void) => R.useEffect(cb, [cb]) };
});
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null, MaterialCommunityIcons: () => null }));
jest.mock('@/data/MobileTrainingContext', () => ({ useTrainingRepository: () => mockRepository }));
jest.mock('@/profile/avatar', () => ({ useAvatar: () => null }));

import ProgressScreen from '../../app/(tabs)/progress';

test('Progreso: semana contra la meta, racha, récord de hoy y peso con su tendencia; registrar peso desde la hoja', async () => {
  const screen = await render(<ProgressScreen/>);
  await waitFor(() => expect(screen.getByLabelText('3 de 5 sesiones esta semana')).toBeTruthy());
  expect(screen.getByText('Te faltan 2')).toBeTruthy();
  expect(screen.getByLabelText('Racha de 3 semanas')).toBeTruthy();
  expect(screen.getByText(/Récord de hoy/)).toBeTruthy();
  await waitFor(() => expect(screen.getByText('30')).toBeTruthy()); // series del mes
  expect(screen.getByText('SESIONES')).toBeTruthy();
  expect(screen.getByText(/sesiones$/)).toBeTruthy();
  expect(screen.getByText('Meta: 75 kg')).toBeTruthy();
  expect(screen.getByText('-1.5 kg en 4 semanas')).toBeTruthy();
  await fireEvent.press(screen.getByText('Registrar peso de hoy'));
  await fireEvent.changeText(screen.getByLabelText('Peso de hoy (kg)'), '76,2');
  await fireEvent.press(screen.getByText('Guardar'));
  await waitFor(() => expect(mockRepository.addBodyMeasurement).toHaveBeenCalledWith(expect.objectContaining({ type: 'weight_kg', value: 76.2 })));
});
