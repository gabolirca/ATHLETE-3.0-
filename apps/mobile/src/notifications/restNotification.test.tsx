import React from 'react';
import { act, render, waitFor } from '@testing-library/react-native';

jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  getPermissionsAsync: jest.fn(async () => ({ granted: true })),
  requestPermissionsAsync: jest.fn(),
  scheduleNotificationAsync: jest.fn(async () => 'n1'),
  cancelScheduledNotificationAsync: jest.fn(async () => undefined),
  SchedulableTriggerInputTypes: { TIME_INTERVAL: 'timeInterval' },
}));
const mockN = jest.requireMock('expo-notifications') as Record<string, jest.Mock>;
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));

import { useRestTimer } from '@/components/RestTimer';

test('el descanso agenda un aviso con la pantalla apagada y lo cancela al saltarlo', async () => {
  let timer!: ReturnType<typeof useRestTimer>;
  function Probe() { timer = useRestTimer(); return null; }
  await render(<Probe/>);
  await act(async () => { timer.start(90, 'Siguiente: Prensa'); });
  await waitFor(() => expect(mockN.scheduleNotificationAsync).toHaveBeenCalledWith(expect.objectContaining({
    content: expect.objectContaining({ body: 'Siguiente: Prensa' }),
    trigger: expect.objectContaining({ type: 'timeInterval' }),
  })));
  await act(async () => { timer.stop(); });
  await waitFor(() => expect(mockN.cancelScheduledNotificationAsync).toHaveBeenCalledWith('n1'));
});
