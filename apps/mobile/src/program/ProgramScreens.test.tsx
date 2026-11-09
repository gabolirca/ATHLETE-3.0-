import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn() };
const mockParams: Record<string, string> = {};
const mockRepository = { adoptProgramTemplate: jest.fn().mockResolvedValue('plan-1'), listPrograms: jest.fn(), programWeekStatus: jest.fn().mockResolvedValue({}), startProgramDay: jest.fn(), deleteProgram: jest.fn() };
jest.mock('expo-router', () => {
  const { useEffect } = jest.requireActual('react');
  return { useRouter: () => mockRouter, useLocalSearchParams: () => mockParams, useFocusEffect: (cb: () => void) => useEffect(cb, [cb]) };
});
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('@/data/MobileTrainingContext', () => ({ useTrainingRepository: () => mockRepository }));

import TemplateScreen from '../../app/program/template/[slug]';
import DayScreen from '../../app/program/day/[dayId]';

beforeEach(() => { jest.clearAllMocks(); for (const k of Object.keys(mockParams)) delete mockParams[k]; });

test('plantilla: semana tipo con bloques al tocar un día y "Empezar este programa"', async () => {
  mockParams.slug = 'hybrid-athlete-1-0';
  const screen = await render(<TemplateScreen/>);
  expect(screen.getByText('Hybrid Athlete 1.0')).toBeTruthy();
  expect(screen.getAllByText('Sábado')).toHaveLength(1);
  await fireEvent.press(screen.getByText('Hybrid Conditioning'));
  expect(screen.getByText('C · AMRAP 15 min')).toBeTruthy();
  expect(screen.getByText('AMRAP 15 min · RPE 7.5')).toBeTruthy();
  expect(screen.getByText('Wall ball')).toBeTruthy();
  await fireEvent.press(screen.getByText('Empezar este programa'));
  await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith('/program/plan-1'));
  expect(mockRepository.adoptProgramTemplate).toHaveBeenCalledWith('hybrid-athlete-1-0');
});

test('día de natación: muestra el plan y abre el modo alberca', async () => {
  mockParams.dayId = 'swim-1';
  mockRepository.listPrograms.mockResolvedValue([{ id: 'p', name: 'Hybrid Athlete 1.0', templateSlug: 'hybrid-athlete-1-0', days: [{
    id: 'swim-1', name: 'Natación · Técnica', weekday: 3, modality: 'swim', targetRpe: 4.5, targetDurationMinutes: 45, notes: null,
    blocks: [{ id: 'b', name: 'Drills', kind: 'swim', format: 'intervals', rounds: null, timeCapSeconds: null, restSeconds: null, targetRpe: null, notes: null,
      exercises: [{ id: 'e', exerciseId: 'x', exerciseName: 'Natación técnica (drills)', modality: 'cardio', loadType: 'time', sets: 4, repsMin: null, repsMax: null, durationSeconds: null, distanceMeters: 50, restSeconds: 20, perSide: false, targetRpe: null, notes: null }] }],
  }] }]);
  const screen = await render(<DayScreen/>);
  await waitFor(() => expect(screen.getByText('Natación · Técnica')).toBeTruthy());
  expect(screen.getByText('200 m · 45 min · RPE 4.5')).toBeTruthy();
  expect(screen.getByText(/^4 × 50 m/)).toBeTruthy();
  await fireEvent.press(screen.getByText('Empezar en modo alberca'));
  await waitFor(() => expect(mockRouter.push).toHaveBeenCalledWith('/program/pool/swim-1'));
});
