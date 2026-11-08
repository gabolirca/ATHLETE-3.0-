import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import type { Program } from '@/data/trainingTypes';
import { todayWeekday } from './format';

const mockRouter = { push: jest.fn() };
const mockRepository = { startProgramDay: jest.fn().mockResolvedValue('w-1'), getOverview: jest.fn() };
jest.mock('expo-router', () => ({ useRouter: () => mockRouter, useFocusEffect: () => undefined }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('@/data/MobileTrainingContext', () => ({ useTrainingRepository: () => mockRepository }));

import { HybridCard } from './HybridCard';

const today = todayWeekday();
const day = (id: string, name: string, modality: 'strength' | 'swim', weekday = today) => ({ id, name, weekday, modality, targetRpe: 7, targetDurationMinutes: 60, notes: null, blocks: [] });
const program: Program = { id: 'p', name: 'Hybrid Athlete 1.0', templateSlug: 'hybrid-athlete-1-0', days: [day('g', 'Inferior A · Fuerza', 'strength'), day('n', 'Natación · Recuperación', 'swim'), day('x', 'Otro día', 'strength', (today % 7) + 1)] };

beforeEach(() => jest.clearAllMocks());

test('sin programa invita a ver Hybrid Athlete 1.0', async () => {
  const screen = await render(<HybridCard program={null} status={{}} loaded/>);
  expect(screen.getByText('MODO HÍBRIDO')).toBeTruthy();
  expect(screen.getByText('4 fuerza')).toBeTruthy();
  await fireEvent.press(screen.getByText('Ver el programa'));
  expect(mockRouter.push).toHaveBeenCalledWith('/program/template/hybrid-athlete-1-0');
});

test('con programa: lo de hoy, empezar fuerza abre la sesión y nadar abre el registro de cardio con el plan', async () => {
  const screen = await render(<HybridCard program={program} status={{ x: { workoutId: 'old' } }} loaded/>);
  expect(screen.getByText('1 de 3 esta semana')).toBeTruthy();
  expect(screen.queryByText('Otro día')).toBeNull();
  await fireEvent.press(screen.getByLabelText('Empezar Inferior A · Fuerza'));
  expect(mockRepository.startProgramDay).toHaveBeenCalledWith('g');
  await new Promise((r) => setTimeout(r, 0));
  expect(mockRouter.push).toHaveBeenCalledWith('/workout/w-1');
  await fireEvent.press(screen.getByLabelText('Empezar Natación · Recuperación'));
  expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/cardio/new', params: { dayId: 'n' } });
});
