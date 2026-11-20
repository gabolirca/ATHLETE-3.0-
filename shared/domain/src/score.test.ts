import { describe, expect, it } from 'vitest';
import { scoreSession, type ScoreSet } from './score';

const w = (weightKg: number, reps: number, rir: number | null = null): ScoreSet => ({ setType: 'working', weightKg, reps, rir, completedAt: 'x', deletedAt: null });
const warm: ScoreSet = { setType: 'warmup', weightKg: 40, reps: 10, rir: null, completedAt: 'x', deletedAt: null };

describe('scoreSession', () => {
  it('sesión de rutina completa, esfuerzo en objetivo y progreso → 100', () => {
    const r = scoreSession([
      { setsTarget: 3, targetRir: 2, previousBestE1rm: 90, sets: [warm, w(80, 5, 2), w(80, 5, 2), w(80, 5, 1)] },
      { setsTarget: 3, targetRir: 2, previousBestE1rm: 60, sets: [w(50, 8, 2), w(50, 8, 3), w(50, 8, 2)] },
      { setsTarget: 3, targetRir: null, previousBestE1rm: null, sets: [w(20, 12, 1), w(20, 12, 2), w(20, 12, 2), w(20, 12, 2), w(20, 12, 2), w(20, 12, 2)] },
    ])!;
    expect(r.score).toBe(100);
    expect(r.grade).toBe('Excelente');
    expect(r.components.map((c) => [c.key, c.points, c.detail])).toEqual([
      ['completion', 40, '9 de 9 series del plan'],
      ['effort', 25, '12 de 12 series cerca de tu objetivo de esfuerzo'],
      ['progress', 20, '2 de 2 ejercicios igualaron o superaron la vez pasada'],
      ['volume', 15, '12 series efectivas'],
    ]);
  });
  it('a medias: falta plan, series lejos del fallo y bajó el rendimiento', () => {
    const r = scoreSession([{ setsTarget: 4, targetRir: 1, previousBestE1rm: 100, sets: [w(70, 5, 5), w(70, 5, 2)] }])!;
    // cumplimiento 20/40, esfuerzo 12.5/25, progreso 0/20, volumen 2.5/15 → 35/100
    expect(r.components.map((c) => c.points)).toEqual([20, 12.5, 0, 2.5]);
    expect(r.score).toBe(35);
    expect(r.grade).toBe('Ligera');
  });
  it('sesión libre sin RIR ni historial: solo volumen, reescalado a 100', () => {
    const r = scoreSession([{ setsTarget: null, targetRir: null, previousBestE1rm: null, sets: [w(60, 10), w(60, 10), w(60, 10)] }])!;
    expect(r.components.map((c) => c.key)).toEqual(['volume']);
    expect(r.score).toBe(25);
  });
  it('sin series efectivas no hay calificación', () => {
    expect(scoreSession([{ setsTarget: 3, targetRir: 2, previousBestE1rm: null, sets: [warm] }])).toBeNull();
  });
});
