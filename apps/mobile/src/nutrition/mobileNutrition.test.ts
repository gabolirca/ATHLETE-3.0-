import { appError, err, ok } from '@athlete/contracts';
import { createMobileNutrition } from './mobileNutrition';

const meal = { id: 'm1', localDate: '2026-11-06' };
function repo() {
  return {
    logMeal: jest.fn(async (i: { id: string }) => ok({ ...meal, id: i.id })),
    updateMeal: jest.fn(async () => ok(meal)),
    deleteMeal: jest.fn(async () => ok(undefined)),
    listMeals: jest.fn(async () => ok([meal])),
    getDaySummary: jest.fn(async () => ok({ entryCount: 1 })),
  };
}

test('cada escritura exitosa avisa a la sincronización; las lecturas no', async () => {
  const r = repo();
  const notify = jest.fn();
  const n = createMobileNutrition(r as never, () => 'nuevo-id', notify);
  await n.loadDay('2026-11-06');
  await n.getMeal('m1', '2026-11-06');
  expect(notify).not.toHaveBeenCalled();
  expect((await n.logMeal({} as never)).id).toBe('nuevo-id');
  await n.updateMeal('m1', {} as never);
  await n.deleteMeal('m1');
  expect(notify).toHaveBeenCalledTimes(3);
});

test('un error se convierte en mensaje claro y no avisa', async () => {
  const r = repo();
  r.logMeal.mockResolvedValueOnce(err(appError('VALIDATION_FAILED', 'Describe qué comiste.')) as never);
  const notify = jest.fn();
  const n = createMobileNutrition(r as never, () => 'x', notify);
  await expect(n.logMeal({} as never)).rejects.toThrow('Describe qué comiste.');
  expect(notify).not.toHaveBeenCalled();
});
