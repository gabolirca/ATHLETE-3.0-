import { PropsWithChildren, useEffect, useMemo, useState } from 'react';
import { EmptyState } from '@/components/EmptyState';
import { Screen } from '@/components/Screen';
import { Title } from '@/components/Typography';
import { CONTRACTS_VERSION } from '@athlete/contracts';
import { useAthleteData } from './AthleteDataProvider';
import { MobileTrainingContext } from './MobileTrainingContext';
import { OfficialTrainingRepository } from './OfficialTrainingRepository';
import type { TrainingRepository } from './TrainingRepository';
import { withChangeNotifications } from './localChanges';

export function OfficialTrainingProvider({ children }: PropsWithChildren) {
  const { status, data, newId, retry } = useAthleteData();
  const [repository, setRepository] = useState<TrainingRepository | null>(null);
  const [profileError, setProfileError] = useState<Error | null>(null);

  useEffect(() => {
    let active = true;
    setRepository(null);
    setProfileError(null);
    if (status !== 'ready' || !data) return () => { active = false; };
    void (async () => {
      const contractsVersion: string = CONTRACTS_VERSION;
      if (contractsVersion !== '0.7.0') {
        throw new Error(`Contratos incompatibles: la app requiere 0.7.0 y el paquete informa ${contractsVersion}.`);
      }
      const profile = await data.profile.get();
      if (!profile.ok && profile.error.code === 'NOT_FOUND') {
        const initialized = await data.profile.initialize(Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC');
        if (!initialized.ok) throw new Error(initialized.error.message);
      } else if (!profile.ok) throw new Error(profile.error.message);
      if (active) setRepository(withChangeNotifications(new OfficialTrainingRepository(data, newId)));
    })().catch((cause: unknown) => {
      if (active) setProfileError(cause instanceof Error ? cause : new Error('No se pudo preparar el perfil local.'));
    });
    return () => { active = false; };
  }, [status, data, newId]);

  const error = status === 'error' || profileError !== null;
  const ready = status === 'ready' && repository !== null && !error;
  const context = useMemo(() => <MobileTrainingContext repository={repository} ready={ready} error={error} retry={retry}>{children}</MobileTrainingContext>, [repository, ready, error, retry, children]);

  if (status === 'opening' || (status === 'ready' && !repository && !profileError)) {
    return <Screen><Title>Preparando datos locales…</Title></Screen>;
  }
  if (error) {
    return <Screen><Title>ATHLETE</Title><EmptyState icon="alert-circle-outline" title="No pudimos abrir tus datos locales" detail={profileError?.message ?? 'Tus datos no se modificaron. Puedes volver a intentar.'} action="Reintentar" onAction={retry}/></Screen>;
  }
  return context;
}
