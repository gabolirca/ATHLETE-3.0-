import { useCallback, useEffect, useState } from 'react';
import * as SecureStore from 'expo-secure-store';

/** La base siempre guarda kg. La unidad solo cambia cómo se escribe y se muestra, por ejercicio (máquina en lb, rack en kg). */
export type WeightUnit = 'kg' | 'lb';
export const KG_PER_LB = 0.45359237;
const KEY = 'athlete3.units.v1';

/** kg → lo que ve el usuario. En lb se redondea a 0.5 (las máquinas van de 2.5 en 2.5 o de 5 en 5). */
export function toDisplay(kg: number | null, unit: WeightUnit): number | null {
  if (kg === null) return null;
  if (unit === 'kg') return kg;
  return Math.round((kg / KG_PER_LB) * 2) / 2;
}

/** Lo que escribió el usuario → kg con 2 decimales. */
export function toKg(value: number | null, unit: WeightUnit): number | null {
  if (value === null) return null;
  if (unit === 'kg') return value;
  return Math.round(value * KG_PER_LB * 100) / 100;
}

/** "60 kg" / "135 lb". */
export function formatWeight(kg: number | null, unit: WeightUnit): string {
  const v = toDisplay(kg, unit);
  return v === null ? '—' : `${v} ${unit}`;
}

let cache: Record<string, WeightUnit> | null = null;
const listeners = new Set<() => void>();

async function load(): Promise<Record<string, WeightUnit>> {
  if (cache) return cache;
  try { const raw = await SecureStore.getItemAsync(KEY); cache = raw ? JSON.parse(raw) as Record<string, WeightUnit> : {}; }
  catch { cache = {}; }
  return cache;
}

export async function getWeightUnit(exerciseId: string): Promise<WeightUnit> {
  return (await load())[exerciseId] ?? 'kg';
}

export async function setWeightUnit(exerciseId: string, unit: WeightUnit): Promise<void> {
  const map = { ...(await load()) };
  if (unit === 'kg') delete map[exerciseId]; else map[exerciseId] = unit;
  cache = map;
  listeners.forEach((l) => l());
  try { await SecureStore.setItemAsync(KEY, JSON.stringify(map)); } catch { /* se queda en memoria esta sesión */ }
}

/** Unidades de todos los ejercicios (para la pantalla de entrenamiento). */
export function useWeightUnits(): [Record<string, WeightUnit>, (exerciseId: string, unit: WeightUnit) => void] {
  const [units, setUnits] = useState<Record<string, WeightUnit>>(cache ?? {});
  useEffect(() => {
    let alive = true;
    const sync = () => { void load().then((m) => { if (alive) setUnits({ ...m }); }); };
    sync(); listeners.add(sync);
    return () => { alive = false; listeners.delete(sync); };
  }, []);
  const change = useCallback((exerciseId: string, unit: WeightUnit) => { void setWeightUnit(exerciseId, unit); }, []);
  return [units, change];
}

/** Solo para pruebas. */
export function __resetWeightUnitsCache() { cache = null; }
