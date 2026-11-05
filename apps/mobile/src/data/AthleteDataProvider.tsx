import { createContext, PropsWithChildren, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import * as SQLite from 'expo-sqlite';
import {
  createUuidV7Generator,
  openActiveStore,
  startNewStore as officialStartNewStore,
  type ActiveStore,
  type StoreSelection,
  type OpenedAthleteData,
  type OpenActiveStoreOptions,
} from '@athlete/data';
import { expoDatabaseFiles } from './expoDatabaseFiles';

export type AthleteDataState = {
  status: 'opening' | 'ready' | 'error';
  store: ActiveStore | null;
  kind: ActiveStore['kind'] | null;
  data: OpenedAthleteData | null;
  selection: StoreSelection | null;
  error: Error | null;
  /** Error de la última acción de recuperación (p. ej. startNewStore). No cambia `status`: la pantalla actual se mantiene. */
  actionError: Error | null;
  newId: () => string;
  retry: () => void;
  startNewStore: () => Promise<void>;
};

const AthleteDataContext = createContext<AthleteDataState | null>(null);
let sharedOpening: Promise<ActiveStore> | null = null;
let sharedStore: ActiveStore | null = null;
let providerLeases = 0;
const ids = createUuidV7Generator((byteCount) => Crypto.getRandomBytes(byteCount));
// Identidad estable: OfficialTrainingProvider recrea el repositorio (y pierde los borradores de series) si cambia.
const newId = () => ids.newId();

function getBaseOptions(): OpenActiveStoreOptions {
  return {
    openDatabase: (name) => SQLite.openDatabaseAsync(name),
    secureStore: {
      getItem: (key) => SecureStore.getItemAsync(key),
      setItem: (key, value) => SecureStore.setItemAsync(key, value),
      removeItem: (key) => SecureStore.deleteItemAsync(key),
    },
    randomBytes: (byteCount) => Crypto.getRandomBytes(byteCount),
    files: expoDatabaseFiles,
    newInstallations: 'official',
  };
}

function acquireActiveStore(): Promise<ActiveStore> {
  providerLeases += 1;
  if (sharedStore) return Promise.resolve(sharedStore);
  sharedOpening ??= openActiveStore(getBaseOptions()).then((result) => {
    if (providerLeases === 0) {
      if (result.kind === 'official') void result.data.close();
    } else {
      sharedStore = result;
    }
    return result;
  }).finally(() => { sharedOpening = null; });
  return sharedOpening;
}

function releaseActiveStore() {
  providerLeases = Math.max(0, providerLeases - 1);
  if (providerLeases === 0 && sharedStore) {
    const closing = sharedStore;
    sharedStore = null;
    if (closing.kind === 'official') void closing.data.close();
  }
}

export function _resetSharedStoreForTesting() {
  sharedOpening = null;
  sharedStore = null;
  providerLeases = 0;
}

/**
 * Sole app bootstrap for the official local-first data services.
 * Uses openActiveStore to inspect and select between official and legacy storage without dual writes.
 */
export function AthleteDataProvider({ children }: PropsWithChildren) {
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState<AthleteDataState['status']>('opening');
  const [store, setStore] = useState<ActiveStore | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [actionError, setActionError] = useState<Error | null>(null);
  const startingNewStore = useRef<Promise<void> | null>(null);

  useEffect(() => {
    let mounted = true;
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      releaseActiveStore();
    };
    setStatus('opening');
    setStore(null);
    setError(null);

    void acquireActiveStore().then((result) => {
      if (mounted) {
        setStore(result);
        setStatus('ready');
      }
    }).catch((cause: unknown) => {
      if (!mounted) return;
      setError(cause instanceof Error ? cause : new Error('No se pudo abrir el almacenamiento local.'));
      setStatus('error');
    }).finally(() => {
      if (!mounted) release();
    });

    return () => {
      mounted = false;
      release();
    };
  }, [attempt]);

  const retry = useCallback(() => {
    setActionError(null);
    if (sharedStore?.kind === 'official') {
      void sharedStore.data.close();
    }
    sharedStore = null;
    setAttempt((value) => value + 1);
  }, []);

  // Una sola ejecución a la vez: un doble toque no debe crear dos almacenes ni dos transiciones del marcador.
  // Nunca rechaza: un ActiveStoreError (precondición incumplida) se expone en `actionError` y la pantalla de
  // recuperación sigue montada, sin cambiar de almacén.
  const handleStartNewStore = useCallback((): Promise<void> => {
    if (startingNewStore.current) return startingNewStore.current;
    setActionError(null);
    const run = (async () => {
      try {
        const result = await officialStartNewStore({ ...getBaseOptions(), confirm: 'start-new-store' });
        if (sharedStore?.kind === 'official') {
          void sharedStore.data.close();
        }
        sharedStore = result;
        setStore(result);
        setStatus('ready');
      } catch (cause: unknown) {
        setActionError(cause instanceof Error ? cause : new Error('No se pudo iniciar un almacén nuevo.'));
      } finally {
        startingNewStore.current = null;
      }
    })();
    startingNewStore.current = run;
    return run;
  }, []);

  const data = store?.kind === 'official' ? store.data : null;
  const selection = store ? store.selection : null;
  const kind = store ? store.kind : null;

  const value = useMemo(
    () => ({
      status,
      store,
      kind,
      data,
      selection,
      error,
      actionError,
      newId,
      retry,
      startNewStore: handleStartNewStore,
    }),
    [status, store, kind, data, selection, error, actionError, retry, handleStartNewStore]
  );

  return <AthleteDataContext.Provider value={value}>{children}</AthleteDataContext.Provider>;
}

export function useAthleteData(): AthleteDataState {
  const value = useContext(AthleteDataContext);
  if (!value) throw new Error('useAthleteData debe usarse dentro de AthleteDataProvider.');
  return value;
}
