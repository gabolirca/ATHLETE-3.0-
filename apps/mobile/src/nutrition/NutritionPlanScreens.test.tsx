import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { localDateOfDevice } from '@/lib/localDate';

const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn(), dismissTo: jest.fn() };
let mockParams: Record<string, string> = {};
const today = localDateOfDevice(new Date());
const mockNutrition = {
  loadDay: jest.fn(), getMeal: jest.fn(), logMeal: jest.fn(), updateMeal: jest.fn(), deleteMeal: jest.fn(),
  getTarget: jest.fn(), setTarget: jest.fn().mockResolvedValue({}),
  getPlan: jest.fn().mockResolvedValue(null), savePlan: jest.fn().mockResolvedValue({}),
};
const mockStore = new Map<string, string>();

jest.mock('expo-router', () => {
  const { useEffect } = jest.requireActual('react');
  return { useRouter: () => mockRouter, useLocalSearchParams: () => mockParams, useFocusEffect: (cb: () => void) => useEffect(cb, [cb]) };
});
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async (k: string) => mockStore.get(k) ?? null),
  setItemAsync: jest.fn(async (k: string, v: string) => { mockStore.set(k, v); }),
}));
jest.mock('@/nutrition/mobileNutrition', () => ({ useNutrition: () => mockNutrition }));

import NutritionScreen from '../../app/(tabs)/nutrition';
import EstimatePlanScreen from '../../app/nutrition/estimate';
import NutritionTargetScreen from '../../app/nutrition/target';
import PlanEditorScreen from '../../app/nutrition/plan-editor';

beforeEach(() => { jest.clearAllMocks(); mockStore.clear(); mockParams = {}; });

test('el plan provisional exige aceptar el aviso antes de calcular', async () => {
  const screen = await render(<EstimatePlanScreen />);
  await waitFor(() => expect(screen.getByText('Antes de calcular tu plan')).toBeTruthy());
  expect(screen.getByText(/No es un plan elaborado por un nutriólogo/)).toBeTruthy();
  expect(screen.getByText('Aceptar y continuar')).toBeDisabled();
  await fireEvent.press(screen.getByLabelText('Entiendo que es una sugerencia y no un plan profesional'));
  await fireEvent.press(screen.getByText('Aceptar y continuar'));
  await waitFor(() => expect(screen.getByText('Calcular mi plan')).toBeTruthy());
  expect(JSON.parse(mockStore.get('athlete3.nutrition-disclaimer')!)).toMatchObject({ version: 'nutricion-provisional-v1-2026-11-07' });
});

test('calcula con Mifflin-St Jeor y guarda la meta como "estimated"', async () => {
  mockStore.set('athlete3.nutrition-disclaimer', JSON.stringify({ version: 'nutricion-provisional-v1-2026-11-07' }));
  const screen = await render(<EstimatePlanScreen />);
  await waitFor(() => expect(screen.getByText('Calcular mi plan')).toBeTruthy());
  await fireEvent.press(screen.getByText('Calcular'));
  await waitFor(() => expect(screen.getByText('Elige una opción (la fórmula es distinta).')).toBeTruthy());
  await fireEvent.press(screen.getByText('Hombre'));
  await fireEvent.changeText(screen.getByLabelText('Edad (años)'), '30');
  await fireEvent.changeText(screen.getByLabelText('Estatura (cm)'), '180');
  await fireEvent.changeText(screen.getByLabelText('Peso (kg)'), '80');
  await fireEvent.press(screen.getByText('Calcular'));
  await waitFor(() => expect(screen.getByText('2760')).toBeTruthy()); // moderada, mantener
  expect(screen.getByText('No es un plan de un nutriólogo.')).toBeTruthy();
  await fireEvent.press(screen.getByText('Usar como mi meta'));
  await waitFor(() => expect(mockNutrition.setTarget).toHaveBeenCalledWith({ effectiveFrom: today, energyKcal: 2760, proteinG: 144, carbsG: expect.any(Number), fatG: 77, source: 'estimated' }));
  expect(mockRouter.dismissTo).toHaveBeenCalledWith('/nutrition');
});

test('menores de edad no reciben cálculo', async () => {
  mockStore.set('athlete3.nutrition-disclaimer', JSON.stringify({ version: 'nutricion-provisional-v1-2026-11-07' }));
  const screen = await render(<EstimatePlanScreen />);
  await waitFor(() => expect(screen.getByText('Calcular mi plan')).toBeTruthy());
  await fireEvent.press(screen.getByText('Mujer'));
  await fireEvent.changeText(screen.getByLabelText('Edad (años)'), '16');
  await fireEvent.changeText(screen.getByLabelText('Estatura (cm)'), '160');
  await fireEvent.changeText(screen.getByLabelText('Peso (kg)'), '55');
  await fireEvent.press(screen.getByText('Calcular'));
  await waitFor(() => expect(screen.getByText('El cálculo es solo para adultos de 18 a 90 años.')).toBeTruthy());
  expect(screen.queryByText('Usar como mi meta')).toBeNull();
});

test('captura el plan del nutriólogo: kcal obligatorias, macros opcionales', async () => {
  mockParams = { source: 'professional' };
  const screen = await render(<NutritionTargetScreen />);
  await fireEvent.press(screen.getByText('Guardar meta'));
  await waitFor(() => expect(screen.getByText('Las calorías son obligatorias.')).toBeTruthy());
  await fireEvent.changeText(screen.getByLabelText('Calorías al día (kcal)'), '2200');
  await fireEvent.changeText(screen.getByLabelText('Proteína (g)'), '160');
  await fireEvent.press(screen.getByText('Guardar meta'));
  await waitFor(() => expect(mockNutrition.setTarget).toHaveBeenCalledWith({ effectiveFrom: today, energyKcal: 2200, proteinG: 160, carbsG: null, fatG: null, source: 'professional' }));
});

