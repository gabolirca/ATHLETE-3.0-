import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { RoutineStylePicker, getRoutineStyle, setRoutineStyle, suggestRoutineStyle } from './routineStyle';

jest.mock('@expo/vector-icons', () => ({ MaterialCommunityIcons: () => null }));
const mockStore = new Map<string, string>();
jest.mock('expo-secure-store', () => ({
  getItemAsync: async (k: string) => mockStore.get(k) ?? null,
  setItemAsync: async (k: string, v: string) => { mockStore.set(k, v); },
}));

test('sugiere ícono por el nombre y, si no dice nada, por el músculo con más series', () => {
  expect(suggestRoutineStyle('Pierna A').icon).toBe('weight-lifter');
  expect(suggestRoutineStyle('Natación técnica').icon).toBe('swim');
  expect(suggestRoutineStyle('Día 2', 'biceps').icon).toBe('arm-flex');
  expect(suggestRoutineStyle('Día 3', 'back').icon).toBe('rowing');
  expect(suggestRoutineStyle('Lo que sea')).toEqual({ icon: 'dumbbell', color: 'blue' });
});

test('el ícono elegido se guarda por rutina y se ignora si está dañado', async () => {
  await setRoutineStyle('r-1', { icon: 'bike', color: 'green' });
  expect(await getRoutineStyle('r-1')).toEqual({ icon: 'bike', color: 'green' });
  expect(await getRoutineStyle('r-2')).toBeNull();
  mockStore.set('athlete3.routineStyle.r-3', '{"icon":"bike","color":"rosa"}');
  expect(await getRoutineStyle('r-3')).toBeNull();
});

test('el selector cambia ícono y color', async () => {
  const onChange = jest.fn();
  const screen = await render(<RoutineStylePicker value={{ icon: 'dumbbell', color: 'blue' }} onChange={onChange}/>);
  await fireEvent.press(screen.getByLabelText('Ícono Nadar'));
  expect(onChange).toHaveBeenLastCalledWith({ icon: 'swim', color: 'blue' });
  await fireEvent.press(screen.getByLabelText('Color verde'));
  expect(onChange).toHaveBeenLastCalledWith({ icon: 'dumbbell', color: 'green' });
});
