import { createContext, PropsWithChildren, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import type { AuthState, SyncStatus } from '@athlete/contracts';
import { useAthleteData } from '@/data/AthleteDataProvider';
import { cloudUnavailableReason, getCloud } from './cloud';
import { linkAccountIfNeeded } from './linkAccount';
import { onLocalChange } from '@/data/localChanges';
import { DEFAULT_SCHEDULER_OPTIONS, SyncScheduler, type SyncOutcome, type SyncSchedulerOptions } from './syncScheduler';

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

/** `syncOptions` solo se cambia en pruebas (tiempos cortos); la app usa los tiempos por defecto. */
export function AccountProvider({ children, syncOptions = DEFAULT_SCHEDULER_OPTIONS }: PropsWithChildren<{ syncOptions?: SyncSchedulerOptions }>) {
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
  const linkingFor = useRef<string | null>(null);

  const refreshStatus = useCallback(async () => {
    const current = dataRef.current;
    if (current) setStatus(await current.sync.status().catch(() => null));
  }, []);

  const runSync = useCallback(async (): Promise<SyncOutcome> => {
    const current = dataRef.current;
    if (!current || syncingRef.current || linkRef.current !== 'linked' || authRef.current?.status !== 'signed_in') return 'skipped';
    syncingRef.current = true;
    setSyncing(true);
    try {
      const result = await current.sync.syncNow();
      if (result.ok) { setStatus(result.value); setSyncError(null); return 'ok'; }
      const offline = result.error.code === 'NETWORK_UNAVAILABLE';
      setSyncError(offline ? 'Sin conexión: tus datos están guardados en el teléfono y se subirán solos cuando vuelva la red.' : result.error.message);
      void refreshStatus();
      return offline ? 'offline' : 'error';
    } catch (cause) {
      setSyncError(cause instanceof Error ? cause.message : 'No se pudo sincronizar.');
      return 'error';
    } finally {
      syncingRef.current = false;
      setSyncing(false);
    }
  }, [refreshStatus]);

  const syncNow = useCallback(async () => { await runSync(); }, [runSync]);

  // Sincronización automática: tras cada cambio local, al abrir/cerrar la app y con reintentos sin conexión.
  const schedulerRef = useRef<SyncScheduler | null>(null);
  if (schedulerRef.current === null) {
    schedulerRef.current = new SyncScheduler({
      sync: () => runSync(),
      hasPending: async () => {
        const current = dataRef.current;
        if (!current) return false;
        const s = await current.sync.status();
        return s.pendingCount > 0;
      },
    }, syncOptions);
  }
  const scheduler = schedulerRef.current;
  useEffect(() => () => scheduler.dispose(), [scheduler]);
  useEffect(() => onLocalChange(() => { void refreshStatus(); scheduler.notifyChange(); }), [scheduler, refreshStatus]);
  useEffect(() => {
    scheduler.setEnabled(cloud !== null && link === 'linked' && auth?.status === 'signed_in');
  }, [scheduler, cloud, link, auth]);

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
      if (state === 'active') { void cloud.supabase.auth.startAutoRefresh(); scheduler.onForeground(); }
      else {
        if (state === 'background') scheduler.onBackground();
        void cloud.supabase.auth.stopAutoRefresh();
      }
    });
    return () => subscription.remove();
  }, [cloud, scheduler]);

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
        linkRef.current = 'linked';
        setLink('linked'); // activa la sincronización automática (primera subida inmediata)
      } catch (cause) {
        linkingFor.current = null;
        setSyncError(cause instanceof Error ? cause.message : 'No se pudieron vincular tus datos a la cuenta.');
      }
    })();
  }, [auth, data, replaceData]);

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
