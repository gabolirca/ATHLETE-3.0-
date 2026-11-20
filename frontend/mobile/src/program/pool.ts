import type { CardioDraft } from '@/cardio/cardioForm';
import type { ProgramDay } from '@/data/trainingTypes';
import { cardioActivityFor, formatPrescription } from './format';

/**
 * "Modo alberca": la sesión de nado o carrera del programa como lista de repeticiones para palomear.
 * Cada serie de un intervalo es una casilla (4 × 50 m → 4 casillas); lo continuo es una sola.
 */
export type PoolItem = { key: string; blockName: string; label: string; meters: number | null; seconds: number | null; restSeconds: number | null };
export type PoolProgress = { startedAt: number; done: Record<string, { at: number; seconds: number | null }> };

export function poolItems(day: ProgramDay): PoolItem[] {
  return day.blocks.flatMap((b) => b.exercises.flatMap((e) => {
    const reps = Math.max(1, (e.sets ?? 1) * (b.format === 'rounds' ? b.rounds ?? 1 : 1));
    const one = formatPrescription({ ...e, sets: null });
    return Array.from({ length: reps }, (_, i) => ({
      key: `${e.id}#${i}`, blockName: b.name,
      label: `${e.exerciseName}${reps > 1 ? ` · ${i + 1} de ${reps}` : ''}${one ? ` · ${one}` : ''}`,
      meters: e.distanceMeters, seconds: e.durationSeconds, restSeconds: i < reps - 1 ? e.restSeconds : null,
    }));
  }));
}

export function poolTotals(items: readonly PoolItem[], progress: PoolProgress) {
  const plannedMeters = items.reduce((n, i) => n + (i.meters ?? 0), 0);
  const doneMeters = items.filter((i) => progress.done[i.key]).reduce((n, i) => n + (i.meters ?? 0), 0);
  const doneCount = items.filter((i) => progress.done[i.key]).length;
  return { plannedMeters, doneMeters, doneCount, total: items.length };
}

/** Actividad de cardio que se guarda al terminar: tiempo total, metros hechos, RPE y el detalle en notas. */
export function poolDraft(day: ProgramDay, items: readonly PoolItem[], progress: PoolProgress, now: number, rpe: number | null, timeZone: string): CardioDraft {
  const t = poolTotals(items, progress);
  const durationSeconds = Math.max(1, Math.round((now - progress.startedAt) / 1000));
  const byBlock = new Map<string, { done: number; total: number }>();
  for (const i of items) { const b = byBlock.get(i.blockName) ?? { done: 0, total: 0 }; b.total++; if (progress.done[i.key]) b.done++; byBlock.set(i.blockName, b); }
  const notes = [...byBlock.entries()].map(([name, b]) => `${name}: ${b.done}/${b.total}${b.done === b.total ? ' ✓' : ''}`).join(' · ');
  const activity = cardioActivityFor(day.modality) ?? 'swim';
  return {
    activity, startedAt: new Date(progress.startedAt).toISOString(), timeZone, durationSeconds,
    distanceMeters: t.doneMeters > 0 ? t.doneMeters : null, rounds: null, rpe, avgHeartRateBpm: null, maxHeartRateBpm: null,
    swim: activity === 'swim' ? { poolType: 'pool', poolLengthMeters: 25, laps: t.doneMeters > 0 ? Math.round(t.doneMeters / 25) : null, stroke: null } : null,
    notes: `${day.name} — ${notes}`.slice(0, 2000), trainingDayId: day.id,
  };
}
