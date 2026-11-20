import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

const mockRouter = { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: () => true };
const mockRepository = {
  getPreferences: jest.fn().mockResolvedValue({ displayName: 'Gabo', unitSystem: 'metric', preferredSport: 'strength', timezone: 'America/Mexico_City' }),
  getAthleteProfile: jest.fn().mockResolvedValue({ displayName: 'Gabo', goals: ['Bajar grasa', '4 días por semana'], experienceLevel: 'intermediate', heightCm: 175, weightKg: 80, sports: [] }),
  savePreferences: jest.fn().mockResolvedValue(undefined),
};
jest.mock('expo-router', () => {
  const R = require('react');
  return { useRouter: () => mockRouter, useFocusEffect: (cb: () => void) => R.useEffect(cb, [cb]) };
});
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null, MaterialCommunityIcons: () => null }));
jest.mock('@/data/MobileTrainingContext', () => ({ useTrainingRepository: () => mockRepository }));
jest.mock('@/account/AccountCard', () => ({ AccountCard: () => null }));
jest.mock('@/nutrition/NutritionSettingsCard', () => ({ NutritionSettingsCard: () => null }));
jest.mock('expo-secure-store', () => ({ getItem: () => null, getItemAsync: async () => null, setItemAsync: async () => undefined }));

import SettingsScreen from '../../app/settings';

test('Ajustes: sin zona de pruebas; las unidades se guardan al tocar', async () => {
  const screen = await render(<SettingsScreen/>);
  await waitFor(() => expect(screen.getByText('Bajar grasa · Intermedio · 175 cm')).toBeTruthy());
  expect(screen.queryByText(/ZONA DE PRUEBAS/)).toBeNull();
  expect(screen.queryByText('Borrar todo de este teléfono')).toBeNull();
  await fireEvent.press(screen.getByLabelText('Unidades: Libras y millas'));
  await waitFor(() => expect(mockRepository.savePreferences).toHaveBeenCalledWith(expect.objectContaining({ unitSystem: 'imperial' })));
  expect(screen.getByText('✓ Guardado')).toBeTruthy();
});
