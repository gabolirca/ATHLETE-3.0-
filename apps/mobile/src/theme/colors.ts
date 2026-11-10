import * as SecureStore from 'expo-secure-store';

/**
 * Tema de la app: oscuro (por defecto) o claro. Se elige en Ajustes y se aplica al volver a abrir la app:
 * se lee una sola vez, al cargar, ANTES de que las pantallas creen sus estilos (StyleSheet.create).
 */
export const THEME_KEY = 'athlete3.theme';
export type ThemeMode = 'dark' | 'light';

function readMode(): ThemeMode {
  try { return SecureStore.getItem(THEME_KEY) === 'light' ? 'light' : 'dark'; } catch { return 'dark'; }
}
export const themeMode: ThemeMode = readMode();

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

export const colors = themeMode === 'light' ? light : dark;
