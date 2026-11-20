/** Logos de ATHLETE (fondo transparente). */
export const BRAND = {
  /** Solo la "A" con el trazo. Proporción 628 × 367. */
  mark: require('../../assets/brand/a-mark.png') as number,
  /** "A" + ATHLETE en una línea, letras blancas (tema oscuro). Proporción 1540 × 148. */
  lockup: require('../../assets/brand/lockup.png') as number,
  /** El mismo con las letras oscuras, para el tema claro. */
  lockupLight: require('../../assets/brand/lockup-light.png') as number,
  /** Portada de marca (Progreso, Perfil y fondo de las tarjetas para compartir). */
  cover: require('../../assets/brand/cover.jpg') as number,
};
export const MARK_RATIO = 628 / 367;
export const LOCKUP_RATIO = 1540 / 148;
/** Azul del logo, para la racha y acentos de marca. */
export const BRAND_COLOR = '#1FB8FF';
/** @deprecated nombre anterior de BRAND_COLOR. */
export const BRAND_CYAN = BRAND_COLOR;
/** Fondo de marca (splash, intro, tarjetas para compartir). */
export const BRAND_BG = '#0B0E14';

/** Logo según el tema: letras blancas en oscuro, oscuras en claro. */
export const lockupFor = (mode: 'dark' | 'light') => (mode === 'light' ? BRAND.lockupLight : BRAND.lockup);
