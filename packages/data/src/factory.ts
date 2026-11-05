import type { Clock, IdGenerator, SyncTransport } from '@athlete/contracts';
import { LocalStore } from './local/store';
import type { Logger } from './logging';
import { LocalBodyRepository, LocalCardioRepository } from './repositories/cardio-body';
import { LocalExerciseRepository, LocalProfileRepository, LocalTrainingPlanRepository } from './repositories/catalog-profile-plans';
import { LocalWorkoutSessionRepository } from './repositories/workout-sessions';
import type { SqlDatabase } from './sql/types';
import { SyncEngine, type SyncEngineOptions } from './sync/engine';
import { systemClock } from './ids';

export type AthleteData = Awaited<ReturnType<typeof createAthleteData>>;

/**
 * Punto de entrada para la app: abre (y migra) la base local del usuario y construye
 * los repositorios y el motor de sync. La UI solo usa lo que devuelve esta función.
 */
export async function createAthleteData(options: {
  db: SqlDatabase;
  userId: string;
  ids: IdGenerator;
  transport: SyncTransport;
  clock?: Clock;
  logger?: Logger;
  sync?: SyncEngineOptions;
}) {
  const store = await LocalStore.open(options.db, { userId: options.userId, ids: options.ids, clock: options.clock ?? systemClock });
  return buildAthleteData(store, options);
}

/** Construye los servicios sobre un almacén ya abierto (lo usa también `openAthleteData`). */
export function buildAthleteData(
  store: LocalStore,
  options: { db: SqlDatabase; transport: SyncTransport; logger?: Logger; sync?: SyncEngineOptions },
) {
  const sync = new SyncEngine(store, options.transport, { ...options.sync, ...(options.logger ? { logger: options.logger } : {}) });
  return {
    deviceId: store.deviceId,
    profile: new LocalProfileRepository(store),
    exercises: new LocalExerciseRepository(store),
    plans: new LocalTrainingPlanRepository(store),
    sessions: new LocalWorkoutSessionRepository(store),
    cardio: new LocalCardioRepository(store),
    body: new LocalBodyRepository(store),
    sync,
    close: () => options.db.close(),
  };
}
