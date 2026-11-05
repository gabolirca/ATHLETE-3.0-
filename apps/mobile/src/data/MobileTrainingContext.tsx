import { createContext, PropsWithChildren, useContext } from 'react';
import type { TrainingRepository } from './TrainingRepository';

const TrainingRepositoryContext = createContext<TrainingRepository | null>(null);
const LocalDataReadyContext = createContext<{ ready: boolean; error: boolean; retry?: () => void }>({ ready: false, error: false });

export function MobileTrainingContext({ repository, ready, error = false, retry, children }: PropsWithChildren<{
  repository: TrainingRepository | null;
  ready: boolean;
  error?: boolean;
  retry?: () => void;
}>) {
  return <LocalDataReadyContext.Provider value={{ ready, error, retry }}>
    <TrainingRepositoryContext.Provider value={repository}>{children}</TrainingRepositoryContext.Provider>
  </LocalDataReadyContext.Provider>;
}

export function useTrainingRepository(): TrainingRepository | null { return useContext(TrainingRepositoryContext); }
export function useLocalDataReady() { return useContext(LocalDataReadyContext); }
