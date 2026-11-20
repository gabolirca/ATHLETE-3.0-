/**
 * Qué opciones de RIR ("¿cuántas repeticiones más podrías haber hecho?") mostrar en una serie.
 * El dato guardado no cambia (0–10 en medios puntos, o null); solo se reduce lo que se ve.
 *
 * - Por defecto: 0 1 2 3 4 y un botón "5+" que despliega 5–10. Por encima de 4–5 la estimación casi nunca es fiable.
 * - Con objetivo de la rutina: la ventana se centra en el objetivo (objetivo ± 2).
 * - Medios puntos solo si el objetivo los usa, si ya hay un valor guardado con medio punto o si el atleta
 *   activa "más precisión".
 * - El valor guardado siempre se muestra, aunque quede fuera de la ventana.
 */
export type RirOptions = { values: number[]; canExpand: boolean; precise: boolean };

const isHalf = (v: number | null | undefined) => v !== null && v !== undefined && !Number.isInteger(v);
const inRange = (v: number) => v >= 0 && v <= 10 && Number.isInteger(v * 2);

export function rirOptions(input: { targetRir?: number | null; current?: number | null; expanded?: boolean; precise?: boolean }): RirOptions {
  const target = input.targetRir ?? null;
  const precise = Boolean(input.precise) || isHalf(target) || isHalf(input.current);
  let low: number;
  let high: number;
  if (input.expanded) { low = 0; high = 10; }
  else if (target !== null && target > 4) { low = Math.max(0, Math.floor(target) - 2); high = Math.min(10, Math.ceil(target) + 2); }
  else { low = 0; high = 4; }

  const step = precise ? 0.5 : 1;
  const values = new Set<number>();
  for (let v = low; v <= high + 1e-9; v += step) values.add(Math.round(v * 2) / 2);
  if (target !== null && inRange(target)) values.add(target);
  if (input.current !== null && input.current !== undefined && inRange(input.current)) values.add(input.current);

  const sorted = [...values].sort((a, b) => a - b);
  return { values: sorted, canExpand: !input.expanded && high < 10, precise };
}

/** Texto accesible de una opción. */
export function rirLabel(value: number): string {
  if (value === 0) return '0 ninguna repetición más';
  if (value === 0.5) return '0.5 media repetición más';
  return `${value} ${value === 1 ? 'repetición más' : 'repeticiones más'}`;
}
