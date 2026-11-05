import { PropsWithChildren, useEffect, useMemo, useState } from 'react';
import { useSQLiteContext } from 'expo-sqlite';
import { getLocalOwnerKey } from './database';
import { SQLiteTrainingRepository } from './SQLiteTrainingRepository';
import type { TrainingRepository } from './TrainingRepository';
import { MobileTrainingContext } from './MobileTrainingContext';

export function LocalTrainingProvider({ children }: PropsWithChildren) {
  const db = useSQLiteContext();
  const [ownerKey, setOwnerKey] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let mounted = true;
    getLocalOwnerKey(db).then((key) => { if (mounted) setOwnerKey(key); }).catch(() => { if (mounted) setError(true); });
    return () => { mounted = false; };
  }, [db]);

  const repository = useMemo(() => ownerKey ? new SQLiteTrainingRepository(db, ownerKey) : null, [db, ownerKey]);
  const ready = repository !== null && !error;
  return <MobileTrainingContext repository={repository} ready={ready} error={error}>{children}</MobileTrainingContext>;
}
