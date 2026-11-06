import { createContext, PropsWithChildren, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import type { AuthState, SyncStatus } from '@athlete/contracts';
import { useAthleteData } from '@/data/AthleteDataProvider';
import { cloudUnavailableReason, getCloud } from './cloud';
import { linkAccountIfNeeded } from './linkAccount';

export type AccountLink = 'none' | 'linked' | 'other-account';

export type AccountContextValue = {
  /** La compilación tiene nube configurada (`.env`). */
  available: boolean;
  unavailableReason: string | null;
  auth: AuthState | null;
  link: AccountLink;
  sync: { status: SyncStatus | null; syncing: boolean; error: string | null };
  /** Devuelven un mensaje de error para mostrar, o null si salió bien. */
  requestCode: (email: string) => Promise<string | null>;
  verifyCode: (email: string, code: string) => Promise<string | null>;
  signOut: () => Promise<void>;
  syncNow: () => Promise<void>;
};

const AccountContext = createContext<AccountContextValue | null>(null);
const AUTO_SYNC_MIN_INTERVAL_MS = 30_000;

export function AccountProvider({ children }: PropsWithChildren) {
  const cloud = getCloud();
  const { data, replaceData } = useAthleteData();
  const [auth, setAuth] = useState<AuthState | null>(null);
  const [link, setLink] = useState<AccountLink>('none');
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const dataRef = useRef(data);
  dataRef.current = data;
  const linkRef = useRef(link);
  linkRef.current = link;
  const authRef = useRef(auth);
  authRef.current = auth;
  const syncingRef = useRef(false);
  const lastAutoSync = useRef(0);
  const linkingFor = useRef<string | null>(null);

  const refreshStatus = useCallback(async () => {
    const current = dataRef.current;
    if (current) setStatus(await current.sync.status().catch(() => null));
  }, []);

  const syncNow = useCallback(async () => {
    const current = dataRef.current;
    if (!current || syncingRef.current || linkRef.current !== 'linked' || authRef.current?.status !== 'signed_in') return;
    syncingRef.current = true;
    setSyncing(true);
    try {
      const result = await current.sync.syncNow();
      if (result.ok) { setStatus(result.value); setSyncError(null); }
      else setSyncError(result.error.code === 'NETWORK_UNAVAILABLE' ? 'Sin conexión: se sincronizará cuando vuelva la red.' : result.error.message);
    } catch (cause) {
      setSyncError(cause instanceof Error ? cause.message : 'No se pudo sincronizar.');
    } finally {
      syncingRef.current = false;
      setSyncing(false);
    }
  }, []);

  const autoSync = useCallback(() => {
    if (Date.now() - lastAutoSync.current < AUTO_SYNC_MIN_INTERVAL_MS) return;
    lastAutoSync.current = Date.now();
    void syncNow();
  }, [syncNow]);

  // Estado de la sesión.
  useEffect(() => {
    if (!cloud) return;
    let active = true;
    void cloud.auth.getState().then((state) => { if (active) setAuth(state); });
    const unsubscribe = cloud.auth.onStateChange((state) => setAuth(state));
    return () => { active = false; unsubscribe(); };
  }, [cloud]);

  // Renovación de tokens y sincronización al volver a primer plano (recomendado por Supabase en React Native).
  useEffect(() => {
    if (!cloud) return;
    if (AppState.currentState === 'active') void cloud.supabase.auth.startAutoRefresh();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') { void cloud.supabase.auth.startAutoRefresh(); autoSync(); }
      else void cloud.supabase.auth.stopAutoRefresh();
    });
    return () => subscription.remove();
  }, [cloud, autoSync]);

  useEffect(() => { void refreshStatus(); }, [data, refreshStatus]);

  // Vinculación de los datos locales a la cuenta tras iniciar sesión.
  useEffect(() => {
    if (!data || auth?.status !== 'signed_in') { if (auth && auth.status !== 'signed_in') setLink('none'); return; }
    const userId = auth.user.id;
    if (linkingFor.current === userId) return;
    linkingFor.current = userId;
    void (async () => {
      try {
        const outcome = await linkAccountIfNeeded(data, userId);
        if (outcome.kind === 'other-account') { setLink('other-account'); return; }
        if (outcome.kind === 'linked') { dataRef.current = outcome.data; replaceData(outcome.data); }
        setLink('linked');
        linkRef.current = 'linked';
        lastAutoSync.current = Date.now();
        await syncNow();
      } catch (cause) {
        linkingFor.current = null;
        setSyncError(cause instanceof Error ? cause.message : 'No se pudieron vincular tus datos a la cuenta.');
      }
    })();
  }, [auth, data, replaceData, syncNow]);

  const requestCode = useCallback(async (email: string) => {
    if (!cloud) return 'La nube no está configurada en esta compilación.';
    const r = await cloud.auth.requestEmailCode({ email });
    return r.ok ? null : r.error.message;
  }, [cloud]);

  const verifyCode = useCallback(async (email: string, code: string) => {
    if (!cloud) return 'La nube no está configurada en esta compilación.';
    const r = await cloud.auth.verifyEmailCode({ email, code });
    if (!r.ok) return r.error.message;
    setAuth(r.value);
    return null;
  }, [cloud]);

  const signOut = useCallback(async () => {
    if (!cloud) return;
    await cloud.auth.signOut();
    linkingFor.current = null;
    setLink('none');
    setAuth({ status: 'signed_out', reason: 'signed_out' });
  }, [cloud]);

  const value = useMemo<AccountContextValue>(() => ({
    available: cloud !== null,
    unavailableReason: cloud ? null : cloudUnavailableReason(),
    auth, link,
    sync: { status, syncing, error: syncError },
    requestCode, verifyCode, signOut, syncNow,
  }), [cloud, auth, link, status, syncing, syncError, requestCode, verifyCode, signOut, syncNow]);

  return <AccountContext.Provider value={value}>{children}</AccountContext.Provider>;
}

export function useAccount(): AccountContextValue {
  const value = useContext(AccountContext);
  if (!value) throw new Error('useAccount debe usarse dentro de AccountProvider.');
  return value;
}
