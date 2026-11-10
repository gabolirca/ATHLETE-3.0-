import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { BodyGoalCard } from './BodyGoalCard';

const m = (daysAgo: number, value: number) => ({ id: `m${daysAgo}`, type: 'weight_kg' as const, value, unit: 'kg' as const,
  measuredAt: new Date(Date.now() - daysAgo * 86_400_000).toISOString(), localVersion: 1, serverVersion: null, syncStatus: 'pending' as const });

test('peso: promedio de 7 días, cambio semanal y cuánto falta para la meta', async () => {
  const screen = await render(<BodyGoalCard kind={{ id: 'weight_kg', title: 'Peso', unit: 'kg' }} measurements={[m(0, 80.4), m(2, 80.0), m(9, 81.0)]} goal={75} onSaveGoal={jest.fn()}/>);
  expect(screen.getByText('Promedio de 7 días (2 pesajes)')).toBeTruthy();
  expect(screen.getByText('-0.8 kg')).toBeTruthy();
  expect(screen.getByText('Meta: 75 kg · te faltan 5.2 kg por bajar')).toBeTruthy();
});

test('poner meta guarda el número', async () => {
  const onSave = jest.fn().mockResolvedValue(undefined);
  const screen = await render(<BodyGoalCard kind={{ id: 'waist_cm', title: 'Cintura', unit: 'cm' }} measurements={[]} goal={null} onSaveGoal={onSave}/>);
  await fireEvent.press(screen.getByLabelText('Poner meta de cintura'));
  await fireEvent.changeText(screen.getByLabelText('Meta (cm)'), '82');
  await fireEvent.press(screen.getByText('Guardar meta'));
  await waitFor(() => expect(onSave).toHaveBeenCalledWith(82));
});
