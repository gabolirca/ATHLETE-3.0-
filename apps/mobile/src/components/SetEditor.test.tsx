import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { SetEditor } from './SetEditor';

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));

const blank = (id: string, extra: Record<string, unknown> = {}) => ({ id, setIndex: 0, weightKg: null, reps: null, rir: null, isWarmup: false, ...extra });

test('pregunta el esfuerzo en lenguaje claro y guarda el número en el campo rir', async () => {
  const onSave = jest.fn().mockResolvedValue(undefined);
  const view = await render(<SetEditor set={blank('set-1')} onSave={onSave} />);
  expect(view.getByText('¿Cuántas repeticiones más podrías haber hecho?')).toBeTruthy();
  expect(view.queryByText('RIR')).toBeNull();
  await fireEvent.changeText(view.getByLabelText('Peso (kg)'), '42.5');
  await fireEvent.changeText(view.getByLabelText('Repeticiones'), '10');
  await fireEvent.press(view.getByLabelText('2 repeticiones más'));
  await waitFor(() => expect(onSave).toHaveBeenLastCalledWith({ weightKg: 42.5, reps: 10, rir: 2, isWarmup: false }));
});

test('por defecto muestra solo 0–4 más un botón para desplegar hasta 10', async () => {
  const onSave = jest.fn().mockResolvedValue(undefined);
  const view = await render(<SetEditor set={blank('set-2')} onSave={onSave} />);
  expect(view.getByLabelText('0 ninguna repetición más')).toBeTruthy();
  expect(view.getByLabelText('4 repeticiones más')).toBeTruthy();
  expect(view.queryByLabelText('5 repeticiones más')).toBeNull();
  expect(view.queryByLabelText('0.5 media repetición más')).toBeNull();
  await fireEvent.press(view.getByLabelText('Mostrar más opciones'));
  await fireEvent.press(view.getByLabelText('10 repeticiones más'));
  await waitFor(() => expect(onSave).toHaveBeenCalledWith({ weightKg: null, reps: null, rir: 10, isWarmup: false }));
});

test('el cero se guarda como 0 y "Quitar respuesta" guarda null', async () => {
  const onSave = jest.fn().mockResolvedValue(undefined);
  const view = await render(<SetEditor set={blank('set-0', { weightKg: 20, reps: 8 })} onSave={onSave} />);
  expect(view.queryByLabelText('Sin respuesta')).toBeNull(); // sin valor no hay nada que quitar
  await fireEvent.press(view.getByLabelText('0 ninguna repetición más'));
  await waitFor(() => expect(onSave).toHaveBeenLastCalledWith({ weightKg: 20, reps: 8, rir: 0, isWarmup: false }));
  await fireEvent.press(view.getByLabelText('Sin respuesta'));
  await waitFor(() => expect(onSave).toHaveBeenLastCalledWith({ weightKg: 20, reps: 8, rir: null, isWarmup: false }));
});

test('"Más precisión" muestra medios puntos', async () => {
  const onSave = jest.fn().mockResolvedValue(undefined);
  const view = await render(<SetEditor set={blank('set-half', { weightKg: 20, reps: 8 })} onSave={onSave} />);
  await fireEvent.press(view.getByText('Más precisión'));
  await fireEvent.press(view.getByLabelText('0.5 media repetición más'));
  await waitFor(() => expect(onSave).toHaveBeenLastCalledWith({ weightKg: 20, reps: 8, rir: 0.5, isWarmup: false }));
});

test('marca el objetivo de la rutina y centra las opciones en él', async () => {
  const view = await render(<SetEditor set={blank('set-t')} targetRir={6} onSave={jest.fn().mockResolvedValue(undefined)} />);
  expect(view.getByLabelText('6 repeticiones más (objetivo)')).toBeTruthy();
  expect(view.getByLabelText('8 repeticiones más')).toBeTruthy();
  expect(view.queryByLabelText('0 ninguna repetición más')).toBeNull();
  expect(view.getByText('Objetivo de la rutina: 6')).toBeTruthy();
});

test('las series de calentamiento no preguntan el RIR y no borran el dato guardado', async () => {
  const onSave = jest.fn().mockResolvedValue(undefined);
  const view = await render(<SetEditor set={blank('set-w', { rir: 3 })} onSave={onSave} />);
  await fireEvent.press(view.getByText('Calentamiento'));
  expect(view.queryByText('¿Cuántas repeticiones más podrías haber hecho?')).toBeNull();
  await waitFor(() => expect(onSave).toHaveBeenLastCalledWith({ weightKg: null, reps: null, rir: 3, isWarmup: true }));
});

test('un valor guardado fuera de rango avisa y despliega todo para corregirlo', async () => {
  const onSave = jest.fn().mockResolvedValue(undefined);
  const view = await render(<SetEditor set={blank('set-3', { weightKg: 20, reps: 10, rir: 12 })} onSave={onSave} />);
  expect(view.getByText('El valor guardado (12) está fuera del rango permitido (0–10). Selecciona un valor para corregirlo.')).toBeTruthy();
  await fireEvent.press(view.getByLabelText('10 repeticiones más'));
  await waitFor(() => expect(onSave).toHaveBeenCalledWith({ weightKg: 20, reps: 10, rir: 10, isWarmup: false }));
});
