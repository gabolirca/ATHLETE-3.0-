import React from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { act, render, waitFor } from '@testing-library/react-native';
import { emitLocalChange } from '@/data/localChanges';
import { AccountProvider } from './AccountProvider';

/*
 * Cableado real de la sincronización automática dentro del proveedor de cuenta, con relojes reales y
 * tiempos cortos. Los tiempos exactos (3 s, 15 s → 5 min) se prueban en syncScheduler.test.ts.
 */
const FAST = { debounceMs: 30, retryBaseMs: 60, retryMaxMs: 120 };
const USER = '11111111-1111-4111-8111-111111111111';
const status = () => ({ pendingCount: 1, conflictCount: 0, rejectedCount: 0, lastPushAt: null, lastPullAt: null, online: true });
const okSync = async () => ({ ok: true as const, value: status() });
const mockSyncNow = jest.fn(okSync);
const mockData = { identity: { accountUserId: USER }, sync: { status: async () => status(), syncNow: mockSyncNow } };
let mockAuthListener: ((s: unknown) => void) | null = null;
const mockCloud = {
  auth: {
    getState: async () => ({ status: 'signed_in', user: { id: USER, email: 'a@b.c' } }),
    onStateChange: (cb: (s: unknown) => void) => { mockAuthListener = cb; return () => { mockAuthListener = null; }; },
    signOut: async () => undefined,
  },
  supabase: { auth: { startAutoRefresh: async () => undefined, stopAutoRefresh: jest.fn(async () => undefined) } },
};
jest.mock('./cloud', () => ({ getCloud: () => mockCloud, cloudUnavailableReason: () => null }));
jest.mock('@/data/AthleteDataProvider', () => ({ useAthleteData: () => ({ data: mockData, replaceData: () => undefined }) }));

let appStateHandler: ((s: AppStateStatus) => void) | null = null;
beforeEach(() => {
  mockSyncNow.mockImplementation(okSync);
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, handler) => {
    appStateHandler = handler as (s: AppStateStatus) => void;
    return { remove: () => { appStateHandler = null; } } as ReturnType<typeof AppState.addEventListener>;
  });
});

const sleep = (ms: number) => act(() => new Promise<void>((resolve) => setTimeout(resolve, ms)));

async function mount() {
  await render(<AccountProvider syncOptions={FAST}><></></AccountProvider>);
  await waitFor(() => expect(mockSyncNow).toHaveBeenCalledTimes(1)); // primera subida al vincular
  mockSyncNow.mockClear();
}

test('con sesión y datos vinculados sincroniza sola al arrancar', async () => {
  await mount();
});

test('un cambio local se sube solo tras la espera, y varios cambios seguidos son una sola subida', async () => {
  await mount();
  await act(() => { emitLocalChange(); emitLocalChange(); emitLocalChange(); });
  expect(mockSyncNow).not.toHaveBeenCalled();
  await waitFor(() => expect(mockSyncNow).toHaveBeenCalledTimes(1));
  await sleep(100);
  expect(mockSyncNow).toHaveBeenCalledTimes(1);
});

test('al mandar la app a segundo plano sube lo pendiente sin esperar', async () => {
  await mount();
  await act(() => { emitLocalChange(); appStateHandler?.('background'); });
  await waitFor(() => expect(mockSyncNow).toHaveBeenCalledTimes(1));
  expect(mockCloud.supabase.auth.stopAutoRefresh).toHaveBeenCalled();
  await sleep(100);
  expect(mockSyncNow).toHaveBeenCalledTimes(1);
});

test('sin conexión los datos quedan en el teléfono y se reintenta solo', async () => {
  await mount();
  mockSyncNow.mockResolvedValueOnce({ ok: false, error: { code: 'NETWORK_UNAVAILABLE', message: 'x' } } as never);
  await act(() => emitLocalChange());
  await waitFor(() => expect(mockSyncNow).toHaveBeenCalledTimes(2));
});

test('al cerrar sesión deja de sincronizar', async () => {
  await mount();
  await act(() => mockAuthListener?.({ status: 'signed_out', reason: 'signed_out' }));
  await act(() => emitLocalChange());
  await sleep(200);
  expect(mockSyncNow).not.toHaveBeenCalled();
});
