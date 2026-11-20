import { describe, expect, it } from 'vitest';
import { diagnoseWeeklyVolume, plannedSetsByMuscle, volumeStatus, weeklySetsByMuscle } from './volume';

const set = (over: Partial<{ setType: 'working' | 'warmup'; reps: number | null; completedAt: string | null; deletedAt: string | null }> = {}) => ({
  setType: 'working' as const, weightKg: 80, reps: 5, completedAt: '2026-11-08T10:00:00Z', deletedAt: null, ...over,
});
const muscles: Record<string, { primary: string[]; secondary: string[] }> = {
  bench: { primary: ['chest'], secondary: ['shoulders', 'triceps'] },
  dip: { primary: ['triceps', 'chest'], secondary: ['shoulders'] },
};

describe('weeklySetsByMuscle', () => {
  it('cuenta 1 por serie al músculo principal y 0.5 al secundario; ignora calentamiento, borradas y sin reps', () => {
    const v = weeklySetsByMuscle([{ exercises: [
      { exerciseId: 'bench', sets: [set(), set(), set(), set({ setType: 'warmup' }), set({ deletedAt: 'x' }), set({ reps: 0 }), set({ completedAt: null })] },
    ] }], (id) => muscles[id]);
    expect(Object.fromEntries(v)).toEqual({ chest: 3, shoulders: 1.5, triceps: 1.5 });
  });
  it('suma entre sesiones y no cuenta doble un músculo que es principal y secundario', () => {
    const v = weeklySetsByMuscle([
      { exercises: [{ exerciseId: 'bench', sets: [set(), set()] }] },
      { exercises: [{ exerciseId: 'dip', sets: [set(), set()] }, { exerciseId: 'desconocido', sets: [set()] }] },
    ], (id) => muscles[id]);
    expect(Object.fromEntries(v)).toEqual({ chest: 4, shoulders: 2, triceps: 3 });
  });
});

describe('diagnoseWeeklyVolume', () => {
  it('marca bajo / en rango / alto con la referencia y avisa de músculos sin series', () => {
    expect(volumeStatus('chest', 9)).toBe('low');
    expect(volumeStatus('chest', 10)).toBe('ok');
    expect(volumeStatus('chest', 21)).toBe('high');
    expect(volumeStatus('forearms', 30)).toBe('untracked');
    const d = diagnoseWeeklyVolume(new Map([['chest', 12], ['forearms', 2.25], ['back', 25]]));
    expect(d[0]).toEqual({ muscle: 'back', sets: 25, status: 'high', range: [10, 20] });
    expect(d[1]).toMatchObject({ muscle: 'chest', status: 'ok' });
    expect(d.find((m) => m.muscle === 'forearms')).toEqual({ muscle: 'forearms', sets: 2.5, status: 'untracked', range: null });
    expect(d.find((m) => m.muscle === 'quadriceps')).toMatchObject({ sets: 0, status: 'low' });
    expect(d.find((m) => m.muscle === 'adductors')).toBeUndefined();
  });
});

describe('plannedSetsByMuscle', () => {
  it('suma las series del plan por músculo y multiplica por la frecuencia semanal', () => {
    const items = [{ exerciseId: 'bench', sets: 4 }, { exerciseId: 'dip', sets: 3 }, { exerciseId: 'x', sets: 3 }, { exerciseId: 'bench', sets: null }];
    expect(Object.fromEntries(plannedSetsByMuscle(items, (id) => muscles[id]))).toEqual({ chest: 7, shoulders: 3.5, triceps: 5 });
    expect(Object.fromEntries(plannedSetsByMuscle(items, (id) => muscles[id], 2))).toEqual({ chest: 14, shoulders: 7, triceps: 10 });
  });
});
