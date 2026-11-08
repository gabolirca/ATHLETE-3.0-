import { describe, expect, it } from 'vitest';
import { CreateTrainingBlockInput } from '@athlete/contracts';
import { HYBRID_ATHLETE_1_0 } from './hybridAthlete';
import { plannedDistanceMeters } from './types';

describe('Hybrid Athlete 1.0', () => {
  const t = HYBRID_ATHLETE_1_0;
  it('6 días de gimnasio, 3 de natación y descanso activo el domingo', () => {
    expect(t.sessions.filter((s) => s.modality === 'strength')).toHaveLength(4);
    expect(t.sessions.filter((s) => s.modality === 'conditioning')).toHaveLength(2);
    expect(t.sessions.filter((s) => s.modality === 'swim').map((s) => s.weekday)).toEqual([1, 3, 5]);
    expect(t.sessions.find((s) => s.weekday === 7)?.modality).toBe('mobility');
  });
  it('metros de natación como el plan original (1,400 / 1,200 / 1,500)', () => {
    expect(t.sessions.filter((s) => s.modality === 'swim').map(plannedDistanceMeters)).toEqual([1400, 1200, 1500]);
  });
  it('cada bloque es válido para el contrato (AMRAP con duración, etc.)', () => {
    for (const s of t.sessions) for (const [i, b] of s.blocks.entries()) {
      const parsed = CreateTrainingBlockInput.safeParse({
        id: '00000000-0000-7000-8000-000000000001', trainingDayId: '00000000-0000-7000-8000-000000000002', position: i, name: b.name, kind: b.kind,
        format: b.format, rounds: b.rounds ?? null, timeCapSeconds: b.timeCapSeconds ?? null, restSeconds: b.restSeconds ?? null, targetRpe: b.targetRpe ?? null, notes: b.notes ?? null,
      });
      expect(parsed.success, `${s.name} / ${b.name}`).toBe(true);
    }
  });
});
