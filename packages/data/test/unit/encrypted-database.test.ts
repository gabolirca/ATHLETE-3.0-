import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { LocalDatabaseError, databaseKeyName, openEncryptedDatabase } from '../../src/secure/encrypted-database';
import { MemorySecureStore, cipherDisk, cipherOpener, randomBytesSync, tempDir } from '../support';

const NAME = 'athlete3-0190c0de-0000-7000-8000-000000000001.db';
const KEY = databaseKeyName(NAME);
let tmp: ReturnType<typeof tempDir>;
let secure: MemorySecureStore;

beforeEach(() => { tmp = tempDir(); secure = new MemorySecureStore(); });
afterEach(() => tmp.cleanup());

const path = () => join(tmp.dir, NAME);
async function open(opener = cipherOpener(tmp.dir), extra: Partial<Parameters<typeof openEncryptedDatabase>[0]> = {}) {
  return openEncryptedDatabase({ name: NAME, open: opener.open, secureStore: secure, randomBytes: randomBytesSync, ...extra });
}
async function expectCode(p: Promise<unknown>, code: string, recoverable: boolean) {
  const e = await p.then(() => null, (x: unknown) => x);
  expect(e).toBeInstanceOf(LocalDatabaseError);
  expect(e).toMatchObject({ code, recoverable });
}

describe('openEncryptedDatabase', () => {
  it('primera instalación: guarda una clave nueva antes de escribir y cifra la base con ella', async () => {
    const db = await open();
    const key = secure.items.get(KEY);
    expect(key).toMatch(/^[0-9a-f]{64}$/);
    expect(cipherDisk.get(path())).toBe(key);
    await db.exec('CREATE TABLE t (x INTEGER); INSERT INTO t VALUES (1);');
    await db.close();
  });

  it('clave existente: reabre sin generar ni reemplazar la clave y lee los datos', async () => {
    const first = await open();
    await first.exec('CREATE TABLE t (x INTEGER); INSERT INTO t VALUES (7);');
    await first.close();
    const key = secure.items.get(KEY);
    secure.writes = [];
    const again = await open();
    expect(secure.writes).toEqual([]);
    expect(secure.items.get(KEY)).toBe(key);
    expect(await again.all('SELECT x FROM t')).toEqual([{ x: 7 }]);
    await again.close();
  });

  it('almacén seguro inaccesible (p. ej. entitlement ausente): error recuperable, sin abrir ni crear nada', async () => {
    secure.failReads = new Error('A required entitlement is not present.');
    const opener = cipherOpener(tmp.dir);
    await expectCode(open(opener), 'secure-store-unavailable', true);
    expect(opener.opened).toHaveLength(0);
  });

  it('base cifrada cuya clave falta: no genera otra, no escribe y cierra la conexión', async () => {
    cipherDisk.set(path(), 'a'.repeat(64));
    const opener = cipherOpener(tmp.dir);
    await expectCode(open(opener), 'database-key-missing', false);
    expect(secure.items.size).toBe(0);
    expect(cipherDisk.get(path())).toBe('a'.repeat(64));
    expect(opener.opened[0]?.closed).toBe(true);
    expect(opener.opened[0]?.statements.some((s) => /journal_mode|CREATE|INSERT/i.test(s))).toBe(false);
  });

  it('clave guardada que no abre la base: database-unreadable, clave intacta', async () => {
    cipherDisk.set(path(), 'a'.repeat(64));
    secure.items.set(KEY, 'b'.repeat(64));
    await expectCode(open(), 'database-unreadable', false);
    expect(secure.items.get(KEY)).toBe('b'.repeat(64));
    expect(cipherDisk.get(path())).toBe('a'.repeat(64));
  });

  it('clave con formato inválido: se informa y no se reemplaza', async () => {
    secure.items.set(KEY, 'no-es-una-clave');
    await expectCode(open(), 'secret-invalid', false);
    expect(secure.items.get(KEY)).toBe('no-es-una-clave');
  });

  it('sin SQLCipher en la compilación: no abre la base en claro', async () => {
    await expectCode(open(cipherOpener(tmp.dir, { cipherAvailable: false })), 'sqlcipher-unavailable', false);
    expect(secure.items.size).toBe(0);
  });

  it('una clave escrita por otro proceso durante la creación no se sobrescribe', async () => {
    let reads = 0;
    const racing = new MemorySecureStore();
    racing.getItem = async (k) => (++reads === 2 ? 'c'.repeat(64) : (racing.items.get(k) ?? null));
    await expectCode(openEncryptedDatabase({ name: NAME, open: cipherOpener(tmp.dir).open, secureStore: racing, randomBytes: randomBytesSync }), 'secret-conflict', true);
    expect(racing.writes).toEqual([]);
  });

  it('solo lectura (copia heredada): sin clave no crea ninguna; con clave no ejecuta escrituras', async () => {
    const opener = cipherOpener(tmp.dir);
    await expectCode(open(opener, { readOnly: true, keyName: 'legacy.key' }), 'database-key-missing', false);
    expect(opener.opened).toHaveLength(0);

    const seed = await open();
    await seed.exec('CREATE TABLE t (x INTEGER)');
    await seed.close();
    secure.items.set('legacy.key', secure.items.get(KEY)!);
    const reader = cipherOpener(tmp.dir);
    const db = await open(reader, { readOnly: true, keyName: 'legacy.key' });
    expect(await db.all('SELECT count(*) AS n FROM t')).toEqual([{ n: 0 }]);
    expect(reader.opened[0]?.statements.filter((s) => !/^\s*(PRAGMA key|PRAGMA cipher_version|SELECT)/i.test(s))).toEqual([]);
    await db.close();
  });
});
