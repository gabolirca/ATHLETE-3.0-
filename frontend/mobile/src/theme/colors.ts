import * as SecureStore from 'expo-secure-store';

/**
 * Tema de la app: oscuro (por defecto) o claro. Se elige en Ajustes y se aplica AL MOMENTO:
 * - `colors` es un objeto vivo: al cambiar de tema se reescriben sus valores.
 * - Los estilos de cada pantalla se hacen con `themed(() => StyleSheet.create({ ... }))`, que se recalcula con el tema activo.
 * - La app escucha `onThemeChange` y vuelve a dibujar las pantallas (los datos y la sesión no se pierden).
 */
export const THEME_KEY = 'athlete3.theme';
export type ThemeMode = 'dark' | 'light';

function readMode(): ThemeMode {
  try { return SecureStore.getItem(THEME_KEY) === 'light' ? 'light' : 'dark'; } catch { return 'dark'; }
}
export let themeMode: ThemeMode = readMode();

/** Paleta ATHLETE: azul de marca sobre grafito (oscuro) o blanco (claro). */
const dark = {
  black: '#090B10', blue: '#1769FF', red: '#EF3340', graphite: '#252B36',
  surface: '#11151D', surfaceRaised: '#171C26', border: '#252B36',
  text: '#F4F6FA', secondary: '#9AA3B2', muted: '#626C7C', green: '#55D6A2',
  accentText: '#9DBDFF', accentSoft: '#172849', accentDeep: '#10203F',
  amber: '#F5B841', amberSoft: '#2A2410', greenSoft: '#12291F', cyan: '#3CC8E6', purple: '#9B7BFF', redSoft: '#3A1D22',
};
const light: typeof dark = {
  black: '#F3F5F9', blue: '#1769FF', red: '#D92B3A', graphite: '#D5DBE5',
  surface: '#FFFFFF', surfaceRaised: '#EDF0F5', border: '#D5DBE5',
  text: '#0E1320', secondary: '#4F5A6B', muted: '#8A93A3', green: '#12945F',
  accentText: '#1452CC', accentSoft: '#E1EAFF', accentDeep: '#D3E1FF',
  amber: '#B7791F', amberSoft: '#FFF2D6', greenSoft: '#DFF5EA', cyan: '#0E8FAD', purple: '#6B4FD8', redSoft: '#FDE4E7',
};

export const colors: typeof dark = { ...(themeMode === 'light' ? light : dark) };

let version = 0;
const listeners = new Set<(mode: ThemeMode) => void>();
/** Versión del tema: sube cada vez que cambia (para recalcular estilos y redibujar). */
export const themeVersion = () => version;
export function onThemeChange(listener: (mode: ThemeMode) => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** Cambia el tema al momento y lo recuerda para la próxima vez. */
export async function setThemeMode(mode: ThemeMode): Promise<void> {
  if (mode !== themeMode) {
    themeMode = mode;
    Object.assign(colors, mode === 'light' ? light : dark);
    version += 1;
    for (const l of [...listeners]) { try { l(mode); } catch { /* un oyente roto no detiene el cambio */ } }
  }
  await SecureStore.setItemAsync(THEME_KEY, mode);
}

/**
 * Estilos que siguen al tema: como StyleSheet.create, pero se recalculan cuando cambia el tema
 * (StyleSheet.create copia los colores una sola vez, al cargar).
 */
export function themed<T extends object>(make: () => T): T {
  let cache: T | null = null;
  let at = -1;
  const current = () => { if (at !== version || cache === null) { cache = make(); at = version; } return cache; };
  return new Proxy({} as T, {
    get: (_t, key) => (current() as Record<PropertyKey, unknown>)[key],
    has: (_t, key) => key in current(),
    ownKeys: () => Reflect.ownKeys(current()),
    getOwnPropertyDescriptor: (_t, key) => ({ ...Object.getOwnPropertyDescriptor(current(), key), configurable: true }),
  });
}
