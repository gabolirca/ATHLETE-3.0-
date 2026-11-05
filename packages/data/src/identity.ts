import { appError, err, type CatalogSnapshot, type PullResponse, type PushResponse, type SecureKeyValueStorage, type SyncTransport } from '@athlete/contracts';
import { LocalDatabaseError, readSecret, replaceSecret, storeNewSecret } from './secure/encrypted-database';

/**
 * Identidad local sin cuenta.
 *
 * ATHLETE funciona desde la primera apertura sin registrarse. Cada dispositivo tiene un `localUserId` (UUID) que
 * hace de `user_id` de sus datos y da nombre a su base (`localDatabaseName(localUserId)`). Al iniciar sesión, los datos
 * locales se adoptan para la cuenta (`adoptLocalData`): se reasigna `user_id` y se guarda `accountUserId`.
 *
 * Continuidad con la capa anterior de la app: si existe su identificador `device:<uuid>`
 * (`athlete3.local-owner.v1`), se reutiliza ese UUID; no se modifica ni se borra esa entrada.
 */
export type DeviceIdentity = {
  localUserId: string;
  /** Cuenta vinculada (auth.uid). null = modo local sin cuenta. */
  accountUserId: string | null;
};

export const IDENTITY_KEY = 'athlete3.identity.v1';
export const LEGACY_OWNER_KEY = 'athlete3.local-owner.v1';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function encode(identity: DeviceIdentity): string {
  return JSON.stringify({ v: 1, localUserId: identity.localUserId, accountUserId: identity.accountUserId });
}

function decode(raw: string): DeviceIdentity {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = null;
  }
  const p = parsed as { v?: unknown; localUserId?: unknown; accountUserId?: unknown } | null;
  if (!p || p.v !== 1 || typeof p.localUserId !== 'string' || !UUID.test(p.localUserId)
    || !(p.accountUserId === null || (typeof p.accountUserId === 'string' && UUID.test(p.accountUserId)))) {
    throw new LocalDatabaseError('secret-invalid', 'La identidad local guardada tiene un formato inválido; no se reemplazó.');
  }
  return { localUserId: p.localUserId, accountUserId: p.accountUserId as string | null };
}

/** Lee la identidad guardada (null si no hay). */
export async function readIdentity(store: SecureKeyValueStorage): Promise<DeviceIdentity | null> {
  const stored = await readSecret(store, IDENTITY_KEY);
  return stored === null ? null : decode(stored);
}

/**
 * Lee la identidad del dispositivo o la crea una sola vez (sin sobrescribir nada).
 * Con `create: false` (base existente) nunca la crea: si falta → `identity-missing`.
 */
export async function resolveIdentity(store: SecureKeyValueStorage, newUuid: () => string, options: { create?: boolean } = {}): Promise<DeviceIdentity> {
  const stored = await readIdentity(store);
  if (stored !== null) return stored;
  if (options.create === false) {
    throw new LocalDatabaseError('identity-missing', 'Falta la identidad del dispositivo para una base existente; no se creó otra.');
  }

  const legacy = await readSecret(store, LEGACY_OWNER_KEY);
  const legacyUuid = legacy?.startsWith('device:') ? legacy.slice('device:'.length).toLowerCase() : null;
  const localUserId = legacyUuid && UUID.test(legacyUuid) ? legacyUuid : newUuid().toLowerCase();
  const identity: DeviceIdentity = { localUserId, accountUserId: null };
  await storeNewSecret(store, IDENTITY_KEY, encode(identity));
  return identity;
}

/**
 * Sustituye la identidad por una nueva base vacía (`startNewStore`, recuperación explícita). Comparar-y-escribir
 * sobre el valor crudo actual (`expectedRaw`, incluso si era ilegible):
 * la base y la clave anteriores siguen en su sitio con su nombre; solo cambia a qué base apunta el dispositivo.
 */
export async function replaceIdentity(store: SecureKeyValueStorage, expectedRaw: string | null, next: DeviceIdentity): Promise<DeviceIdentity> {
  if (expectedRaw === null) await storeNewSecret(store, IDENTITY_KEY, encode(next));
  else await replaceSecret(store, IDENTITY_KEY, expectedRaw, encode(next));
  return next;
}

/** Vincula la cuenta (comparar-y-escribir sobre la identidad actual). */
export async function linkAccount(store: SecureKeyValueStorage, current: DeviceIdentity, accountUserId: string): Promise<DeviceIdentity> {
  const next: DeviceIdentity = { localUserId: current.localUserId, accountUserId };
  await replaceSecret(store, IDENTITY_KEY, encode(current), encode(next));
  return next;
}

/**
 * Transporte para el modo sin cuenta: no hay servidor al que enviar. Responde `UNAUTHENTICATED` (no reintentable),
 * de modo que el motor deja las mutaciones pendientes sin consumir intentos. Al vincular una cuenta, se envían.
 */
export const localOnlyTransport: SyncTransport = {
  push: async () => err<PushResponse>(appError('UNAUTHENTICATED', 'Sin cuenta: los datos se guardan solo en este dispositivo.', { retryable: false })),
  pull: async () => err<PullResponse>(appError('UNAUTHENTICATED', 'Sin cuenta: los datos se guardan solo en este dispositivo.', { retryable: false })),
  pullCatalog: async () => err<CatalogSnapshot>(appError('UNAUTHENTICATED', 'Sin cuenta.', { retryable: false })),
};
