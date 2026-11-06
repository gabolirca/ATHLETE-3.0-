import { createChunkedStore } from './chunkedSecureStore';

function memory() {
  const items = new Map<string, string>();
  return {
    items,
    store: {
      getItem: async (k: string) => items.get(k) ?? null,
      setItem: async (k: string, v: string) => { if (new TextEncoder().encode(v).length > 2048) throw new Error('> 2048 bytes'); items.set(k, v); },
      removeItem: async (k: string) => { items.delete(k); },
    },
  };
}

test('guarda y recupera un valor grande repartido en trozos de menos de 2 KB', async () => {
  const m = memory();
  const s = createChunkedStore(m.store);
  const value = JSON.stringify({ access_token: 'x'.repeat(3000), user: { name: 'Gabriel Ñandú ✓'.repeat(50) } });
  await s.setItem('athlete3-auth-development', value);
  expect(await s.getItem('athlete3-auth-development')).toBe(value);
  expect(Number(m.items.get('athlete3-auth-development.n'))).toBeGreaterThan(1);
});

test('sin valor guardado devuelve null', async () => {
  expect(await createChunkedStore(memory().store).getItem('nada')).toBeNull();
});

test('al reescribir un valor más corto se borran los trozos sobrantes', async () => {
  const m = memory();
  const s = createChunkedStore(m.store, 10);
  await s.setItem('k', 'a'.repeat(50));
  await s.setItem('k', 'corto');
  expect(await s.getItem('k')).toBe('corto');
  expect([...m.items.keys()].sort()).toEqual(['k.0', 'k.n']);
});

test('removeItem borra todos los trozos', async () => {
  const m = memory();
  const s = createChunkedStore(m.store, 10);
  await s.setItem('k', 'a'.repeat(35));
  await s.removeItem('k');
  expect(m.items.size).toBe(0);
  expect(await s.getItem('k')).toBeNull();
});

test('un trozo faltante se trata como sin sesión, no como datos corruptos', async () => {
  const m = memory();
  const s = createChunkedStore(m.store, 10);
  await s.setItem('k', 'a'.repeat(35));
  m.items.delete('k.2');
  expect(await s.getItem('k')).toBeNull();
});

test('el valor vacío se guarda y se recupera', async () => {
  const s = createChunkedStore(memory().store);
  await s.setItem('k', '');
  expect(await s.getItem('k')).toBe('');
});
