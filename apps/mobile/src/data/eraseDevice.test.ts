import { ACTIVE_STORE_KEY, IDENTITY_KEY, databaseKeyName } from '@athlete/data';
import { eraseDevice } from './eraseDevice';

test('borra sesión, bases de ATHLETE, sus llaves y la identidad; ignora archivos ajenos', async () => {
  const calls: string[] = [];
  const deletedFiles: string[] = []; const deletedKeys: string[] = [];
  const r = await eraseDevice({
    signOut: async () => { calls.push('signOut'); },
    closeData: async () => { calls.push('close'); },
    listFiles: async () => ['athlete3-abc.db', 'athlete3-abc.db-wal', 'otra.db'],
    deleteFile: async (n) => { deletedFiles.push(n); },
    deleteKey: async (k) => { deletedKeys.push(k); },
  });
  expect(calls).toEqual(['signOut', 'close']);
  expect(deletedFiles).toEqual(['athlete3-abc.db', 'athlete3-abc.db-wal']);
  expect(deletedKeys).toEqual(expect.arrayContaining([IDENTITY_KEY, ACTIVE_STORE_KEY, 'athlete3.onboarding.v1', databaseKeyName('athlete3-abc.db')]));
  expect(deletedKeys).not.toContain(databaseKeyName('otra.db'));
  expect(r).toEqual({ files: 2, failed: [] });
});

test('si un paso falla sigue con los demás y lo reporta', async () => {
  const deletedKeys: string[] = [];
  const r = await eraseDevice({
    signOut: async () => { throw new Error('sin red'); },
    closeData: async () => undefined,
    listFiles: async () => ['athlete3.db'],
    deleteFile: async () => { throw new Error('ocupado'); },
    deleteKey: async (k) => { deletedKeys.push(k); },
  });
  expect(r.failed).toEqual(['sesión', 'athlete3.db']);
  expect(deletedKeys).toContain(IDENTITY_KEY);
});
