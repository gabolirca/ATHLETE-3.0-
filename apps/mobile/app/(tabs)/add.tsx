import { Redirect } from 'expo-router';

/**
 * Ruta del botón "+" de la barra. Nunca se muestra: el botón abre la hoja de registro (QuickAddButton).
 * Si alguien llegara aquí por un enlace, vuelve a Inicio.
 */
export default function AddPlaceholder() {
  return <Redirect href="/"/>;
}
