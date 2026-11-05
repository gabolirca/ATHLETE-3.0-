import React from 'react';
import { render, waitFor, fireEvent } from '@testing-library/react-native';
import { Text, Pressable } from 'react-native';
import { AthleteDataProvider, useAthleteData, _resetSharedStoreForTesting } from './AthleteDataProvider';
import type { ActiveStore } from '@athlete/data';

const mockClose = jest.fn().mockResolvedValue(undefined);
const mockOpenActiveStore = jest.fn();
const mockStartNewStore = jest.fn();

jest.mock('@athlete/data', () => ({
  openActiveStore: (...args: unknown[]) => mockOpenActiveStore(...args),
  startNewStore: (...args: unknown[]) => mockStartNewStore(...args),
  createUuidV7Generator: () => ({ newId: () => '018bcfe5-6800-7000-8000-000000000001' }),
}));

jest.mock('./expoDatabaseFiles', () => ({
  expoDatabaseFiles: {
    listDatabases: jest.fn().mockResolvedValue(['athlete3.db']),
    hashDatabaseFile: jest.fn().mockResolvedValue('abcdef01'),
    copyToBackup: jest.fn().mockResolvedValue(undefined),
    hashBackupFile: jest.fn().mockResolvedValue('abcdef01'),
  },
}));

jest.mock('expo-sqlite', () => ({ openDatabaseAsync: jest.fn() }));
jest.mock('expo-secure-store', () => ({ getItemAsync: jest.fn(), setItemAsync: jest.fn(), deleteItemAsync: jest.fn() }));

const seenNewIds = new Set<unknown>();

function Consumer() {
  const { status, kind, data, selection, error, actionError, retry, startNewStore, newId } = useAthleteData();
  seenNewIds.add(newId);
  return (
    <>
      <Text>{`status:${status}`}</Text>
      <Text>{`kind:${kind ?? 'no-kind'}`}</Text>
      <Text>{`data:${data ? 'has-data' : 'no-data'}`}</Text>
      <Text>{`selection:${selection?.state ?? 'no-selection'}`}</Text>
      <Text>{`error:${error?.message ?? 'no-error'}`}</Text>
      <Text>{`actionError:${actionError?.message ?? 'none'}`}</Text>
      <Pressable accessibilityLabel="double-new-store-button" onPress={() => { void startNewStore(); void startNewStore(); }} />
      <Pressable accessibilityLabel="retry-button" onPress={retry} />
      <Pressable accessibilityLabel="new-store-button" onPress={() => void startNewStore()} />
    </>
  );
}

const blockedKeyMissing: ActiveStore = {
  kind: 'blocked',
  selection: {
    state: 'open-error', active: null, store: 'official', code: 'database-key-missing',
    message: 'Existe la base pero no su clave.', recovery: ['retry', 'start-new-store'], accountLinked: false,
  },
};

