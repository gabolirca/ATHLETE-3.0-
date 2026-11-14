import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn(), dismissTo: jest.fn() };
let mockParams: Record<string, string> = {};
const mockAccount = { available: true, auth: { status: 'signed_in' }, syncNow: jest.fn().mockResolvedValue(undefined) };
const mockCoach = {
  createInvite: jest.fn(), listClients: jest.fn(), summary: jest.fn(), clientPlans: jest.fn(), assignPlan: jest.fn().mockResolvedValue({ planId: 'n' }),
  removePlan: jest.fn(), addComment: jest.fn().mockResolvedValue({ id: 'c' }), listComments: jest.fn(), deleteComment: jest.fn(), endLink: jest.fn(),
};
const mockPro = { status: jest.fn(), acceptInvite: jest.fn(), endLink: jest.fn() };
const mockRepo = { listRoutines: jest.fn(), listPrograms: jest.fn() };
const mockComments = { listComments: jest.fn().mockResolvedValue({ ok: true, value: [] }) };

jest.mock('expo-router', () => {
  const { useEffect } = jest.requireActual('react');
  return { useRouter: () => mockRouter, useLocalSearchParams: () => mockParams, useFocusEffect: (cb: () => void) => useEffect(cb, [cb]) };
});
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('@/account/AccountProvider', () => ({ useAccount: () => mockAccount }));
jest.mock('@/data/MobileTrainingContext', () => ({ useTrainingRepository: () => mockRepo }));
jest.mock('@/data/AthleteDataProvider', () => ({ useAthleteData: () => ({ data: { coach: mockComments } }) }));
jest.mock('@/pro/proApi', () => ({ get coachApi() { return mockCoach; }, get proApi() { return mockPro; }, fetchProStatus: () => Promise.resolve(null) }));

import CoachClientScreen from '../../app/coach/[clientId]';
import MyCoachScreen from '../../app/coach/link';

beforeEach(() => { jest.clearAllMocks(); mockParams = {}; });

test('el coach ve adherencia, sesiones y récords, comenta una sesión y asigna uno de sus programas', async () => {
  mockParams = { clientId: 'a1', name: 'Ana', linkId: 'l1' };
  mockCoach.summary.mockResolvedValue({
    fromDate: '2026-10-13', plannedPerWeek: 3,
    sessions: [{ id: 's1', localDate: '2026-11-09', title: 'Día A', planName: 'Fuerza base', minutes: 50, sessionRpe: 8, workingSets: 12, volumeKg: 5400 }],
    cardio: [{ id: 'c1', localDate: '2026-11-08', activity: 'run', minutes: 30, distanceM: 5000, rpe: null }],
    weeks: [{ weekStart: '2026-11-09', done: 2 }, { weekStart: '2026-11-02', done: 3 }, { weekStart: '2026-10-26', done: 1 }, { weekStart: '2026-10-19', done: 0 }],
    topLifts: [{ exercise: 'Sentadilla', e1rmKg: 116.7, bestWeightKg: 100 }],
  });
  mockCoach.clientPlans.mockResolvedValue([{ id: 'p1', name: 'Fuerza base', kind: 'routine', status: 'active', updatedAt: '', assignedByMe: true, assignedByName: 'Coach', days: 1 }]);
  mockCoach.listComments.mockResolvedValue([]);
  mockRepo.listRoutines.mockResolvedValue([{ id: 'r1', name: 'Torso', exercises: [{}, {}], updatedAt: '', coachName: null }, { id: 'r2', name: 'De otro coach', exercises: [], updatedAt: '', coachName: 'X' }]);
  mockRepo.listPrograms.mockResolvedValue([{ id: 'g1', name: 'Híbrido 3 días', templateSlug: null, days: [{}, {}, {}], coachName: null }]);

  const screen = await render(<CoachClientScreen />);
  await waitFor(() => expect(screen.getByText('Sentadilla')).toBeTruthy());
  expect(screen.getByText('2/3')).toBeTruthy();
  expect(screen.getByText('Su programa activo tiene 3 sesiones por semana.')).toBeTruthy();
  expect(screen.getByText(/12 series/)).toBeTruthy();
  expect(screen.getByText(/asignado por ti/)).toBeTruthy();

  await fireEvent.press(screen.getByLabelText('Comentar Día A del 2026-11-09'));
  await fireEvent.changeText(screen.getByLabelText('Comentario'), 'Buena técnica');
  await fireEvent.press(screen.getByText('Enviar'));
  await waitFor(() => expect(mockCoach.addComment).toHaveBeenCalledWith('a1', 'session', 's1', 'Buena técnica'));

  await fireEvent.press(screen.getByText('Asignar uno de mis programas'));
  await waitFor(() => expect(screen.getByLabelText('Asignar Híbrido 3 días')).toBeTruthy());
  expect(screen.queryByLabelText('Asignar De otro coach')).toBeNull(); // solo los propios
  await fireEvent.press(screen.getByLabelText('Asignar Torso'));
  await waitFor(() => expect(mockCoach.assignPlan).toHaveBeenCalledWith('a1', 'r1'));
  expect(mockAccount.syncNow).toHaveBeenCalled(); // sube el programa antes de copiarlo
  await waitFor(() => expect(screen.getByText(/"Torso" asignado/)).toBeTruthy());
});

test('el atleta se vincula con el código de su coach', async () => {
  mockPro.status.mockResolvedValueOnce({ isNutritionist: false, isCoach: false, professional: null, coach: null })
    .mockResolvedValue({ isNutritionist: false, isCoach: false, professional: null, coach: { linkId: 'l1', name: 'Coach Beto', since: '2026-11-10T00:00:00Z' } });
  mockPro.acceptInvite.mockResolvedValue({ linkId: 'l1', name: 'Coach Beto', scope: 'training' });
  const screen = await render(<MyCoachScreen />);
  await waitFor(() => expect(screen.getByText('Vincúlate con tu coach')).toBeTruthy());
  await fireEvent.changeText(screen.getByLabelText('Código'), 'abc');
  await fireEvent.press(screen.getByText('Vincular'));
  await waitFor(() => expect(screen.getByText('El código tiene 8 letras y números.')).toBeTruthy());
  await fireEvent.changeText(screen.getByLabelText('Código'), 'abcd2345');
  await fireEvent.press(screen.getByText('Vincular'));
  await waitFor(() => expect(mockPro.acceptInvite).toHaveBeenCalledWith('ABCD2345'));
  await waitFor(() => expect(screen.getByText('Tu coach: Coach Beto')).toBeTruthy());
});
