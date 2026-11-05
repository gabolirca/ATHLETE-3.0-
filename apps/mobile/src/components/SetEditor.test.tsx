import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { SetEditor } from './SetEditor';

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));

test('shows effort in plain language and saves the selected number to the existing rir field', async () => {
  const onSave = jest.fn().mockResolvedValue(undefined);
  const view = await render(<SetEditor set={{ id: 'set-1', setIndex: 0, weightKg: null, reps: null, rir: null, isWarmup: false }} onSave={onSave} />);
  expect(view.getByText('¿Cuántas repeticiones más podrías haber hecho?')).toBeTruthy();
  expect(view.getByText('Indica cuántas repeticiones adicionales te quedaban al terminar la serie.')).toBeTruthy();
  expect(view.queryByText('RIR')).toBeNull();
  await fireEvent.changeText(view.getByLabelText('Peso (kg)'), '42.5');
  await fireEvent.changeText(view.getByLabelText('Repeticiones'), '10');
  await fireEvent.press(view.getByLabelText('2 repeticiones más'));
  await waitFor(() => expect(onSave).toHaveBeenLastCalledWith({ weightKg: 42.5, reps: 10, rir: 2, isWarmup: false }));
});

test('offers the full contract range, including zero and ten', async () => {
  const onSave = jest.fn().mockResolvedValue(undefined);
  const view = await render(<SetEditor set={{ id: 'set-2', setIndex: 0, weightKg: null, reps: null, rir: null, isWarmup: false }} onSave={onSave} />);
  expect(view.getByLabelText('0 ninguna repetición más')).toBeTruthy();
  expect(view.getByLabelText('10 repeticiones más')).toBeTruthy();
  expect(view.getByLabelText('0 ninguna repetición más').props.accessibilityState.selected).toBe(false);
  await fireEvent.press(view.getByLabelText('0 ninguna repetición más'));
  await waitFor(() => expect(onSave).toHaveBeenCalledWith({ weightKg: null, reps: null, rir: 0, isWarmup: false }));
});

test('supports half steps and explicitly saves null when the athlete leaves effort unanswered', async () => {
  const onSave = jest.fn().mockResolvedValue(undefined);
  const view = await render(<SetEditor set={{ id: 'set-half', setIndex: 0, weightKg: 20, reps: 8, rir: null, isWarmup: false }} onSave={onSave} />);
  expect(view.getByLabelText('0.5 media repetición más')).toBeTruthy();
  await fireEvent.press(view.getByLabelText('0.5 media repetición más'));
  await waitFor(() => expect(onSave).toHaveBeenLastCalledWith({ weightKg: 20, reps: 8, rir: 0.5, isWarmup: false }));
  await fireEvent.press(view.getByLabelText('Sin respuesta'));
  await waitFor(() => expect(onSave).toHaveBeenLastCalledWith({ weightKg: 20, reps: 8, rir: null, isWarmup: false }));
});

test('explicitly warns when a saved value is outside the supported range and lets the user correct it', async () => {
  const onSave = jest.fn().mockResolvedValue(undefined);
  const view = await render(<SetEditor set={{ id: 'set-3', setIndex: 0, weightKg: 20, reps: 10, rir: 12, isWarmup: false }} onSave={onSave} />);
  expect(view.getByText('El valor guardado (12) está fuera del rango permitido (0–10). Selecciona un valor para corregirlo.')).toBeTruthy();
  await fireEvent.press(view.getByLabelText('10 repeticiones más'));
  await waitFor(() => expect(onSave).toHaveBeenCalledWith({ weightKg: 20, reps: 10, rir: 10, isWarmup: false }));
});
