const mockSchedule = jest.fn().mockResolvedValue('n1');
const mockSetHandler = jest.fn();
jest.mock('expo-notifications', () => ({
  setNotificationHandler: (h: unknown) => mockSetHandler(h),
  getPermissionsAsync: jest.fn().mockResolvedValue({ granted: true }),
  requestPermissionsAsync: jest.fn(),
  setNotificationChannelAsync: jest.fn().mockResolvedValue(null),
  scheduleNotificationAsync: (r: unknown) => mockSchedule(r),
  cancelScheduledNotificationAsync: jest.fn().mockResolvedValue(undefined),
  AndroidImportance: { HIGH: 4 },
  SchedulableTriggerInputTypes: { TIME_INTERVAL: 'timeInterval' },
}));

import { APP_SOUND, _resetRestNotificationForTesting, foregroundBehavior, scheduleRestEnd } from './restNotification';

beforeEach(() => { jest.clearAllMocks(); _resetRestNotificationForTesting(); });

test('el fin de descanso usa el sonido del sistema y se marca para sonar con la app abierta', async () => {
  await scheduleRestEnd(Date.now() + 90_000, 'Siguiente: serie 2 de 4 · Press banca');
  const req = mockSchedule.mock.calls[0]![0];
  expect(req.content).toMatchObject({ sound: APP_SOUND, data: { kind: 'rest-end' }, body: 'Siguiente: serie 2 de 4 · Press banca' });
  expect(req.trigger).toMatchObject({ seconds: 90, repeats: false });
  expect(APP_SOUND).toBe('default');
});

test('con la app abierta: el descanso suena sin banner; otras notificaciones no suenan', () => {
  expect(foregroundBehavior({ kind: 'rest-end' })).toEqual({ shouldShowBanner: false, shouldShowList: false, shouldPlaySound: true, shouldSetBadge: false });
  expect(foregroundBehavior(undefined).shouldPlaySound).toBe(false);
});

test('descansos de menos de 2 segundos no programan aviso', async () => {
  await scheduleRestEnd(Date.now() + 1000, '');
  expect(mockSchedule).not.toHaveBeenCalled();
});
