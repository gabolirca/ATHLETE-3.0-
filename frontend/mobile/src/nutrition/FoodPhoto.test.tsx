import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

const mockRouter = { back: jest.fn(), push: jest.fn(), replace: jest.fn() };
const mockNutrition = { logMeal: jest.fn().mockResolvedValue({}) };
jest.mock('expo-router', () => ({ useRouter: () => mockRouter, useLocalSearchParams: () => ({}) }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('@/nutrition/mobileNutrition', () => ({ useNutrition: () => mockNutrition }));
jest.mock('@/nutrition/pickPhoto', () => ({ pickFoodPhoto: jest.fn(async () => ({ base64: 'abc' })) }));
jest.mock('@/nutrition/photoAnalysis', () => {
  const actual = jest.requireActual('@/nutrition/photoAnalysis');
  return {
    ...actual,
    hasPhotoConsent: jest.fn(async () => true),
    analyzeFoodPhoto: jest.fn(async () => ({
      es_comida: true, confianza: 'media', nota: 'No se ve el aceite.', modelo: 'cloudflare:x',
      platillos: [{ nombre: 'Tacos de bistec', porcion: '3 tacos', equivalentes: { cereales_sin_grasa: 3, aoa_bajo: 3, grasas_sin_proteina: 1 } }],
    })),
  };
});

import FoodPhotoScreen from '../../app/nutrition/photo';

test('foto → platillo con equivalentes SMAE → ajusto la porción → se guarda con macros de la tabla', async () => {
  const screen = await render(<FoodPhotoScreen/>);
  await waitFor(() => expect(screen.getByText('📷 Tomar foto')).toBeTruthy());
  await fireEvent.press(screen.getByText('📷 Tomar foto'));
  await waitFor(() => expect(screen.getByText('Tacos de bistec')).toBeTruthy());
  expect(screen.getAllByText('420 kcal')).toHaveLength(2); // 3×70 + 3×55 + 45
  await fireEvent.press(screen.getByLabelText('Menos Aceites y grasas en Tacos de bistec'));
  await fireEvent.press(screen.getByLabelText('Menos Aceites y grasas en Tacos de bistec'));
  await waitFor(() => expect(screen.getAllByText('375 kcal').length).toBeGreaterThan(0));
  await fireEvent.press(screen.getByText('Guardar comida'));
  await waitFor(() => expect(mockNutrition.logMeal).toHaveBeenCalledWith(expect.objectContaining({
    energyKcal: 375, proteinG: 27, carbsG: 45, fatG: 9, source: 'ai_generated', description: 'Tacos de bistec (3 tacos)',
    aiEstimate: expect.objectContaining({ editado: true, modelo: 'cloudflare:x' }),
  })));
  expect(mockRouter.back).toHaveBeenCalled();
});
