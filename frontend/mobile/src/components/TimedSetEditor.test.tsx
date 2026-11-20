import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { TimedSetEditor } from './TimedSetEditor';

test('plancha: cuenta regresiva con el tiempo meta y se guarda sola al terminar', async () => {
  jest.useFakeTimers();
  let t = 0;
  const onSave = jest.fn().mockResolvedValue(undefined);
  const screen = await render(<TimedSetEditor set={{ id: 's', setIndex: 0, weightKg: null, reps: null, rir: null, isWarmup: false, durationSeconds: null, distanceMeters: null }}
    label="SERIE 1" targetSeconds={40} targetMeters={null} onSave={onSave} withTimer now={() => t}/>);
  await fireEvent.press(screen.getByLabelText('Iniciar 0:40'));
  t = 20_000; await act(async () => { jest.advanceTimersByTime(300); });
  expect(screen.getByText('0:20')).toBeTruthy();
  t = 40_100; await act(async () => { jest.advanceTimersByTime(300); });
  await waitFor(() => expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ durationSeconds: 40, reps: null })));
  jest.useRealTimers();
});
