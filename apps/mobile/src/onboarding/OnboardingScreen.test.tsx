import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn() };
const mockStore = new Map<string, string>();
const mockRepository = {
  getAthleteProfile: jest.fn().mockResolvedValue({ displayName: '', goals: [], experienceLevel: null, heightCm: null, weightKg: null, sports: [] }),
  saveOnboarding: jest.fn().mockResolvedValue(undefined),
  adoptProgramTemplate: jest.fn().mockResolvedValue('plan-1'),
};
jest.mock('expo-router', () => ({ useRouter: () => mockRouter }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('@/data/MobileTrainingContext', () => ({ useTrainingRepository: () => mockRepository }));
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async (k: string) => mockStore.get(k) ?? null),
  setItemAsync: jest.fn(async (k: string, v: string) => { mockStore.set(k, v); }),
}));

import OnboardingScreen from '../../app/onboarding';

beforeEach(() => { jest.clearAllMocks(); mockStore.clear(); });

test('asistente: nombre → meta híbrida → 6 días con alberca → datos → Hybrid Athlete 1.0 y meta de comida', async () => {
  const screen = await render(<OnboardingScreen/>);
  await fireEvent.changeText(screen.getByLabelText('¿Cómo te llamas?'), 'Gabo');
  await fireEvent.press(screen.getByText('Siguiente'));
  await fireEvent.press(screen.getByLabelText('Más condición sin perder fuerza'));
  await fireEvent.press(screen.getByText('Siguiente'));
  await fireEvent.press(screen.getByLabelText('Intermedio'));
  await fireEvent.press(screen.getByLabelText('6 días'));
  await fireEvent.press(screen.getByLabelText('Alberca'));
  await fireEvent.press(screen.getByText('Siguiente'));
  await fireEvent.changeText(screen.getByLabelText('Estatura (cm)'), '1.75');
  await fireEvent.press(screen.getByText('Siguiente'));
  expect(screen.getByText('La estatura va en centímetros (por ejemplo 175).')).toBeTruthy();
  await fireEvent.changeText(screen.getByLabelText('Estatura (cm)'), '175');
  await fireEvent.changeText(screen.getByLabelText('Peso (kg)'), '80');
  await fireEvent.press(screen.getByText('Siguiente'));
  expect(screen.getByText('Hybrid Athlete 1.0')).toBeTruthy();
  await fireEvent.press(screen.getByText('Empezar este programa'));
  await waitFor(() => expect(mockRepository.saveOnboarding).toHaveBeenCalledWith({
    displayName: 'Gabo', goal: 'Más condición sin perder fuerza', level: 'intermediate', sports: ['strength', 'functional_fitness', 'swimming'], heightCm: 175, weightKg: 80, trainingDays: 6,
  }));
  expect(mockRepository.adoptProgramTemplate).toHaveBeenCalledWith('hybrid-athlete-1-0');
  expect(mockStore.get('athlete3.onboarding.v1')).toBe('1');
  expect(mockRouter.push).toHaveBeenCalledWith('/program/plan-1');
  expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/nutrition/estimate', params: { height: '175', weight: '80', goal: 'maintain' } });
});

test('saltar marca el asistente como visto; fuerza sugiere crear rutina', async () => {
  const screen = await render(<OnboardingScreen/>);
  await fireEvent.press(screen.getByText('Saltar'));
  await waitFor(() => expect(mockStore.get('athlete3.onboarding.v1')).toBe('1'));
  expect(mockRouter.back).toHaveBeenCalled();

  const again = await render(<OnboardingScreen/>);
  await fireEvent.press(again.getByText('Siguiente'));
  await fireEvent.press(again.getByLabelText('Ganar fuerza y músculo'));
  await fireEvent.press(again.getByText('Siguiente'));
  await fireEvent.press(again.getByLabelText('Principiante'));
  await fireEvent.press(again.getByLabelText('4 días'));
  await fireEvent.press(again.getByText('Siguiente'));
  await fireEvent.press(again.getByText('Omitir'));
  await fireEvent.press(again.getByText('Crear mi primera rutina'));
  await waitFor(() => expect(mockRouter.push).toHaveBeenCalledWith('/routines/new'));
  expect(mockRepository.adoptProgramTemplate).not.toHaveBeenCalled();
});
