import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';
import { AthleteDataProvider, useAthleteData } from './AthleteDataProvider';

const mockClose = jest.fn().mockResolvedValue(undefined);
const mockOpenAthleteData = jest.fn();

jest.mock('@athlete/data', () => ({
  openAthleteData: (...args: unknown[]) => mockOpenAthleteData(...args),
  createUuidV7Generator: () => ({ newId: () => '018bcfe5-6800-7000-8000-000000000001' }),
}));
jest.mock('expo-sqlite', () => ({ openDatabaseAsync: jest.fn() }));
jest.mock('expo-secure-store', () => ({ getItemAsync: jest.fn(), setItemAsync: jest.fn(), deleteItemAsync: jest.fn() }));

function StateLabel() {
  const { status, data, error } = useAthleteData();
  return <Text>{status}:{data ? 'services-open' : 'no-services'}:{error?.message ?? 'no-error'}</Text>;
}

beforeEach(() => {
  mockOpenAthleteData.mockReset();
  mockClose.mockClear();
  mockOpenAthleteData.mockResolvedValue({ close: mockClose });
});

test('opens the official data entrypoint and exposes ready services', async () => {
  const screen = await render(<AthleteDataProvider><StateLabel /></AthleteDataProvider>);
  await waitFor(() => expect(screen.getByText('ready:services-open:no-error')).toBeTruthy());

  expect(mockOpenAthleteData).toHaveBeenCalledTimes(1);
  const options = mockOpenAthleteData.mock.calls[0]?.[0];
  expect(options).toEqual(expect.objectContaining({
    openDatabase: expect.any(Function),
    secureStore: expect.objectContaining({ getItem: expect.any(Function), setItem: expect.any(Function), removeItem: expect.any(Function) }),
    randomBytes: expect.any(Function),
  }));
  expect(options.accountTransport).toBeUndefined();
  screen.unmount();
  await waitFor(() => expect(mockClose).toHaveBeenCalledTimes(1));
});

test('reports bootstrap failure and leaves retry available through the provider state', async () => {
  mockOpenAthleteData.mockRejectedValueOnce(new Error('database-unreadable'));
  const screen = await render(<AthleteDataProvider><StateLabel /></AthleteDataProvider>);
  await waitFor(() => expect(screen.getByText('error:no-services:database-unreadable')).toBeTruthy());
});
