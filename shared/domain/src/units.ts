import type { LengthUnit, MassUnit } from '@athlete/contracts';

/** Factor exacto por definición internacional (1959). */
export const KG_PER_LB = 0.45359237;
export const CM_PER_IN = 2.54;

export function toKg(value: number, unit: MassUnit): number {
  return unit === 'kg' ? value : value * KG_PER_LB;
}

export function fromKg(kg: number, unit: MassUnit): number {
  return unit === 'kg' ? kg : kg / KG_PER_LB;
}

export function toCm(value: number, unit: LengthUnit): number {
  return unit === 'cm' ? value : value * CM_PER_IN;
}

export function fromCm(cm: number, unit: LengthUnit): number {
  return unit === 'cm' ? cm : cm / CM_PER_IN;
}

/** Redondeo decimal para presentación. Los valores almacenados no se redondean aquí. */
export function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}
