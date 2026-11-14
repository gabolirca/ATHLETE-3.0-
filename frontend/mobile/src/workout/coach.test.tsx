import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { SetEditor } from '@/components/SetEditor';
import { loadIncrementKg, upToSession } from '@/data/OfficialTrainingRepository';
import type { SessionExercise, WorkoutDetail } from '@/data/trainingTypes';
import { exerciseSuggestion, formatSuggestion, previousBestE1rm, workoutScore } from './coach';
import { ScoreCard } from './ScoreCard';

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('@/data/MobileTrainingContext', () => ({ useTrainingRepository: () => null }));

const set = (i: number, weightKg: number | null, reps: number | null, rir: number | null = null, isWarmup = false) => ({ id: `s${i}`, setIndex: i, weightKg, reps, rir, isWarmup });
const exercise = (over: Partial<SessionExercise> = {}): SessionExercise => ({
  id: 'se1', exerciseId: 'bench', exerciseName: 'Press de banca', sortOrder: 0, setsTarget: 3, repsTarget: 5, restSeconds: 120, targetRir: 2,
  sets: [], previous: { localDate: '2026-11-04', sets: [{ weightKg: 80, reps: 5, rir: 3 }, { weightKg: 80, reps: 5, rir: 3 }] }, incrementKg: 2.5, ...over,
});

test('sugerencia: usa la vez pasada, el objetivo de la rutina y el incremento del equipo', () => {
  expect(exerciseSuggestion(exercise())).toMatchObject({ weightKg: 82.5, reps: 5, action: 'increase' });
  expect(exerciseSuggestion(exercise({ incrementKg: 2, previous: { localDate: 'x', sets: [{ weightKg: 20, reps: 10, rir: 5 }] }, repsTarget: 10 }))).toMatchObject({ weightKg: 22 });
  expect(exerciseSuggestion(exercise({ previous: null }))).toBeNull();
  expect(formatSuggestion({ weightKg: 82.5, reps: 5 })).toBe('82.5 kg × 5');
  expect(formatSuggestion({ weightKg: null, reps: 13 })).toBe('13 reps');
  expect(previousBestE1rm(exercise())).toBeCloseTo(93.33, 1);
});

test('calificación de la sesión desde el detalle de la UI (calentamiento y borrador vacío no cuentan)', () => {
  const detail = { workout: {} as WorkoutDetail['workout'], exercises: [exercise({ sets: [set(0, 40, 10, null, true), set(1, 82.5, 5, 2), set(2, 82.5, 5, 2), set(3, 82.5, 5, 1), set(4, null, null)] })] };
  const score = workoutScore(detail)!;
  expect(score.components.map((c) => [c.key, c.points])).toEqual([['completion', 40], ['effort', 25], ['progress', 20], ['volume', 3.8]]);
  expect(score.score).toBe(89);
  expect(workoutScore({ ...detail, exercises: [exercise({ sets: [set(0, null, null)] })] })).toBeNull();
});

test('la tarjeta de calificación muestra el número, la nota y el porqué', async () => {
  const screen = await render(<ScoreCard score={{ score: 89, grade: 'Excelente', components: [{ key: 'completion', label: 'Cumplimiento', points: 40, max: 40, detail: '3 de 3 series del plan' }] }}/>);
  expect(screen.getByText('89')).toBeTruthy();
  expect(screen.getByText('Excelente')).toBeTruthy();
  expect(screen.getByText('3 de 3 series del plan')).toBeTruthy();
});

test('serie: el botón "Sugerido" llena peso y reps y guarda; los placeholders usan la sugerencia', async () => {
  const onSave = jest.fn().mockResolvedValue(undefined);
  const screen = await render(<SetEditor set={set(0, null, null)} previous={{ weightKg: 80, reps: 5 }} suggestion={{ weightKg: 82.5, reps: 5 }} onSave={onSave}/>);
  expect(screen.getByLabelText('Peso (kg)').props.placeholder).toBe('82.5');
  expect(screen.getByText('↻ Igual que la vez pasada · 80 kg × 5')).toBeTruthy();
  await fireEvent.press(screen.getByText('→ Sugerido · 82.5 kg × 5'));
  expect(onSave).toHaveBeenCalledWith({ weightKg: 82.5, reps: 5, rir: null, isWarmup: false });
});

test('historial hasta la sesión: una sesión vieja no se compara contra entrenamientos posteriores', () => {
  const h = (sessionId: string, localDate: string, completedAt: string | null) => ({ sessionId, localDate, completedAt, setType: 'working', weightKg: 80, reps: 5, rir: null, position: 0 });
  const sets = [h('a', '2026-11-01', '2026-11-01T10:00Z'), h('b', '2026-11-04', '2026-11-04T10:00Z'), h('c', '2026-11-04', '2026-11-04T18:00Z'), h('d', '2026-11-07', '2026-11-07T10:00Z')];
  expect(upToSession(sets, 'c').map((s) => s.sessionId)).toEqual(['a', 'b', 'c']);
  expect(upToSession(sets, 'b').map((s) => s.sessionId)).toEqual(['a', 'b']);
  expect(upToSession(sets, 'nueva').map((s) => s.sessionId)).toEqual(['a', 'b', 'c', 'd']);
});

test('incremento por equipo', () => {
  expect(loadIncrementKg('external', ['dumbbell', 'bench'])).toBe(2);
  expect(loadIncrementKg('external', ['barbell'])).toBe(2.5);
  expect(loadIncrementKg('bodyweight', ['pull-up-bar'])).toBeNull();
});
