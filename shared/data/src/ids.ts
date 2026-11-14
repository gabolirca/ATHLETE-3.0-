import type { Clock, IdGenerator } from '@athlete/contracts';

/**
 * UUIDv7 (RFC 9562): 48 bits de tiempo + aleatorio. Ordenable por creación (mejor localidad de índices).
 * `randomBytes` se inyecta: en la app, `expo-crypto.getRandomBytes`; en Node, `crypto.randomBytes`.
 */
export function createUuidV7Generator(randomBytes: (n: number) => Uint8Array, now: () => number = Date.now): IdGenerator {
  return {
    newId() {
      const b = randomBytes(16);
      if (b.length !== 16) throw new Error('randomBytes debe devolver 16 bytes');
      const ms = now();
      b[0] = Math.floor(ms / 2 ** 40) & 0xff;
      b[1] = Math.floor(ms / 2 ** 32) & 0xff;
      b[2] = (ms >>> 24) & 0xff;
      b[3] = (ms >>> 16) & 0xff;
      b[4] = (ms >>> 8) & 0xff;
      b[5] = ms & 0xff;
      b[6] = (b[6]! & 0x0f) | 0x70;
      b[8] = (b[8]! & 0x3f) | 0x80;
      const hex = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
      return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
    },
  };
}

export const systemClock: Clock = { now: () => new Date().toISOString() };
