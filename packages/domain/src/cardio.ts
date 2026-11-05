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
