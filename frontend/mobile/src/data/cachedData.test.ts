import { createDataCache } from './cachedData';

function fakeData() {
  const calls: string[] = [];
  let plans = [{ id: 'p1', name: 'Pierna' }];
  const data = {
    plans: {
      listPlans: jest.fn(async () => { calls.push('listPlans'); return { ok: true, value: plans }; }),
      getPlan: jest.fn(async (id: string) => { calls.push(`getPlan:${id}`); return id === 'x' ? { ok: false, error: { code: 'NOT_FOUND' } } : { ok: true, value: { id } }; }),
      createPlan: jest.fn(async (p: { id: string; name: string }) => { plans = [...plans, p]; return { ok: true, value: p }; }),
    },
    exercises: { getById: jest.fn(async (id: string) => { calls.push(`ex:${id}`); return { ok: true, value: { id } }; }) },
    sessions: { getDetail: jest.fn(async () => ({ ok: true, value: {} })) },
  };
  return { data, calls };
}

test('lecturas repetidas de planes y catálogo no vuelven a la base', async () => {
  const { data, calls } = fakeData();
  const cache = createDataCache(data as never);
  await Promise.all([cache.data.plans.listPlans(), cache.data.plans.listPlans()]);
  await cache.data.exercises.getById('a'); await cache.data.exercises.getById('a'); await cache.data.exercises.getById('b');
  expect(calls).toEqual(['listPlans', 'ex:a', 'ex:b']);
});

test('una escritura en planes vacía su caché: la rutina nueva aparece enseguida', async () => {
  const { data } = fakeData();
  const cache = createDataCache(data as never);
  await cache.data.plans.listPlans();
  await cache.data.plans.createPlan({ id: 'p2', name: 'Torso' } as never);
  const after = await cache.data.plans.listPlans();
  expect(after.ok && after.value.map((p) => p.id)).toEqual(['p1', 'p2']);
});

test('los errores no se guardan, las sesiones nunca, e invalidate() vacía todo (tras sincronizar)', async () => {
  const { data, calls } = fakeData();
  const cache = createDataCache(data as never);
  await cache.data.plans.getPlan('x'); await cache.data.plans.getPlan('x');
  expect(calls.filter((c) => c === 'getPlan:x')).toHaveLength(2);
  await cache.data.sessions.getDetail('s'); await cache.data.sessions.getDetail('s');
  expect(data.sessions.getDetail).toHaveBeenCalledTimes(2);
  await cache.data.plans.listPlans();
  cache.invalidate();
  expect(cache.size()).toBe(0);
  await cache.data.plans.listPlans();
  expect(calls.filter((c) => c === 'listPlans')).toHaveLength(2);
});
