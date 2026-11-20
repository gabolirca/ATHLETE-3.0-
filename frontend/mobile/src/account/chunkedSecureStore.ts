import type { SecureKeyValueStorage } from '@athlete/contracts';

/**
 * Guarda valores grandes (la sesión de Supabase puede superar el límite de ~2 KB de SecureStore) repartidos en
 * varias entradas del llavero: `<clave>.n` = número de trozos y `<clave>.0`, `<clave>.1`… con el contenido.
 * Todo queda en el almacenamiento seguro del sistema; no se usa cifrado propio ni almacenamiento normal.
 *
 * 600 caracteres por trozo garantizan < 2048 bytes en UTF-8 aunque haya caracteres no ASCII.
 */
export const CHUNK_SIZE = 600;
const MAX_CHUNKS = 64;

export function createChunkedStore(base: SecureKeyValueStorage, chunkSize = CHUNK_SIZE): SecureKeyValueStorage {
  const countKey = (key: string) => `${key}.n`;
  const partKey = (key: string, index: number) => `${key}.${index}`;
  const readCount = async (key: string): Promise<number> => {
    const raw = await base.getItem(countKey(key));
    const n = raw === null ? 0 : Number(raw);
    return Number.isInteger(n) && n >= 0 && n <= MAX_CHUNKS ? n : 0;
  };

  return {
    async getItem(key) {
      if ((await base.getItem(countKey(key))) === null) return null;
      const count = await readCount(key);
      const parts: string[] = [];
      for (let i = 0; i < count; i++) {
        const part = await base.getItem(partKey(key, i));
        if (part === null) return null; // incompleto: se trata como sin sesión (se vuelve a iniciar)
        parts.push(part);
      }
      return parts.join('');
    },
    async setItem(key, value) {
      const parts: string[] = [];
      for (let i = 0; i < value.length; i += chunkSize) parts.push(value.slice(i, i + chunkSize));
      if (parts.length === 0) parts.push('');
      if (parts.length > MAX_CHUNKS) throw new Error('Valor demasiado grande para el almacenamiento seguro.');
      const previous = await readCount(key);
      for (let i = 0; i < parts.length; i++) await base.setItem(partKey(key, i), parts[i]!);
      await base.setItem(countKey(key), String(parts.length));
      for (let i = parts.length; i < previous; i++) await base.removeItem(partKey(key, i));
    },
    async removeItem(key) {
      const count = await readCount(key);
      for (let i = 0; i < count; i++) await base.removeItem(partKey(key, i));
      await base.removeItem(countKey(key));
    },
  };
}