test('con meta, Nutrición muestra el avance contra la meta y su origen', async () => {
  mockNutrition.loadDay.mockResolvedValue({ meals: [], summary: { localDate: today, entryCount: 1, energyKcal: 1850, proteinG: 120, carbsG: null, fatG: 50, entriesMissingEnergy: 0 } });
  mockNutrition.getTarget.mockResolvedValue({ id: 't', effectiveFrom: today, energyKcal: 2400, proteinG: 150, carbsG: null, fatG: 70, source: 'professional' });
  const screen = await render(<NutritionScreen />);
  await waitFor(() => expect(screen.getByText('META DEL DÍA')).toBeTruthy());
  expect(screen.getByText('De tu nutriólogo')).toBeTruthy();
  expect(screen.getByText('de 2400 kcal')).toBeTruthy();
  expect(screen.queryByText('Carbos')).toBeNull(); // sin meta de carbos no se inventa barra
});

test('sin meta muestra las tres opciones de plan', async () => {
  mockNutrition.loadDay.mockResolvedValue({ meals: [], summary: { localDate: today, entryCount: 0, energyKcal: null, proteinG: null, carbsG: null, fatG: null, entriesMissingEnergy: 0 } });
  mockNutrition.getTarget.mockResolvedValue(null);
  const screen = await render(<NutritionScreen />);
  await waitFor(() => expect(screen.getByText('ELIGE TU PLAN DE NUTRICIÓN')).toBeTruthy());
  await fireEvent.press(screen.getByLabelText('Cargar mi plan'));
  expect(mockRouter.push).toHaveBeenCalledWith('/nutrition/plan-editor');
  await fireEvent.press(screen.getByLabelText('Con mi nutriólogo'));
  expect(mockRouter.push).toHaveBeenCalledWith('/nutrition/pro');
  await fireEvent.press(screen.getByLabelText('Plan que calcula la app'));
  expect(mockRouter.push).toHaveBeenCalledWith('/nutrition/estimate');
});

test('con plan, Nutrición lo muestra por tiempos con su origen', async () => {
  mockNutrition.loadDay.mockResolvedValue({ meals: [], summary: { localDate: today, entryCount: 0, energyKcal: null, proteinG: null, carbsG: null, fatG: null, entriesMissingEnergy: 0 } });
  mockNutrition.getTarget.mockResolvedValue({ id: 't', effectiveFrom: today, energyKcal: 1800, proteinG: null, carbsG: null, fatG: null, source: 'professional' });
  mockNutrition.getPlan.mockResolvedValue({
    id: 'p', effectiveFrom: today, name: 'Plan de la Dra.', notes: 'Agua 2 L', source: 'assigned', assignedBy: 'x', assignedByName: 'Dra. Ana',
    meals: [{ label: 'Desayuno', time: '08:00', equivalents: { cereales_sin_grasa: 2, frutas: 1 }, note: null }],
  });
  const screen = await render(<NutritionScreen />);
  await waitFor(() => expect(screen.getByText('Plan de la Dra.')).toBeTruthy());
  expect(screen.getByText(/Asignado por Dra. Ana/)).toBeTruthy();
  expect(screen.getByText('08:00 · Desayuno')).toBeTruthy();
  expect(screen.getByText('1 Frutas · 2 Cereales sin grasa')).toBeTruthy();
});

test('cargar mi plan: calcula kcal con el SMAE y guarda plan y meta', async () => {
  mockNutrition.getPlan.mockResolvedValue(null);
  const screen = await render(<PlanEditorScreen />);
  await waitFor(() => expect(screen.getByText('Guardar mi plan')).toBeTruthy());
  await fireEvent.press(screen.getAllByText('Agregar grupo del SMAE')[0]!);
  await fireEvent.press(screen.getByLabelText('Agregar Cereales sin grasa'));
  await fireEvent.press(screen.getByLabelText('Más Cereales sin grasa'));
  await fireEvent.press(screen.getByLabelText('Más Cereales sin grasa')); // pasos de ½ ración
  await fireEvent.press(screen.getByText('Guardar mi plan'));
  await waitFor(() => expect(screen.getByText(/El plan suma 140 kcal/)).toBeTruthy());
  expect(mockNutrition.savePlan).not.toHaveBeenCalled();
  await fireEvent.press(screen.getAllByText('Agregar grupo del SMAE')[1]!);
  await fireEvent.press(screen.getByLabelText('Agregar Leguminosas'));
  for (let i = 0; i < 10; i++) await fireEvent.press(screen.getByLabelText('Más Leguminosas'));
  await fireEvent.press(screen.getByText('Guardar mi plan'));
  await waitFor(() => expect(mockNutrition.savePlan).toHaveBeenCalled());
  const arg = mockNutrition.savePlan.mock.calls[0]![0];
  expect(arg.totals).toEqual({ kcal: 860, proteinG: 52, carbsG: 150, fatG: 6 });
  expect(arg.meals[0]).toEqual({ label: 'Desayuno', time: '08:00', equivalents: { cereales_sin_grasa: 2 }, note: null });
  expect(arg.meals[1].equivalents).toEqual({ leguminosas: 6 });
  expect(mockRouter.dismissTo).toHaveBeenCalledWith('/nutrition');
});
