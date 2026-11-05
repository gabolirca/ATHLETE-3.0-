import { createContext, PropsWithChildren, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import * as SQLite from 'expo-sqlite';
import { createUuidV7Generator, openAthleteData, type OpenedAthleteData } from '@athlete/data';

export type AthleteDataState = {
  status: 'opening' | 'ready' | 'error';
  data: OpenedAthleteData | null;
  error: Error | null;
  newId: () => string;
  retry: () => void;
};

const AthleteDataContext = createContext<AthleteDataState | null>(null);
let sharedOpening: Promise<OpenedAthleteData> | null = null;
let sharedData: OpenedAthleteData | null = null;
let providerLeases = 0;
const ids = createUuidV7Generator((byteCount) => Crypto.getRandomBytes(byteCount));

function acquireAthleteData(): Promise<OpenedAthleteData> {
  providerLeases += 1;
  if (sharedData) return Promise.resolve(sharedData);
  sharedOpening ??= openAthleteData({
    openDatabase: (name) => SQLite.openDatabaseAsync(name),
    secureStore: {
      getItem: (key) => SecureStore.getItemAsync(key),
      setItem: (key, value) => SecureStore.setItemAsync(key, value),
      removeItem: (key) => SecureStore.deleteItemAsync(key),
    },
    randomBytes: (byteCount) => Crypto.getRandomBytes(byteCount),
  }).then((result) => {
    if (providerLeases === 0) void result.close();
    else sharedData = result;
    return result;
  }).finally(() => { sharedOpening = null; });
  return sharedOpening;
}

function releaseAthleteData() {
  providerLeases = Math.max(0, providerLeases - 1);
  if (providerLeases === 0 && sharedData) {
    const closing = sharedData;
    sharedData = null;
    void closing.close();
  }
}

/**
 * Sole app bootstrap for the official local-first data services.
 * SecureStore and SQLite are injected; key lifecycle, device identity, schema, catalog and outbox belong to @athlete/data.
 */
export function AthleteDataProvider({ children }: PropsWithChildren) {
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState<AthleteDataState['status']>('opening');
  const [data, setData] = useState<OpenedAthleteData | null>(null);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let mounted = true;
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      releaseAthleteData();
    };
    setStatus('opening');
    setData(null);
    setError(null);

    void acquireAthleteData().then((result) => {
      if (mounted) {
        setData(result);
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

  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  const value = useMemo(() => ({ status, data, error, newId: () => ids.newId(), retry }), [status, data, error, retry]);
  return <AthleteDataContext.Provider value={value}>{children}</AthleteDataContext.Provider>;
}

export function useAthleteData(): AthleteDataState {
  const value = useContext(AthleteDataContext);
  if (!value) throw new Error('useAthleteData debe usarse dentro de AthleteDataProvider.');
  return value;
}
