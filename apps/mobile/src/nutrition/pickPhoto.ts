import * as ImagePicker from 'expo-image-picker';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';

/**
 * Toma o elige una foto y la reduce a ~1024 px en JPEG (unos 150–300 KB) para mandarla rápido.
 * Devuelve null si el usuario cancela o niega el permiso. La foto no se guarda en la app.
 */
export async function pickFoodPhoto(source: 'camera' | 'library'): Promise<{ base64: string } | { denied: true } | null> {
  const perm = source === 'camera' ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) return { denied: true };
  const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 1, exif: false };
  const picked = source === 'camera' ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
  if (picked.canceled || !picked.assets?.[0]) return null;
  const asset = picked.assets[0];
  const resize = (asset.width ?? 0) > (asset.height ?? 0) ? { width: 1024 } : { height: 1024 };
  const small = await manipulateAsync(asset.uri, [{ resize }], { compress: 0.6, format: SaveFormat.JPEG, base64: true });
  if (!small.base64) return null;
  return { base64: small.base64 };
}
