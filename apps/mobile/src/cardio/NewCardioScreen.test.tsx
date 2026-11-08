import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

const mockRouter = { push: jest.fn(), replace: jest.fn() };
const mockRepository = {
  getPreferences: jest.fn().mockResolvedValue({ displayName: '', unitSystem: 'metric', preferredSport: 'hybrid', timezone: 'America/Mexico_City' }),
  logCardio: jest.fn().mockResolvedValue('0190f0f0-0000-7000-8000-0000000000c1'),
  updateCardio: jest.fn().mockResolvedValue(undefined),
  getCardio: jest.fn(),
};

const mockParams: { edit?: string } = {};
jest.mock('expo-router', () => ({ useRouter: () => mockRouter, useLocalSearchParams: () => mockParams }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('@/data/MobileTrainingContext', () => ({ useTrainingRepository: () => mockRepository }));

import NewCardioScreen from '../../app/cardio/new';

beforeEach(() => { jest.clearAllMocks(); delete mockParams.edit; });

test('guarda una carrera con los datos convertidos al contrato y abre su detalle', async () => {
  const screen = await render(<NewCardioScreen />);
  await fireEvent.changeText(screen.getByLabelText('Minutos'), '25');
  await fireEvent.changeText(screen.getByLabelText('Distancia (km, opcional)'), '5');
  await waitFor(() => expect(screen.getByText('Ritmo: 5:00 /km')).toBeTruthy());

  await fireEvent.press(screen.getByText('Guardar actividad'));

  await waitFor(() => expect(mockRepository.logCardio).toHaveBeenCalledTimes(1));
  expect(mockRepository.logCardio.mock.calls[0][0]).toMatchObject({ activity: 'run', durationSeconds: 1500, distanceMeters: 5000, rpe: null });
  expect(mockRouter.replace).toHaveBeenCalledWith('/cardio/0190f0f0-0000-7000-8000-0000000000c1');
});

test('sin duración no guarda y muestra el error', async () => {
  const screen = await render(<NewCardioScreen />);
  await fireEvent.press(screen.getByText('Guardar actividad'));
  await waitFor(() => expect(screen.getByText('La duración es obligatoria.')).toBeTruthy());
  expect(mockRepository.logCardio).not.toHaveBeenCalled();
});

test('natación muestra los campos de alberca; otras actividades no', async () => {
  const screen = await render(<NewCardioScreen />);
  expect(screen.queryByLabelText('Largos')).toBeNull();
  await fireEvent.press(screen.getByLabelText('Nadar'));
  expect(screen.getByLabelText('Largos')).toBeTruthy();
  expect(screen.getByLabelText('Distancia (m, opcional)')).toBeTruthy();
});

test('si el guardado falla, muestra el error y no navega', async () => {
  mockRepository.logCardio.mockRejectedValueOnce(new Error('La actividad ya existe.'));
  const screen = await render(<NewCardioScreen />);
  await fireEvent.changeText(screen.getByLabelText('Minutos'), '10');
  await fireEvent.press(screen.getByText('Guardar actividad'));
  await waitFor(() => expect(screen.getByText('La actividad ya existe.')).toBeTruthy());
  expect(mockRouter.replace).not.toHaveBeenCalled();
});

test('editar: llena el formulario con la actividad guardada y guarda los cambios sobre la misma', async () => {
  mockParams.edit = 'c-1';
  mockRepository.getCardio.mockResolvedValue({
    id: 'c-1', activity: 'run', startedAt: new Date(2026, 10, 7, 7, 30).toISOString(), localDate: '2026-11-07', durationSeconds: 1800,
    distanceMeters: 6000, rounds: null, rpe: 6, avgHeartRateBpm: 150, maxHeartRateBpm: null, swim: null, notes: 'Zona 2', syncStatus: 'synced',
  });
  const screen = await render(<NewCardioScreen />);
  await waitFor(() => expect(screen.getByText('Editar actividad')).toBeTruthy());
  await waitFor(() => expect(screen.getByLabelText('Distancia (km, opcional)').props.value).toBe('6'));
  expect(screen.getByLabelText('Minutos').props.value).toBe('30');
  await fireEvent.changeText(screen.getByLabelText('Distancia (km, opcional)'), '6.5');
  await fireEvent.press(screen.getByText('Guardar cambios'));
  await waitFor(() => expect(mockRepository.updateCardio).toHaveBeenCalledWith('c-1', expect.objectContaining({ distanceMeters: 6500, durationSeconds: 1800, rpe: 6, notes: 'Zona 2' })));
  expect(mockRepository.logCardio).not.toHaveBeenCalled();
  expect(mockRouter.replace).toHaveBeenCalledWith('/cardio/c-1');
});
