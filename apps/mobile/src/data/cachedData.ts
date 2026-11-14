import type { OpenedAthleteData } from '@athlete/data';

type AnyResult = { ok: boolean };
type Fn = (...args: unknown[]) => Promise<AnyResult>;

/**
 * Caché en memoria de lo que casi no cambia: el catálogo (ejercicios, músculos, equipo) y los planes/rutinas.
 * Antes cada pantalla volvía a leer la base: abrir Entrenar consultaba cada plan y cada ejercicio uno por uno (N+1)
 * y cada serie guardada volvía a leer catálogo y planes completos.
 *
 * Reglas para que nunca muestre datos viejos:
 * - Solo se guardan resultados correctos (`ok`); un error se vuelve a intentar la siguiente vez.
 * - Cualquier escritura en planes vacía la caché de planes; en ejercicios, la de catálogo. Se vacía ANTES y DESPUÉS
 *   de escribir, para que una lectura en paralelo no deje un valor viejo guardado.
 * - Lo que llega de fuera (sincronización: rutinas del coach, catálogo nuevo) llama a `invalidate()`.
 * - Las sesiones no se guardan en caché: cambian con cada serie.
 */
export function createDataCache(data: OpenedAthleteData, reads: { exercises: string[]; plans: string[] } = DEFAULT_READS) {
  const stores = { exercises: new Map<string, Promise<AnyResult>>(), plans: new Map<string, Promise<AnyResult>>() };
  let generation = { exercises: 0, plans: 0 };

  function wrap(name: 'exercises' | 'plans') {
    const target = data[name] as unknown as Record<string, unknown>;
    const cached = new Set(reads[name]);
    const store = stores[name];
    return new Proxy(target, {
      get(obj, prop, receiver) {
        const value = Reflect.get(obj, prop, receiver);
        if (typeof prop !== 'string' || typeof value !== 'function') return value;
        const fn = (value as Fn).bind(obj);
        if (cached.has(prop)) {
          return (...args: unknown[]) => {
            const key = `${prop}:${JSON.stringify(args)}`;
            const hit = store.get(key);
            if (hit) return hit;
            const gen = generation[name];
            const promise = fn(...args).then((r) => {
              if (!r.ok || generation[name] !== gen) store.delete(key);
              return r;
            }, (e: unknown) => { store.delete(key); throw e; });
            if (store.size >= MAX_ENTRIES) store.clear(); // búsquedas escritas letra por letra: que no crezca sin límite
            store.set(key, promise);
            return promise;
          };
        }
        return async (...args: unknown[]) => {
          clear(name);
          try { return await fn(...args); } finally { clear(name); }
        };
      },
    });
  }

  function clear(name: 'exercises' | 'plans') {
    stores[name].clear();
    generation = { ...generation, [name]: generation[name] + 1 };
  }

  const exercises = wrap('exercises');
  const plans = wrap('plans');
  const cachedData = new Proxy(data, {
    get(obj, prop, receiver) {
      if (prop === 'exercises') return exercises;
      if (prop === 'plans') return plans;
      return Reflect.get(obj, prop, receiver);
    },
  });
  return {
    data: cachedData as OpenedAthleteData,
    /** Vacía todo (tras sincronizar o cuando algo cambió fuera de este repositorio). */
    invalidate() { clear('exercises'); clear('plans'); },
    /** Para pruebas y diagnóstico. */
    size() { return stores.exercises.size + stores.plans.size; },
  };
}

const MAX_ENTRIES = 300;

const DEFAULT_READS = {
  exercises: ['list', 'getById', 'listMuscleGroups', 'listEquipment'],
  plans: ['listPlans', 'getPlan'],
};
