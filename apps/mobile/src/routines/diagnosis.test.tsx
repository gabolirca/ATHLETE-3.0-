import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import type { Exercise } from '@/data/trainingTypes';
import { RoutineDiagnosisCard, diagnoseRoutine, routineFocus } from './diagnosis';

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));

const ex = (id: string, primary: Array<[string, string]>, secondary: Array<[string, string]> = []): Exercise => ({
  id, name: id, muscleGroup: '', equipment: null, origin: 'sample',
  muscleRoles: { primary: primary.map(([slug, name]) => ({ slug, name })), secondary: secondary.map(([slug, name]) => ({ slug, name })) },
});
const bench = ex('bench', [['chest', 'Pecho']], [['shoulders', 'Hombros'], ['triceps', 'Tríceps']]);
const fly = ex('fly', [['chest', 'Pecho']]);
const items = [{ exercise: bench, sets: 4 }, { exercise: fly, sets: 3 }];

test('diagnóstico: series por semana según la frecuencia y músculos sin trabajo', () => {
  const once = diagnoseRoutine(items, 1);
  expect(once.trained.map((m) => [m.name, m.sets, m.status])).toEqual([['Pecho', 7, 'low'], ['Hombros', 2, 'low'], ['Tríceps', 2, 'low']]);
  expect(once.missing.map((m) => m.name)).toContain('Cuádriceps');
  expect(diagnoseRoutine(items, 2).trained[0]).toMatchObject({ name: 'Pecho', sets: 14, status: 'ok' });
  expect(routineFocus(items)).toBe('Pecho 7 · Hombros 2 · Tríceps 2');
});

test('la tarjeta cambia de veredicto al elegir la frecuencia', async () => {
  const onTimes = jest.fn();
  const screen = await render(<RoutineDiagnosisCard items={items} timesPerWeek={1} onTimesChange={onTimes}/>);
  expect(screen.getByText('3 músculos quedan bajos')).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('3× por semana'));
  expect(onTimes).toHaveBeenCalledWith(3);
  const three = await render(<RoutineDiagnosisCard items={items} timesPerWeek={3} onTimesChange={onTimes}/>);
  expect(three.getByText('1 músculo queda bajo y 1 con demasiadas series')).toBeTruthy(); // pecho 21 (alto), hombros 6 (bajo), tríceps 6 (ok)
});
