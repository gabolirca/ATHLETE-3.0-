import type { Exercise } from '@/data/trainingTypes';
import { similarExercises } from '@/program/edit/ExerciseSheet';

/**
 * "Máquina ocupada": variantes del ejercicio que se pueden hacer en otro equipo.
 * Mismo patrón de movimiento o mismo músculo principal (como al editar un programa), y entre las parecidas
 * primero las que usan OTRO equipo: si la máquina está ocupada, otra con la misma máquina no sirve.
 */
export function machineAlternatives(current: Exercise | undefined, all: readonly Exercise[], limit = 6): Exercise[] {
  if (!current) return [];
  const busy = new Set(current.equipmentList ?? (current.equipment ? [current.equipment] : []));
  const usesOther = (e: Exercise) => {
    const list = e.equipmentList ?? (e.equipment ? [e.equipment] : []);
    return busy.size === 0 || list.length === 0 || list.some((x) => !busy.has(x));
  };
  const similar = similarExercises(current, all, all.length);
  const rank = new Map(similar.map((e, i) => [e.id, i]));
  return [...similar].sort((a, b) => Number(usesOther(b)) - Number(usesOther(a)) || rank.get(a.id)! - rank.get(b.id)!).slice(0, limit);
}
