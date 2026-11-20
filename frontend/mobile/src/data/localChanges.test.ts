import { emitLocalChange, MUTATING_METHODS, onLocalChange, withChangeNotifications } from './localChanges';
import type { TrainingRepository } from './TrainingRepository';

function fakeRepository() {
  const calls: string[] = [];
  const repo = new Proxy({} as Record<string, unknown>, {
    get(target, prop) {
      if (typeof prop !== 'string' || prop === 'then') return undefined;
      return target[prop] ??= jest.fn(async () => { calls.push(prop); return `${prop}-result`; });
    },
  }) as unknown as TrainingRepository;
  return { repo, calls };
}

test('cada escritura exitosa avisa una vez y devuelve el mismo resultado', async () => {
  const { repo } = fakeRepository();
  const notify = jest.fn();
  const wrapped = withChangeNotifications(repo, notify);
  for (const name of MUTATING_METHODS) {
    const fn = wrapped[name] as unknown as () => Promise<unknown>;
    await expect(fn()).resolves.toBe(`${name}-result`);
  }
  expect(notify).toHaveBeenCalledTimes(MUTATING_METHODS.length);
});

test('las lecturas no avisan', async () => {
  const { repo } = fakeRepository();
  const notify = jest.fn();
  const wrapped = withChangeNotifications(repo, notify);
  await wrapped.listHistory();
  await wrapped.getOverview();
  await wrapped.listCardio();
  expect(notify).not.toHaveBeenCalled();
});

test('una escritura que falla no avisa y propaga el error', async () => {
  const notify = jest.fn();
  const repo = { saveSet: jest.fn(async () => { throw new Error('inválido'); }) } as unknown as TrainingRepository;
  const wrapped = withChangeNotifications(repo, notify);
  await expect(wrapped.saveSet('s', 'x', {} as never)).rejects.toThrow('inválido');
  expect(notify).not.toHaveBeenCalled();
});

test('emitLocalChange llega a los oyentes y se puede desuscribir; un oyente roto no afecta a los demás', () => {
  const a = jest.fn(() => { throw new Error('roto'); });
  const b = jest.fn();
  const offA = onLocalChange(a);
  const offB = onLocalChange(b);
  emitLocalChange();
  expect(b).toHaveBeenCalledTimes(1);
  offA(); offB();
  emitLocalChange();
  expect(b).toHaveBeenCalledTimes(1);
});
