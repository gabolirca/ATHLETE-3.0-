import type { TrainingRepository } from './TrainingRepository';

/**
 * Aviso de "hubo un cambio local" para la sincronización automática.
 * El entrenamiento no conoce a la cuenta: solo avisa; quien escucha decide si sincroniza.
 */
type Listener = () => void;
const listeners = new Set<Listener>();

export function onLocalChange(listener: Listener): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function emitLocalChange() {
  for (const listener of [...listeners]) {
    try { listener(); } catch { /* un oyente roto no debe romper el guardado */ }
  }
}

/** Métodos que escriben en la base local (y por tanto dejan algo pendiente de subir). */
export const MUTATING_METHODS = [
  'createRoutine', 'tombstoneRoutine', 'startWorkout', 'addExercise', 'addSet', 'saveSet',
  'finishWorkout', 'tombstoneWorkout', 'addBodyMeasurement', 'tombstoneBodyMeasurement',
  'savePreferences', 'logCardio', 'tombstoneCardio',
] as const satisfies readonly (keyof TrainingRepository)[];

/** Devuelve el mismo repositorio, pero cada escritura exitosa avisa del cambio. */
export function withChangeNotifications<T extends TrainingRepository>(repository: T, notify: Listener = emitLocalChange): TrainingRepository {
  const wrapped: Partial<TrainingRepository> = {};
  for (const name of MUTATING_METHODS) {
    const original = repository[name] as (...args: unknown[]) => Promise<unknown>;
    (wrapped as Record<string, unknown>)[name] = async (...args: unknown[]) => {
      const result = await original.apply(repository, args);
      notify();
      return result;
    };
  }
  return new Proxy(repository, {
    get(target, prop, receiver) {
      if (typeof prop === 'string' && prop in wrapped) return (wrapped as Record<string, unknown>)[prop];
      const value = Reflect.get(target, prop, receiver);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}
