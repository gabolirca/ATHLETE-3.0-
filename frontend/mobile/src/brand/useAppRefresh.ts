import { useCallback } from 'react';
import { useOptionalAccount } from '@/account/AccountProvider';
import { usePullRefresh } from './BrandRefresh';

/** Deslizar para actualizar en cualquier pantalla: sube/baja cambios y recarga la pantalla. */
export function useAppRefresh(reload?: () => Promise<unknown> | void) {
  const account = useOptionalAccount();
  const run = useCallback(async () => {
    await Promise.allSettled([account?.syncNow()]);
    await reload?.();
  }, [account, reload]);
  return usePullRefresh(run);
}
