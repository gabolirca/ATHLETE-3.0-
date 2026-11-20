import { Platform } from 'react-native';
import * as Crypto from 'expo-crypto';

/**
 * Inicio de sesión con Apple y Google en forma NATIVA: el sistema entrega un ID token y Supabase lo valida
 * (`signInWithIdToken`). No hay navegador ni contraseña. Cada proveedor se muestra solo si la compilación
 * lo tiene configurado en `.env` (ver app.config.js).
 */
export type SocialToken = { provider: 'apple' | 'google'; idToken: string; nonce?: string };
export type SocialResult = { kind: 'ok'; token: SocialToken } | { kind: 'cancelled' } | { kind: 'error'; message: string };

const GOOGLE_WEB = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? '';
const GOOGLE_IOS = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ?? '';
const APPLE_ON = process.env.EXPO_PUBLIC_APPLE_SIGNIN === '1';

export function googleEnabled(): boolean {
  if (!GOOGLE_WEB.endsWith('.apps.googleusercontent.com')) return false;
  return Platform.OS === 'android' || GOOGLE_IOS.endsWith('.apps.googleusercontent.com');
}

export async function appleEnabled(): Promise<boolean> {
  if (Platform.OS !== 'ios' || !APPLE_ON) return false;
  try {
    const Apple = await import('expo-apple-authentication');
    return await Apple.isAvailableAsync();
  } catch { return false; }
}

export async function signInWithApple(): Promise<SocialResult> {
  try {
    const Apple = await import('expo-apple-authentication');
    // Apple recibe el nonce cifrado (SHA-256) y Supabase el original: así comprueba que el token es de esta petición.
    const rawNonce = Crypto.randomUUID();
    const hashed = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, rawNonce);
    const cred = await Apple.signInAsync({
      requestedScopes: [Apple.AppleAuthenticationScope.FULL_NAME, Apple.AppleAuthenticationScope.EMAIL],
      nonce: hashed,
    });
    if (!cred.identityToken) return { kind: 'error', message: 'Apple no entregó el token. Intenta de nuevo.' };
    return { kind: 'ok', token: { provider: 'apple', idToken: cred.identityToken, nonce: rawNonce } };
  } catch (e) {
    if ((e as { code?: string })?.code === 'ERR_REQUEST_CANCELED') return { kind: 'cancelled' };
    return { kind: 'error', message: 'No se pudo iniciar sesión con Apple.' };
  }
}

let googleConfigured = false;

export async function signInWithGoogle(): Promise<SocialResult> {
  try {
    const { GoogleSignin, isSuccessResponse, isErrorWithCode, statusCodes } = await import('@react-native-google-signin/google-signin');
    if (!googleConfigured) {
      GoogleSignin.configure({ webClientId: GOOGLE_WEB, ...(Platform.OS === 'ios' ? { iosClientId: GOOGLE_IOS } : {}) });
      googleConfigured = true;
    }
    try {
      if (Platform.OS === 'android') await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
      const res = await GoogleSignin.signIn();
      if (!isSuccessResponse(res)) return { kind: 'cancelled' };
      const idToken = res.data.idToken;
      if (!idToken) return { kind: 'error', message: 'Google no entregó el token. Revisa la configuración del cliente web.' };
      return { kind: 'ok', token: { provider: 'google', idToken } };
    } catch (e) {
      if (isErrorWithCode(e)) {
        if (e.code === statusCodes.SIGN_IN_CANCELLED || e.code === statusCodes.IN_PROGRESS) return { kind: 'cancelled' };
        if (e.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) return { kind: 'error', message: 'Este teléfono no tiene Google Play Services.' };
      }
      return { kind: 'error', message: 'No se pudo iniciar sesión con Google.' };
    }
  } catch {
    return { kind: 'error', message: 'Google no está disponible en esta compilación.' };
  }
}

/** Al cerrar sesión en la app también se olvida la cuenta de Google elegida (la próxima vez deja escoger). */
export async function forgetGoogleAccount(): Promise<void> {
  if (!googleEnabled()) return;
  try {
    const { GoogleSignin } = await import('@react-native-google-signin/google-signin');
    await GoogleSignin.signOut();
  } catch { /* sin sesión de Google: nada que hacer */ }
}
