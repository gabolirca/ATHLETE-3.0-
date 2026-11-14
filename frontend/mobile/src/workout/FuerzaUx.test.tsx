import React from 'react';
import { act, fireEvent, render, renderHook } from '@testing-library/react-native';
import { Vibration } from 'react-native';
import { formatClock, useRestTimer } from '@/components/RestTimer';
import { filterExercises } from '@/components/ExercisePicker';
import { SetEditor } from '@/components/SetEditor';
import { previousPerformance } from '@/data/OfficialTrainingRepository';
import type { Exercise } from '@/data/trainingTypes';

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('@/data/MobileTrainingContext', () => ({ useTrainingRepository: () => null }));

describe('temporizador de descanso', () => {
  test('formato del reloj', () => {
    expect(formatClock(90_000)).toBe('1:30');
    expect(formatClock(300)).toBe('0:01');
    expect(formatClock(-5)).toBe('0:00');
  });

  test('cuenta con la hora real, se ajusta ±15 s, vibra al terminar y se puede saltar', async () => {
    jest.useFakeTimers();
    const vibrate = jest.spyOn(Vibration, 'vibrate').mockImplementation(() => undefined);
    let clock = 1_000_000;
    const { result } = await renderHook(() => useRestTimer(() => clock));
    await act(async () => { result.current.start(90, 'Siguiente: Sentadilla'); });
    expect(result.current.active).toBe(true);
    expect(formatClock(result.current.remaining)).toBe('1:30');
    await act(async () => { result.current.add(15); });
    clock += 60_000; // la app pudo estar en segundo plano: cuenta la hora, no los ticks
    await act(async () => { jest.advanceTimersByTime(300); });
    expect(formatClock(result.current.remaining)).toBe('0:45');
    clock += 46_000;
    await act(async () => { jest.advanceTimersByTime(300); });
    expect(result.current.done).toBe(true);
    expect(vibrate).toHaveBeenCalledTimes(1);
    await act(async () => { jest.advanceTimersByTime(4_100); });
    expect(result.current.active).toBe(false);
    await act(async () => { result.current.start(60, 'x'); });
    await act(async () => { result.current.stop(); });
    expect(result.current.active).toBe(false);
    jest.useRealTimers();
    vibrate.mockRestore();
  });
});

test('la vez pasada: la sesión más reciente, sin calentamientos ni la sesión actual, en orden', () => {
  const base = { rir: 2, completedAt: null as string | null };
  const sets = [
    { ...base, sessionId: 'old', localDate: '2026-11-01', setType: 'working', weightKg: 70, reps: 8, position: 0 },
    { ...base, sessionId: 'last', localDate: '2026-11-04', setType: 'warmup', weightKg: 40, reps: 10, position: 0 },
    { ...base, sessionId: 'last', localDate: '2026-11-04', setType: 'working', weightKg: 77.5, reps: 6, position: 2 },
    { ...base, sessionId: 'last', localDate: '2026-11-04', setType: 'working', weightKg: 80, reps: 5, position: 1 },
    { ...base, sessionId: 'now', localDate: '2026-11-08', setType: 'working', weightKg: 85, reps: 3, position: 0 },
  ];
  expect(previousPerformance(sets, 'now')).toEqual({ localDate: '2026-11-04', sets: [{ weightKg: 80, reps: 5, rir: 2 }, { weightKg: 77.5, reps: 6, rir: 2 }] });
  expect(previousPerformance(sets.filter((s) => s.sessionId === 'now'), 'now')).toBeNull();
});

test('filtros del selector por músculo y equipo', () => {
  const ex = (name: string, muscles: string[], equipmentList: string[]): Exercise => ({ id: name, name, muscleGroup: muscles.join(', '), equipment: equipmentList.join(', '), origin: 'sample', muscles, equipmentList });
  const list = [ex('Press de banca', ['Pecho'], ['Barra', 'Banco']), ex('Aperturas', ['Pecho'], ['Mancuernas']), ex('Sentadilla', ['Cuádriceps', 'Glúteos'], ['Barra'])];
  expect(filterExercises(list, 'Pecho', null).map((e) => e.name)).toEqual(['Press de banca', 'Aperturas']);
  expect(filterExercises(list, null, 'Barra').map((e) => e.name)).toEqual(['Press de banca', 'Sentadilla']);
  expect(filterExercises(list, 'Glúteos', 'Barra').map((e) => e.name)).toEqual(['Sentadilla']);
  expect(filterExercises(list, null, null)).toHaveLength(3);
});

test('serie: muestra la vez pasada como guía y la repite con un toque', async () => {
  const onSave = jest.fn().mockResolvedValue(undefined);
  const screen = await render(<SetEditor set={{ id: 's1', setIndex: 0, weightKg: null, reps: null, rir: null, isWarmup: false }} previous={{ weightKg: 80, reps: 5 }} onSave={onSave}/>);
  expect(screen.getByLabelText('Peso (kg)').props.placeholder).toBe('80');
  expect(screen.getByLabelText('Repeticiones').props.placeholder).toBe('5');
  await fireEvent.press(screen.getByText('↻ Igual que la vez pasada · 80 kg × 5'));
  expect(onSave).toHaveBeenCalledWith({ weightKg: 80, reps: 5, rir: null, isWarmup: false });
});

test('serie: acepta coma decimal (77,5)', async () => {
  const onSave = jest.fn().mockResolvedValue(undefined);
  const screen = await render(<SetEditor set={{ id: 's1', setIndex: 0, weightKg: null, reps: null, rir: null, isWarmup: false }} onSave={onSave}/>);
  await fireEvent.changeText(screen.getByLabelText('Peso (kg)'), '77,5');
  await fireEvent.changeText(screen.getByLabelText('Repeticiones'), '6');
  await fireEvent(screen.getByLabelText('Repeticiones'), 'blur');
  expect(onSave).toHaveBeenLastCalledWith({ weightKg: 77.5, reps: 6, rir: null, isWarmup: false });
});
