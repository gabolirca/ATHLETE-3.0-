import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

const mockRouter = { push: jest.fn(), replace: jest.fn() };
const mockRepository = {
  getPreferences: jest.fn().mockResolvedValue({ displayName: '', unitSystem: 'metric', preferredSport: 'hybrid', timezone: 'America/Mexico_City' }),
  logCardio: jest.fn().mockResolvedValue('0190f0f0-0000-7000-8000-0000000000c1'),
};

jest.mock('expo-router', () => ({ useRouter: () => mockRouter }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('@/data/MobileTrainingContext', () => ({ useTrainingRepository: () => mockRepository }));

import NewCardioScreen from '../../app/cardio/new';

beforeEach(() => { jest.clearAllMocks(); });

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