describe('AthleteDataProvider with openActiveStore', () => {
  beforeEach(() => {
    _resetSharedStoreForTesting();
    jest.clearAllMocks();
    mockClose.mockClear();
    mockOpenActiveStore.mockReset();
    mockStartNewStore.mockReset();
  });

  test('1. Instalación nueva: detecta fresh-install y abre almacén oficial', async () => {
    const fakeStore: ActiveStore = {
      kind: 'official',
      selection: { state: 'fresh-install', active: 'official' },
      data: { close: mockClose } as never,
    };
    mockOpenActiveStore.mockResolvedValue(fakeStore);

    const view = await render(
      <AthleteDataProvider>
        <Consumer />
      </AthleteDataProvider>
    );

    await waitFor(() => expect(view.getByText('status:ready')).toBeTruthy());
    expect(view.getByText('kind:official')).toBeTruthy();
    expect(view.getByText('data:has-data')).toBeTruthy();
    expect(view.getByText('selection:fresh-install')).toBeTruthy();
    expect(mockOpenActiveStore).toHaveBeenCalledWith(
      expect.objectContaining({
        newInstallations: 'official',
        files: expect.any(Object),
      })
    );
  });

  test('2. Dispositivo con almacenamiento legacy: devuelve legacy sin abrir datos oficiales', async () => {
    const fakeStore: ActiveStore = {
      kind: 'legacy',
      selection: { state: 'legacy-existing', active: 'legacy', migratable: true, officialFilePresent: false },
    };
    mockOpenActiveStore.mockResolvedValue(fakeStore);

    const view = await render(
      <AthleteDataProvider>
        <Consumer />
      </AthleteDataProvider>
    );

    await waitFor(() => expect(view.getByText('status:ready')).toBeTruthy());
    expect(view.getByText('kind:legacy')).toBeTruthy();
    expect(view.getByText('data:no-data')).toBeTruthy();
    expect(view.getByText('selection:legacy-existing')).toBeTruthy();
    expect(mockClose).not.toHaveBeenCalled();
  });

  test('3. Dispositivo con almacenamiento oficial existente: abre almacén oficial', async () => {
    const fakeStore: ActiveStore = {
      kind: 'official',
      selection: { state: 'official-existing', active: 'official', legacy: 'absent' },
      data: { close: mockClose } as never,
    };
    mockOpenActiveStore.mockResolvedValue(fakeStore);

    const view = await render(
      <AthleteDataProvider>
        <Consumer />
      </AthleteDataProvider>
    );

    await waitFor(() => expect(view.getByText('status:ready')).toBeTruthy());
    expect(view.getByText('kind:official')).toBeTruthy();
    expect(view.getByText('data:has-data')).toBeTruthy();
    expect(view.getByText('selection:official-existing')).toBeTruthy();
  });

  test('4. Migración pendiente: entra en estado blocked sin abrir almacén', async () => {
    const fakeStore: ActiveStore = {
      kind: 'blocked',
      selection: {
        state: 'migration-pending',
        active: null,
        backupDir: 'legacy-backup-123',
        recovery: ['resume-migration', 'rollback-to-legacy', 'start-new-store'],
      },
    };
    mockOpenActiveStore.mockResolvedValue(fakeStore);

    const view = await render(
      <AthleteDataProvider>
        <Consumer />
      </AthleteDataProvider>
    );

    await waitFor(() => expect(view.getByText('status:ready')).toBeTruthy());
    expect(view.getByText('kind:blocked')).toBeTruthy();
    expect(view.getByText('data:no-data')).toBeTruthy();
    expect(view.getByText('selection:migration-pending')).toBeTruthy();
    expect(mockClose).not.toHaveBeenCalled();
  });

  test('5. Clave o identidad ausente: reporta blocked con código identity-missing', async () => {
    const fakeStore: ActiveStore = {
      kind: 'blocked',
      selection: {
        state: 'open-error',
        active: null,
        store: 'official',
        code: 'identity-missing',
        message: 'Hay una base oficial pero falta la identidad del dispositivo.',
        recovery: ['start-new-store'],
        accountLinked: false,
      },
    };
    mockOpenActiveStore.mockResolvedValue(fakeStore);

    const view = await render(
      <AthleteDataProvider>
        <Consumer />
      </AthleteDataProvider>
    );

    await waitFor(() => expect(view.getByText('status:ready')).toBeTruthy());
    expect(view.getByText('kind:blocked')).toBeTruthy();
    expect(view.getByText('data:no-data')).toBeTruthy();
    expect(view.getByText('selection:open-error')).toBeTruthy();
  });

  test('6. Error de apertura inesperado: reporta status error', async () => {
    mockOpenActiveStore.mockRejectedValue(new Error('secure-store-crash'));

    const view = await render(
      <AthleteDataProvider>
        <Consumer />
      </AthleteDataProvider>
    );

    await waitFor(() => expect(view.getByText('status:error')).toBeTruthy());
    expect(view.getByText('error:secure-store-crash')).toBeTruthy();
    expect(view.getByText('data:no-data')).toBeTruthy();
  });

  test('7. Recuperación y reintento: vuelve a llamar a openActiveStore', async () => {
    mockOpenActiveStore.mockRejectedValueOnce(new Error('transient-error'));
    const fakeStore: ActiveStore = {
      kind: 'legacy',
      selection: { state: 'legacy-existing', active: 'legacy', migratable: true, officialFilePresent: false },
    };
    mockOpenActiveStore.mockResolvedValueOnce(fakeStore);

    const view = await render(
      <AthleteDataProvider>
        <Consumer />
      </AthleteDataProvider>
    );

    await waitFor(() => expect(view.getByText('status:error')).toBeTruthy());
    expect(view.getByText('error:transient-error')).toBeTruthy();

    await fireEvent.press(view.getByLabelText('retry-button'));

    await waitFor(() => expect(view.getByText('status:ready')).toBeTruthy());
    expect(view.getByText('kind:legacy')).toBeTruthy();
    expect(mockOpenActiveStore).toHaveBeenCalledTimes(2);
  });

  test('8. Prevención de doble repositorio: dos proveedores comparten la misma apertura y cierran al desmontar', async () => {
    const fakeStore: ActiveStore = {
      kind: 'official',
      selection: { state: 'official-existing', active: 'official', legacy: 'absent' },
      data: { close: mockClose } as never,
    };
    mockOpenActiveStore.mockResolvedValue(fakeStore);

    const view = await render(
      <>
        <AthleteDataProvider>
          <Consumer />
        </AthleteDataProvider>
        <AthleteDataProvider>
          <Consumer />
        </AthleteDataProvider>
      </>
    );

    await waitFor(() => expect(view.getAllByText('status:ready')).toHaveLength(2));
    expect(mockOpenActiveStore).toHaveBeenCalledTimes(1);

    view.unmount();
    await waitFor(() => expect(mockClose).toHaveBeenCalledTimes(1));
  });

  test('9. startNewStore explícito: llama a startNewStore del paquete con confirmación', async () => {
    const blockedStore: ActiveStore = {
      kind: 'blocked',
      selection: {
        state: 'open-error',
        active: null,
        store: 'official',
        code: 'database-key-missing',
        message: 'Existe la base pero no su clave.',
        recovery: ['start-new-store'],
        accountLinked: false,
      },
    };
    const newStore: ActiveStore = {
      kind: 'official',
      selection: { state: 'official-existing', active: 'official', legacy: 'retained-read-only' },
      data: { close: mockClose } as never,
    };

    mockOpenActiveStore.mockResolvedValue(blockedStore);
    mockStartNewStore.mockResolvedValue(newStore);

    const view = await render(
      <AthleteDataProvider>
        <Consumer />
      </AthleteDataProvider>
    );

    await waitFor(() => expect(view.getByText('status:ready')).toBeTruthy());
    expect(view.getByText('kind:blocked')).toBeTruthy();

    await fireEvent.press(view.getByLabelText('new-store-button'));

    await waitFor(() => expect(view.getByText('kind:official')).toBeTruthy());
    expect(mockStartNewStore).toHaveBeenCalledWith(
      expect.objectContaining({
        confirm: 'start-new-store',
      })
    );
  });

  test('10. startNewStore que falla: no rechaza, expone actionError y mantiene la pantalla de recuperación', async () => {
    mockOpenActiveStore.mockResolvedValue(blockedKeyMissing);
    mockStartNewStore.mockRejectedValue(Object.assign(new Error('El marcador cambió durante la operación.'), { code: 'marker-conflict' }));

    const view = await render(<AthleteDataProvider><Consumer /></AthleteDataProvider>);
    await waitFor(() => expect(view.getByText('kind:blocked')).toBeTruthy());

    await fireEvent.press(view.getByLabelText('new-store-button'));

    await waitFor(() => expect(view.getByText('actionError:El marcador cambió durante la operación.')).toBeTruthy());
    expect(view.getByText('kind:blocked')).toBeTruthy();
    expect(view.getByText('status:ready')).toBeTruthy();
    expect(view.getByText('error:no-error')).toBeTruthy();

    await fireEvent.press(view.getByLabelText('retry-button'));
    await waitFor(() => expect(view.getByText('actionError:none')).toBeTruthy());
  });

  test('11. Doble toque en startNewStore: una sola llamada al paquete', async () => {
    mockOpenActiveStore.mockResolvedValue(blockedKeyMissing);
    let resolveStart: (value: ActiveStore) => void = () => undefined;
    mockStartNewStore.mockImplementation(() => new Promise<ActiveStore>((resolve) => { resolveStart = resolve; }));

    const view = await render(<AthleteDataProvider><Consumer /></AthleteDataProvider>);
    await waitFor(() => expect(view.getByText('kind:blocked')).toBeTruthy());

    await fireEvent.press(view.getByLabelText('double-new-store-button'));
    await fireEvent.press(view.getByLabelText('new-store-button'));
    expect(mockStartNewStore).toHaveBeenCalledTimes(1);

    resolveStart({ kind: 'official', selection: { state: 'official-existing', active: 'official', legacy: 'retained-read-only' }, data: { close: mockClose } as never });
    await waitFor(() => expect(view.getByText('kind:official')).toBeTruthy());
    expect(mockStartNewStore).toHaveBeenCalledTimes(1);
  });

  test('12. newId conserva su identidad aunque cambie el contexto (no recrea el repositorio oficial)', async () => {
    mockOpenActiveStore.mockResolvedValue({
      kind: 'official', selection: { state: 'official-existing', active: 'official', legacy: 'absent' }, data: { close: mockClose } as never,
    } as ActiveStore);
    seenNewIds.clear();

    const view = await render(<AthleteDataProvider><Consumer /></AthleteDataProvider>);
    await waitFor(() => expect(view.getByText('kind:official')).toBeTruthy());
    await fireEvent.press(view.getByLabelText('retry-button')); // el contexto pasa por opening → ready
    await waitFor(() => expect(mockOpenActiveStore).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(view.getByText('status:ready')).toBeTruthy());

    expect(seenNewIds.size).toBe(1);
  });
});
