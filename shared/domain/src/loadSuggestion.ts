/**
 * Carga sugerida para hoy a partir de la última vez (reglas; más adelante un modelo con más datos).
 * - Con RIR registrado: 1RM estimado con repeticiones + reserva (Epley) y el peso que corresponde a las
 *   repeticiones y reserva objetivo. El salto se limita a ±2 incrementos (o −10 %) por seguridad.
 * - Sin RIR: doble progresión. Si todas las series a ese peso llegaron a las reps objetivo, sube un incremento.
 * - Peso corporal: una repetición más.
 * Siempre es una sugerencia: el usuario decide.
 */
export type LastSet = { weightKg: number | null; reps: number | null; rir: number | null };
export type LoadSuggestionInput = { lastSets: readonly LastSet[]; targetReps: number | null; targetRir: number | null; incrementKg?: number };
export type LoadSuggestion = { weightKg: number | null; reps: number; action: 'increase' | 'repeat' | 'decrease' | 'more_reps'; reason: string };

export const DEFAULT_TARGET_RIR = 2;
export const DEFAULT_INCREMENT_KG = 2.5;

const roundTo = (x: number, step: number) => Number((Math.round(x / step) * step).toFixed(2));
const kg = (n: number) => `${n} kg`;

export function suggestLoad({ lastSets, targetReps, targetRir, incrementKg = DEFAULT_INCREMENT_KG }: LoadSuggestionInput): LoadSuggestion | null {
  const working = lastSets.filter((s) => s.reps !== null && s.reps > 0) as Array<LastSet & { reps: number }>;
  if (!working.length) return null;
  const loaded = working.filter((s) => s.weightKg !== null && s.weightKg > 0) as Array<LastSet & { reps: number; weightKg: number }>;

  if (!loaded.length) {
    const best = Math.max(...working.map((s) => s.reps));
    return { weightKg: null, reps: best + 1, action: 'more_reps', reason: `La vez pasada tu mejor serie fue de ${best}. Intenta ${best + 1}.` };
  }

  const top = loaded.reduce((a, b) => (b.weightKg > a.weightKg || (b.weightKg === a.weightKg && b.reps > a.reps) ? b : a));
  const reps = targetReps ?? top.reps;
  const rirGoal = targetRir ?? DEFAULT_TARGET_RIR;
  const up = roundTo(top.weightKg + incrementKg, incrementKg);
  const down = Math.max(incrementKg, roundTo(top.weightKg * 0.95, incrementKg));

  if (top.rir !== null) {
    const e1rm = top.weightKg * (1 + (top.reps + top.rir) / 30);
    const ideal = e1rm / (1 + (reps + rirGoal) / 30);
    const capped = Math.min(top.weightKg + 2 * incrementKg, Math.max(top.weightKg * 0.9, ideal));
    const weightKg = Math.max(incrementKg, roundTo(capped, incrementKg));
    const last = `${kg(top.weightKg)} × ${top.reps} con ${top.rir} en reserva`;
    if (weightKg > top.weightKg) return { weightKg, reps, action: 'increase', reason: `La vez pasada: ${last}. Te sobró margen: sube a ${kg(weightKg)}.` };
    if (weightKg < top.weightKg) return { weightKg, reps, action: 'decrease', reason: `La vez pasada: ${last}. Fue más pesado que tu objetivo (${rirGoal} en reserva): baja a ${kg(weightKg)}.` };
    return { weightKg, reps, action: 'repeat', reason: `La vez pasada: ${last}. Mantén el peso y busca ${reps} reps.` };
  }

  if (targetReps === null) return { weightKg: top.weightKg, reps: top.reps + 1, action: 'more_reps', reason: `Sin objetivo de reps: mismo peso y una repetición más que la vez pasada (${top.reps}).` };
  const atTop = loaded.filter((s) => s.weightKg === top.weightKg);
  if (atTop.every((s) => s.reps >= targetReps)) return { weightKg: up, reps, action: 'increase', reason: `Completaste ${targetReps} reps en todas las series con ${kg(top.weightKg)}: sube a ${kg(up)}.` };
  if (top.reps >= targetReps - 2) return { weightKg: top.weightKg, reps, action: 'repeat', reason: `Te faltaron reps con ${kg(top.weightKg)}: repite el peso hasta completar ${targetReps}.` };
  return { weightKg: down, reps, action: 'decrease', reason: `Quedaste lejos de ${targetReps} reps con ${kg(top.weightKg)}: baja a ${kg(down)}.` };
}
