import { ACTIVE_STORE_KEY, IDENTITY_KEY, databaseKeyName } from '@athlete/data';

/** Llaves del teléfono que no dependen de una base concreta. */
export const DEVICE_KEYS = [
  IDENTITY_KEY, ACTIVE_STORE_KEY,
  'athlete3.onboarding.v1', 'athlete3.pref.strict-rest', 'athlete3.nutrition-disclaimer',
] as const;

export type EraseDeps = {
  /** Cierra la sesión de la nube en este teléfono (borra los tokens). */
  signOut: () => Promise<unknown>;
  /** Cierra la base abierta para poder borrar sus archivos. */
  closeData: () => Promise<unknown>;
  /** Nombres de archivo en la carpeta de bases (incluye -wal / -shm). */
  listFiles: () => Promise<string[]>;
  deleteFile: (name: string) => Promise<void>;
  deleteKey: (key: string) => Promise<void>;
};

export type EraseResult = { files: number; failed: string[] };

/**
 * Deja el teléfono como recién instalado: sin sesión, sin bases de ATHLETE y sin la identidad del dispositivo,
 * para poder registrarse con una cuenta nueva. No toca la nube: borrar la cuenta del servidor es aparte.
 * Sigue aunque falle un paso y reporta lo que no pudo borrar.
 */
export async function eraseDevice(deps: EraseDeps): Promise<EraseResult> {
  const failed: string[] = [];
  const attempt = async (label: string, fn: () => Promise<unknown>) => { try { await fn(); } catch { failed.push(label); } };
  await attempt('sesión', deps.signOut);
  await attempt('base abierta', deps.closeData);
  let names: string[] = [];
  await attempt('lista de archivos', async () => { names = await deps.listFiles(); });
  const ours = names.filter((n) => n.startsWith('athlete3'));
  for (const name of ours) await attempt(name, () => deps.deleteFile(name));
  const dbs = ours.filter((n) => n.endsWith('.db'));
  for (const key of [...DEVICE_KEYS, ...dbs.map(databaseKeyName)]) await attempt(key, () => deps.deleteKey(key));
  return { files: ours.length, failed };
}
