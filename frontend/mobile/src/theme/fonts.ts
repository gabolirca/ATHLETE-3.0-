/** Tipografía de marca: Barlow Condensed para títulos, números grandes y botones (se carga en app/_layout.tsx). */
export const FONT_FILES = {
  'BarlowCondensed-Bold': require('../../assets/fonts/BarlowCondensed-Bold.ttf') as number,
  'BarlowCondensed-ExtraBold': require('../../assets/fonts/BarlowCondensed-ExtraBold.ttf') as number,
};
export const display = { fontFamily: 'BarlowCondensed-ExtraBold', textTransform: 'uppercase' } as const;
export const displayBold = { fontFamily: 'BarlowCondensed-Bold', textTransform: 'uppercase' } as const;
