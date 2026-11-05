import type { IsoDateTime, LocalDate, Uuid } from '@athlete/contracts';
import { estimateE1rm, isEffectiveSet, setVolumeKg, type E1rmOptions, type SetLike } from './strength';

export type HistoricalSet = SetLike & {
  id: Uuid;
  sessionId: Uuid;
  localDate: LocalDate;
};

export type RecordKind = 'max_weight' | 'best_e1rm' | 'max_reps' | 'max_set_volume';

export type PersonalRecord = {
  kind: RecordKind;
  value: number;
  setId: Uuid;
  sessionId: Uuid;
  localDate: LocalDate;
  weightKg: number | null;
  reps: number | null;
};

export type PersonalRecords = Record<RecordKind, PersonalRecord | null>;

const KINDS: readonly RecordKind[] = ['max_weight', 'best_e1rm', 'max_reps', 'max_set_volume'];

function valueFor(kind: RecordKind, set: HistoricalSet, e1rm: E1rmOptions): number | null {
  switch (kind) {
    case 'max_weight':
      return set.weightKg !== null && set.weightKg > 0 ? set.weightKg : null;
    case 'best_e1rm':
      return estimateE1rm(set.weightKg, set.reps, e1rm);
    case 'max_reps':
      return set.reps;
    case 'max_set_volume':
      return setVolumeKg(set);
  }
}

function chronological(a: HistoricalSet, b: HistoricalSet): number {
  if (a.localDate !== b.localDate) return a.localDate < b.localDate ? -1 : 1;
  const ca = a.completedAt as IsoDateTime;
  const cb = b.completedAt as IsoDateTime;
  return new Date(ca).getTime() - new Date(cb).getTime();
}

/**
 * Récords personales de **un** ejercicio a partir de sus series históricas.
 * Solo cuentan series efectivas (sin calentamientos). En empate gana la primera en lograrse.
 */
export function computePersonalRecords(sets: readonly HistoricalSet[], e1rm: E1rmOptions = {}): PersonalRecords {
  const records: PersonalRecords = { max_weight: null, best_e1rm: null, max_reps: null, max_set_volume: null };
  const ordered = sets.filter(isEffectiveSet).sort(chronological);

  for (const set of ordered) {
    for (const kind of KINDS) {
      const value = valueFor(kind, set, e1rm);
      if (value === null) continue;
      const current = records[kind];
      if (current === null || value > current.value) {
        records[kind] = {
          kind,
          value,
          setId: set.id,
          sessionId: set.sessionId,
          localDate: set.localDate,
          weightKg: set.weightKg,
          reps: set.reps,
        };
      }
    }
  }
  return records;
}

/**
 * Récords que las series de `sessionId` superan estrictamente respecto al historial previo.
 * `allSets` debe incluir todas las series del ejercicio, también las de la sesión evaluada.
 * Por defecto, la primera vez que se hace un ejercicio no genera récords (`countFirstAsRecord`).
 */
export function newRecordsInSession(
  allSets: readonly HistoricalSet[],
  sessionId: Uuid,
  options: E1rmOptions & { countFirstAsRecord?: boolean } = {},
): PersonalRecord[] {
  const { countFirstAsRecord = false, ...e1rm } = options;
  const before = computePersonalRecords(allSets.filter((s) => s.sessionId !== sessionId), e1rm);
  const after = computePersonalRecords(allSets, e1rm);
  return KINDS.flatMap((kind) => {
    const a = after[kind];
    const b = before[kind];
    if (a === null || a.sessionId !== sessionId) return [];
    if (b === null) return countFirstAsRecord ? [a] : [];
    return a.value > b.value ? [a] : [];
  });
}
