import type { CardioSession } from '@athlete/contracts';

/** Ritmo en segundos por kilómetro. Null sin distancia: no se inventa. */
export function paceSecondsPerKm(durationSeconds: number, distanceMeters: number | null): number | null {
  if (distanceMeters === null || distanceMeters <= 0 || durationSeconds <= 0) return null;
  return durationSeconds / (distanceMeters / 1000);
}

/** Ritmo de natación en segundos por 100 m. */
export function pacePer100mSeconds(durationSeconds: number, distanceMeters: number | null): number | null {
  if (distanceMeters === null || distanceMeters <= 0 || durationSeconds <= 0) return null;
  return durationSeconds / (distanceMeters / 100);
}

/** Velocidad media en km/h. */
export function speedKmh(durationSeconds: number, distanceMeters: number | null): number | null {
  if (distanceMeters === null || distanceMeters <= 0 || durationSeconds <= 0) return null;
  return distanceMeters / 1000 / (durationSeconds / 3600);
}

/** Distancia de natación derivada de largos, solo si no se registró una distancia. */
export function swimDistanceFromLaps(session: Pick<CardioSession, 'distanceMeters' | 'swim'>): number | null {
  if (session.distanceMeters !== null) return session.distanceMeters;
  const swim = session.swim;
  if (!swim || swim.poolType !== 'pool' || swim.laps === null || swim.poolLengthMeters === null) return null;
  return swim.laps * swim.poolLengthMeters;
}

/** Formatea segundos como `m:ss` o `h:mm:ss` (utilidad neutral, sin localización). */
export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

/** Distancia efectiva: en natación, la registrada o la de largos × largo de alberca. */
export function effectiveDistance(session: Pick<CardioSession, 'activity' | 'distanceMeters' | 'swim'>): number | null {
  return session.activity === 'swim' ? swimDistanceFromLaps(session) : session.distanceMeters;
}

export type CardioStatInput = Pick<CardioSession, 'activity' | 'localDate' | 'durationSeconds' | 'distanceMeters' | 'swim'>;
export type ActivityTotals = { activity: CardioSession['activity']; sessions: number; durationSeconds: number; distanceMeters: number | null };

/** Totales por actividad desde `fromDate` (incluida), de más a menos tiempo. La distancia es null si ninguna sesión la tiene. */
export function cardioTotalsByActivity(sessions: readonly CardioStatInput[], fromDate: string): ActivityTotals[] {
  const map = new Map<string, ActivityTotals>();
  for (const s of sessions) {
    if (s.localDate < fromDate) continue;
    const t = map.get(s.activity) ?? { activity: s.activity, sessions: 0, durationSeconds: 0, distanceMeters: null };
    const d = effectiveDistance(s);
    t.sessions += 1;
    t.durationSeconds += s.durationSeconds;
    if (d !== null) t.distanceMeters = (t.distanceMeters ?? 0) + d;
    map.set(s.activity, t);
  }
  return [...map.values()].sort((a, b) => b.durationSeconds - a.durationSeconds);
}

/** Distancia mínima para que un ritmo cuente como marca (evita "récords" de 200 m corriendo). */
export const MIN_DISTANCE_FOR_PACE: Partial<Record<CardioSession['activity'], number>> = { run: 1000, walk: 1000, row: 1000, bike: 5000, swim: 200 };

export type ActivityBests = {
  activity: CardioSession['activity'];
  longest: { distanceMeters: number; localDate: string } | null;
  /** Ritmo: s/km (s/100 m en natación). Menor es mejor. */
  fastest: { paceSeconds: number; distanceMeters: number; localDate: string } | null;
};

export function cardioBests(sessions: readonly CardioStatInput[]): ActivityBests[] {
  const map = new Map<string, ActivityBests>();
  for (const s of sessions) {
    const d = effectiveDistance(s);
    const b = map.get(s.activity) ?? { activity: s.activity, longest: null, fastest: null };
    if (d !== null && (!b.longest || d > b.longest.distanceMeters)) b.longest = { distanceMeters: d, localDate: s.localDate };
    const min = MIN_DISTANCE_FOR_PACE[s.activity];
    if (d !== null && min !== undefined && d >= min) {
      const pace = s.activity === 'swim' ? pacePer100mSeconds(s.durationSeconds, d) : paceSecondsPerKm(s.durationSeconds, d);
      if (pace !== null && (!b.fastest || pace < b.fastest.paceSeconds)) b.fastest = { paceSeconds: pace, distanceMeters: d, localDate: s.localDate };
    }
    map.set(s.activity, b);
  }
  return [...map.values()].filter((b) => b.longest || b.fastest);
}
