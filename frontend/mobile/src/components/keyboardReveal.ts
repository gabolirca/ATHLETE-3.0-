/**
 * Mantener visible el campo que se está escribiendo (UX: "cuando sale el teclado, la pantalla sube").
 * `AppInput` avisa cuando recibe el foco; `Screen` mide el campo y recorre su scroll si el teclado lo tapa.
 */
type Listener = () => void;
const listeners = new Set<Listener>();

export function onInputFocus(listener: Listener): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function notifyInputFocus() {
  for (const l of [...listeners]) l();
}

/** Margen entre el campo y el teclado. */
export const KEYBOARD_MARGIN = 24;

/**
 * Cuánto hay que bajar el scroll para que el borde inferior del campo quede por encima del teclado.
 * Coordenadas de ventana. Devuelve el nuevo `y` del scroll, o null si ya se ve.
 */
export function revealScrollY(p: { inputTop: number; inputHeight: number; keyboardTop: number; scrollY: number; viewportTop?: number }): number | null {
  const bottom = p.inputTop + p.inputHeight + KEYBOARD_MARGIN;
  if (bottom > p.keyboardTop) return Math.max(0, p.scrollY + (bottom - p.keyboardTop));
  // Si el campo quedó arriba, fuera de la vista (por encima del área visible), también se trae.
  const top = p.viewportTop ?? 0;
  if (p.inputTop < top) return Math.max(0, p.scrollY - (top - p.inputTop) - KEYBOARD_MARGIN);
  return null;
}
