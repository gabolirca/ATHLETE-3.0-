import React from 'react';
import { act, fireEvent, render, renderHook, waitFor } from '@testing-library/react-native';
import { Vibration } from 'react-native';
import { BlockHeader, blockResultText, clock, isWholeBlock, parseMinSec, useBlockClock } from './blocks';
import { TimedSetEditor } from '@/components/TimedSetEditor';
import type { WorkoutBlock } from '@/data/trainingTypes';

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));

const amrap: WorkoutBlock = { id: 'b', name: 'C · AMRAP 15 min', kind: 'wod', format: 'amrap', rounds: null, timeCapSeconds: 900, restSeconds: null, targetRpe: 7.5, notes: 'Ritmo sostenible', result: null };

test('utilidades de bloque', () => {
  expect([parseMinSec('12:34'), parseMinSec('45'), parseMinSec(''), Number.isNaN(parseMinSec('1:75'))]).toEqual([754, 45, null, true]);
  expect(clock(754)).toBe('12:34');
  expect(isWholeBlock('amrap') && isWholeBlock('rounds') && !isWholeBlock('sets') && !isWholeBlock('continuous')).toBe(true);
  expect(blockResultText({ format: 'amrap', result: { id: 'r', roundsCompleted: 6, extraReps: 4, durationSeconds: 900 } })).toBe('6 rondas + 4 reps');
  expect(blockResultText({ format: 'for_time', result: { id: 'r', roundsCompleted: null, extraReps: null, durationSeconds: 754 } })).toBe('12:34');
  expect(blockResultText({ format: 'rounds', result: null })).toBeNull();
});

test('reloj del AMRAP: cuenta regresiva con la hora real y vibra al llegar a 0', async () => {
  jest.useFakeTimers();
  const vibrate = jest.spyOn(Vibration, 'vibrate').mockImplementation(() => undefined);
  let now = 1_000_000;
  const { result } = await renderHook(() => useBlockClock(900, () => now));
  expect(result.current.remaining).toBe(900);
  await act(async () => { result.current.start(); });
  now += 120_000;
  await act(async () => { jest.advanceTimersByTime(300); });
  expect(result.current.remaining).toBe(780);
  now += 800_000;
  await act(async () => { jest.advanceTimersByTime(300); });
  expect(result.current.finished).toBe(true);
  expect(vibrate).toHaveBeenCalledTimes(1);
  vibrate.mockRestore();
  jest.useRealTimers();
});

test('bloque AMRAP: muestra formato y guarda rondas + reps', async () => {
  const onSave = jest.fn().mockResolvedValue(undefined);
  const screen = await render(<BlockHeader block={amrap} editable onSaveResult={onSave}/>);
  expect(screen.getByText('AMRAP 15 min · RPE 7.5')).toBeTruthy();
  expect(screen.getByLabelText('Reloj del bloque').props.children).toBe('15:00');
  await fireEvent.changeText(screen.getByLabelText('Rondas completas'), '6');
  await fireEvent.changeText(screen.getByLabelText('Reps extra'), '4');
  await fireEvent.press(screen.getByLabelText('Guardar resultado de C · AMRAP 15 min'));
  await waitFor(() => expect(onSave).toHaveBeenCalledWith({ roundsCompleted: 6, extraReps: 4, durationSeconds: 900 }));
});

test('bloque por tiempo: valida y guarda el tiempo', async () => {
  const onSave = jest.fn().mockResolvedValue(undefined);
  const screen = await render(<BlockHeader block={{ ...amrap, format: 'for_time', name: 'Por tiempo', timeCapSeconds: null }} editable onSaveResult={onSave}/>);
  await fireEvent.changeText(screen.getByLabelText('Tu tiempo (min:seg)'), '12:99');
  await fireEvent.press(screen.getByLabelText('Guardar resultado de Por tiempo'));
  expect(screen.getByText('Escribe tu tiempo como min:seg, por ejemplo 12:34.')).toBeTruthy();
  await fireEvent.changeText(screen.getByLabelText('Tu tiempo (min:seg)'), '12:34');
  await fireEvent.press(screen.getByLabelText('Guardar resultado de Por tiempo'));
  await waitFor(() => expect(onSave).toHaveBeenCalledWith({ roundsCompleted: null, extraReps: null, durationSeconds: 754 }));
});

test('serie por tiempo/distancia: "Como el plan" guarda el objetivo', async () => {
  const onSave = jest.fn().mockResolvedValue(undefined);
  const set = { id: 's', setIndex: 0, weightKg: null, reps: null, rir: null, isWarmup: false, durationSeconds: null, distanceMeters: null };
  const screen = await render(<TimedSetEditor set={set} label="REGISTRO" targetSeconds={null} targetMeters={400} onSave={onSave}/>);
  expect(screen.getByLabelText('Distancia (m)').props.placeholder).toBe('400');
  await fireEvent.press(screen.getByLabelText('Como el plan: REGISTRO'));
  await waitFor(() => expect(onSave).toHaveBeenCalledWith({ weightKg: null, reps: null, rir: null, isWarmup: false, durationSeconds: null, distanceMeters: 400 }));
});

test('circuito por rondas: cuenta las vueltas, arranca el descanso y guarda solo al terminar la última', async () => {
  const circuit: WorkoutBlock = { id: 'c', name: 'B · Circuito', kind: 'conditioning', format: 'rounds', rounds: 3, timeCapSeconds: null, restSeconds: 90, targetRpe: 6.5, notes: null, result: null };
  const onSaveResult = jest.fn().mockResolvedValue(undefined);
  const onRest = jest.fn();
  const screen = await render(<BlockHeader block={circuit} editable onSaveResult={onSaveResult} onRest={onRest}/>);
  expect(screen.getByText('Ronda 1 de 3')).toBeTruthy();
  expect(screen.getByLabelText('Reloj del bloque')).toBeTruthy(); // el circuito ya tiene su reloj
  await fireEvent.press(screen.getByLabelText('Terminé la ronda 1'));
  expect(onRest).toHaveBeenLastCalledWith(90, 'Descanso · sigue la ronda 2 de 3');
  await fireEvent.press(screen.getByLabelText('Terminé la ronda 2'));
  expect(onSaveResult).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByLabelText('Terminé la ronda 3'));
  await waitFor(() => expect(onSaveResult).toHaveBeenCalledWith(expect.objectContaining({ roundsCompleted: 3, extraReps: null })));
  expect(onRest).toHaveBeenCalledTimes(2); // sin descanso después de la última
  expect(screen.getByText('¡Circuito completo!')).toBeTruthy();
});
