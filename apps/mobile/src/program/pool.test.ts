import type { ProgramDay } from '@/data/trainingTypes';
import { poolDraft, poolItems, poolTotals } from './pool';

const e = (id: string, name: string, o: Record<string, unknown>) => ({ id, exerciseId: id, exerciseName: name, modality: 'cardio' as const, loadType: 'time', sets: null, repsMin: null, repsMax: null, durationSeconds: null, distanceMeters: null, restSeconds: null, perSide: false, targetRpe: null, notes: null, ...o });
const b = (id: string, name: string, format: 'continuous' | 'intervals', exercises: ReturnType<typeof e>[]) => ({ id, name, kind: 'swim', format, rounds: null, timeCapSeconds: null, restSeconds: null, targetRpe: null, notes: null, exercises });
const day: ProgramDay = { id: 'd', name: 'Natación · Técnica', weekday: 3, modality: 'swim', targetRpe: 4.5, targetDurationMinutes: 45, notes: null, blocks: [
  b('w', 'Calentamiento', 'continuous', [e('a', 'Natación (libre)', { distanceMeters: 200 })]),
  b('t', 'Drills', 'intervals', [e('c', 'Natación técnica (drills)', { sets: 4, distanceMeters: 50, restSeconds: 20 })]),
] };

test('cada serie de un intervalo es una casilla; el descanso no va después de la última', () => {
  const items = poolItems(day);
  expect(items.map((i) => i.label)).toEqual(['Natación (libre) · 200 m', 'Natación técnica (drills) · 1 de 4 · 50 m', 'Natación técnica (drills) · 2 de 4 · 50 m', 'Natación técnica (drills) · 3 de 4 · 50 m', 'Natación técnica (drills) · 4 de 4 · 50 m']);
  expect(items.map((i) => i.restSeconds)).toEqual([null, 20, 20, 20, null]);
});

test('totales y actividad guardada: metros hechos, tiempo real, RPE, ligada al día y con el detalle', () => {
  const items = poolItems(day);
  const progress = { startedAt: Date.parse('2026-11-09T07:00:00Z'), done: { [items[0]!.key]: { at: 1, seconds: null }, [items[1]!.key]: { at: 2, seconds: 52 }, [items[2]!.key]: { at: 3, seconds: null } } };
  expect(poolTotals(items, progress)).toEqual({ plannedMeters: 400, doneMeters: 300, doneCount: 3, total: 5 });
  const draft = poolDraft(day, items, progress, Date.parse('2026-11-09T07:40:00Z'), 5, 'America/Mexico_City');
  expect(draft).toMatchObject({ activity: 'swim', durationSeconds: 2400, distanceMeters: 300, rpe: 5, trainingDayId: 'd', swim: { poolType: 'pool', poolLengthMeters: 25, laps: 12 } });
  expect(draft.notes).toBe('Natación · Técnica — Calentamiento: 1/1 ✓ · Drills: 2/4');
});
