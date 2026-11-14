import React from 'react';
import { act, fireEvent, render, renderHook, waitFor } from '@testing-library/react-native';
import { HoldToExit, RestTimerFullScreen, useRestTimer } from '@/components/RestTimer';
import { exerciseProgress, nextStepLabel, workoutGuide } from './guide';

const set = (reps: number | null, isWarmup = false) => ({ id: Math.random().toString(), setIndex: 0, weightKg: 80, reps, rir: null, isWarmup });
const ex = (name: string, setsTarget: number | null, sets: ReturnType<typeof set>[]) => ({ exerciseName: name, setsTarget, sets });

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));

describe('guía del entrenamiento', () => {
  test('cuenta solo series de trabajo con reps; el borrador vacío y el calentamiento no cuentan', () => {
    expect(exerciseProgress(ex('Sentadilla', 3, [set(10, true), set(5), set(5), set(null)]))).toEqual({ done: 2, target: 3, complete: false });
    expect(exerciseProgress(ex('Sentadilla', 2, [set(5), set(5)]))).toEqual({ done: 2, target: 2, complete: true });
  });

  test('el actual es el primero sin terminar; los terminados quedan atrás', () => {
    const g = workoutGuide([ex('Sentadilla', 2, [set(5), set(5)]), ex('Prensa', 3, [set(10)]), ex('Curl femoral', 2, [])]);
    expect(g).toMatchObject({ guided: true, statuses: ['done', 'current', 'upcoming'], currentIndex: 1, allComplete: false, setsDone: 3, setsTarget: 7 });
  });

  test('rutina completa', () => {
    expect(workoutGuide([ex('A', 1, [set(5)]), ex('B', 1, [set(8)])])).toMatchObject({ allComplete: true, currentIndex: null, setsDone: 2 });
  });

  test('sesión libre (sin objetivos): sin orden que seguir', () => {
    expect(workoutGuide([ex('Libre', null, [set(5)])])).toMatchObject({ guided: false, statuses: ['free'], allComplete: false });
  });

  test('qué sigue después de guardar una serie', () => {
    const list = [ex('Sentadilla', 3, [set(5)]), ex('Prensa', 3, [])];
    expect(nextStepLabel(list, 0)).toBe('Siguiente: serie 2 de 3 · Sentadilla');
    const done = [ex('Sentadilla', 1, [set(5)]), ex('Prensa', 3, [])];
    expect(nextStepLabel(done, 0)).toBe('Siguiente ejercicio: Prensa');
    expect(nextStepLabel([ex('Último', 1, [set(5)])], 0)).toBe('¡Rutina completa! Finaliza y guarda');
    expect(nextStepLabel([ex('Libre', null, [set(5)])], 0)).toBe('Siguiente: Libre');
  });
});

test('descanso obligatorio: pantalla completa, sin "Saltar"; solo +15 y salir manteniendo 3 s', async () => {
  const { result } = await renderHook(() => useRestTimer());
  await act(async () => { result.current.start(60, 'Siguiente ejercicio: Prensa'); });
  const screen = await render(<RestTimerFullScreen timer={result.current}/>);
  expect(screen.getByText('DESCANSO OBLIGATORIO')).toBeTruthy();
  expect(screen.getByText('Siguiente ejercicio: Prensa')).toBeTruthy();
  expect(screen.queryByText('Saltar')).toBeNull();
  expect(screen.getByText('+15 s')).toBeTruthy();
  expect(screen.getByLabelText('Salir del descanso (mantén presionado 3 segundos)')).toBeTruthy();
});

test('salir manteniendo 3 s: soltar antes cancela; mantener 3 s sale', async () => {
  jest.useFakeTimers();
  const onExit = jest.fn();
  const screen = await render(<HoldToExit onExit={onExit}/>);
  const button = screen.getByLabelText('Salir del descanso (mantén presionado 3 segundos)');
  await fireEvent(button, 'pressIn');
  await act(async () => { jest.advanceTimersByTime(1500); });
  expect(screen.getByText(/Saliendo en 2 s/)).toBeTruthy();
  await fireEvent(button, 'pressOut');
  await act(async () => { jest.advanceTimersByTime(3000); });
  expect(onExit).not.toHaveBeenCalled();
  expect(screen.getByText('Mantén presionado 3 s para salir')).toBeTruthy();
  await fireEvent(button, 'pressIn');
  await act(async () => { jest.advanceTimersByTime(3100); });
  expect(onExit).toHaveBeenCalledTimes(1);
  jest.useRealTimers();
});
