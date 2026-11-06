import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { localDateOfDevice } from './mealForm';

const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn() };
const today = localDateOfDevice(new Date());
const mockNutrition = {
  loadDay: jest.fn(),
  getMeal: jest.fn(),
  logMeal: jest.fn().mockResolvedValue({}),
  updateMeal: jest.fn(),
  deleteMeal: jest.fn(),
};

jest.mock('expo-router', () => {
  const { useEffect } = jest.requireActual('react');
  return {
    useRouter: () => mockRouter,
    useLocalSearchParams: () => ({}),
    useFocusEffect: (cb: () => void) => useEffect(cb, [cb]),
  };
});
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('@/nutrition/mobileNutrition', () => ({ useNutrition: () => mockNutrition }));

import NutritionScreen from '../../app/(tabs)/nutrition';
import NewMealScreen from '../../app/nutrition/new';

const meal = (over: Record<string, unknown>) => ({
  id: 'm1', userId: 'u', createdAt: '', updatedAt: '', deletedAt: null, revision: 1, consumedAt: new Date().toISOString(),
  timeZone: 'UTC', localDate: today, mealType: 'lunch', description: 'Pollo con arroz', energyKcal: 600, proteinG: 45, carbsG: 70, fatG: 15,
  source: 'manual', notes: null, ...over,
});

beforeEach(() => jest.clearAllMocks());

test('muestra el total del día, avisa si es un mínimo y agrupa por tipo', async () => {
  mockNutrition.loadDay.mockResolvedValue({
    meals: [meal({}), meal({ id: 'm2', mealType: 'snack', description: 'Manzana', energyKcal: null, proteinG: null, carbsG: null, fatG: null })],
    summary: { localDate: today, entryCount: 2, energyKcal: 600, proteinG: 45, carbsG: 70, fatG: 15, entriesMissingEnergy: 1 },
  });
  const screen = await render(<NutritionScreen />);
  await waitFor(() => expect(screen.getByText('Pollo con arroz')).toBeTruthy());
  expect(screen.getByText('600')).toBeTruthy();
  expect(screen.getByText('Al menos: 1 comida no tiene calorías.')).toBeTruthy();
  expect(screen.getByText('Comida')).toBeTruthy();
  expect(screen.getByText('Colación')).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('Editar Manzana'));
  expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/nutrition/[mealId]', params: { mealId: 'm2', date: today } });
});

test('día vacío: sin totales inventados; se puede ir al día anterior pero no al futuro', async () => {
  mockNutrition.loadDay.mockResolvedValue({ meals: [], summary: { localDate: today, entryCount: 0, energyKcal: null, proteinG: null, carbsG: null, fatG: null, entriesMissingEnergy: 0 } });
  const screen = await render(<NutritionScreen />);
  await waitFor(() => expect(screen.getByText('Aún no registras comidas hoy')).toBeTruthy());
  expect(screen.queryByText('TOTAL DEL DÍA')).toBeNull();
  await fireEvent.press(screen.getByLabelText('Día siguiente'));
  expect(mockNutrition.loadDay).toHaveBeenLastCalledWith(today);
  await fireEvent.press(screen.getByLabelText('Día anterior'));
  await waitFor(() => expect(screen.getByText('Ayer')).toBeTruthy());
});

test('registrar comida: guarda lo escrito y sugiere kcal desde macros', async () => {
  const screen = await render(<NewMealScreen />);
  await fireEvent.changeText(screen.getByLabelText('¿Qué comiste?'), 'Huevos con frijoles');
  await fireEvent.changeText(screen.getByLabelText('Proteína (g)'), '20');
  await fireEvent.changeText(screen.getByLabelText('Carbos (g)'), '30');
  await fireEvent.changeText(screen.getByLabelText('Grasa (g)'), '10');
  await fireEvent.press(screen.getByText('Usar 290 kcal (calculado de tus macros)'));
  await fireEvent.press(screen.getByText('Guardar comida'));
  await waitFor(() => expect(mockNutrition.logMeal).toHaveBeenCalledTimes(1));
  expect(mockNutrition.logMeal.mock.calls[0][0]).toMatchObject({ description: 'Huevos con frijoles', energyKcal: 290, proteinG: 20, carbsG: 30, fatG: 10, source: 'manual' });
  expect(mockRouter.back).toHaveBeenCalled();
});

test('sin descripción no guarda', async () => {
  const screen = await render(<NewMealScreen />);
  await fireEvent.press(screen.getByText('Guardar comida'));
  await waitFor(() => expect(screen.getByText('Describe qué comiste.')).toBeTruthy());
  expect(mockNutrition.logMeal).not.toHaveBeenCalled();
});
