import { useEffect, useState } from 'react';
import * as SecureStore from 'expo-secure-store';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';

/**
 * Foto de perfil: se guarda SOLO en este teléfono (el perfil es privado; no se sube a la nube).
 * Se guarda el nombre del archivo, no la ruta: en iOS la carpeta de la app cambia de ruta entre actualizaciones.
 */
export const AVATAR_KEY = 'athlete3.avatar.v1';
let current: string | null | undefined;
const listeners = new Set<(uri: string | null) => void>();
const notify = () => listeners.forEach((l) => l(current ?? null));
const uriOf = (name: string) => `${FileSystem.documentDirectory ?? ''}${name}`;

export async function getAvatarUri(): Promise<string | null> {
  if (current !== undefined) return current;
  try {
    const name = await SecureStore.getItemAsync(AVATAR_KEY);
    if (!name) { current = null; return null; }
    const info = await FileSystem.getInfoAsync(uriOf(name));
    current = info.exists ? uriOf(name) : null;
  } catch { current = null; }
  return current;
}

/** Elige de la galería, recorta cuadrado y guarda una versión de 512 px. null si cancela; 'denied' sin permiso. */
export async function pickAvatar(): Promise<string | null | 'denied'> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) return 'denied';
  const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 1, exif: false });
  if (picked.canceled || !picked.assets?.[0]) return null;
  const small = await manipulateAsync(picked.assets[0].uri, [{ resize: { width: 512 } }], { compress: 0.75, format: SaveFormat.JPEG });
  const old = await SecureStore.getItemAsync(AVATAR_KEY).catch(() => null);
  const name = `avatar-${Date.now()}.jpg`;
  await FileSystem.copyAsync({ from: small.uri, to: uriOf(name) });
  await SecureStore.setItemAsync(AVATAR_KEY, name);
  if (old) await FileSystem.deleteAsync(uriOf(old), { idempotent: true }).catch(() => undefined);
  current = uriOf(name); notify();
  return current;
}

export async function removeAvatar(): Promise<void> {
  const old = await SecureStore.getItemAsync(AVATAR_KEY).catch(() => null);
  await SecureStore.deleteItemAsync(AVATAR_KEY).catch(() => undefined);
  if (old) await FileSystem.deleteAsync(uriOf(old), { idempotent: true }).catch(() => undefined);
  current = null; notify();
}

export function useAvatar(): string | null {
  const [uri, setUri] = useState<string | null>(current ?? null);
  useEffect(() => {
    let alive = true;
    void getAvatarUri().then((u) => { if (alive) setUri(u); });
    const l = (u: string | null) => setUri(u);
    listeners.add(l);
    return () => { alive = false; listeners.delete(l); };
  }, []);
  return uri;
}

/** Solo para pruebas. */
export function __resetAvatar() { current = undefined; }
