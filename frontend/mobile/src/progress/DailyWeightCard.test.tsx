import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { DailyWeightCard } from './DailyWeightCard';

jest.mock('expo-router', () => {
  const { useEffect } = jest.requireActual('react');
  return { useRouter: () => ({ push: jest.fn() }), useFocusEffect: (cb: () => void) => useEffect(cb, [cb]) };
});
const w = (daysAgo: number, value: number) => ({ id: `w${daysAgo}`, type: 'weight_kg' as const, value, unit: 'kg' as const,
  measuredAt: new Date(Date.now() - daysAgo * 86_400_000).toISOString(), localVersion: 1, serverVersion: null, syncStatus: 'pending' as const });

test('sin pesaje hoy: se guarda en un toque', async () => {
  const repo = { listBodyMeasurements: jest.fn().mockResolvedValue([w(1, 80)]), getBodyGoals: jest.fn().mockResolvedValue({ weight_kg: 75 }), addBodyMeasurement: jest.fn().mockResolvedValue('x') };
  const screen = await render(<DailyWeightCard repository={repo as never}/>);
  await waitFor(() => expect(screen.getByLabelText('Tu peso (kg)')).toBeTruthy());
  await fireEvent.changeText(screen.getByLabelText('Tu peso (kg)'), '79.6');
  await fireEvent.press(screen.getByLabelText('Guardar peso de hoy'));
  await waitFor(() => expect(repo.addBodyMeasurement).toHaveBeenCalledWith(expect.objectContaining({ type: 'weight_kg', value: 79.6 })));
});

test('ya pesado hoy: muestra el peso, el promedio y lo que falta para la meta', async () => {
  const repo = { listBodyMeasurements: jest.fn().mockResolvedValue([w(0, 80.4), w(2, 80.0)]), getBodyGoals: jest.fn().mockResolvedValue({ weight_kg: 75 }), addBodyMeasurement: jest.fn() };
  const screen = await render(<DailyWeightCard repository={repo as never}/>);
  await waitFor(() => expect(screen.getByText('✓ Registrado hoy')).toBeTruthy());
  expect(screen.getByText(/Promedio 7 días: 80.2 kg · faltan 5.2 kg para tu meta/)).toBeTruthy();
});
