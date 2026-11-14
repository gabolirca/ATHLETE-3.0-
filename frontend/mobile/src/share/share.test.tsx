import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { cardioCard, featuredBlock, sessionCard, weekCard, wodCard } from './shareData';
import type { Exercise, WorkoutDetail } from '@/data/trainingTypes';

const mockCapture = jest.fn().mockResolvedValue('file:///tmp/card.png');
const mockShare = jest.fn().mockResolvedValue(undefined);
jest.mock('react-native-view-shot', () => ({ captureRef: (...a: unknown[]) => mockCapture(...a) }));
jest.mock('expo-sharing', () => ({ isAvailableAsync: jest.fn().mockResolvedValue(true), shareAsync: (...a: unknown[]) => mockShare(...a) }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));

const set = (id: string, w: number | null, reps: number | null, warm = false) => ({ id, setIndex: 0, weightKg: w, reps, rir: null, isWarmup: warm, durationSeconds: null, distanceMeters: null });
const workout = { id: 's1', state: 'completed' as const, startedAt: '2026-11-07T15:00:00.000Z', completedAt: '2026-11-07T16:12:00.000Z', localVersion: null, serverVersion: 1, syncStatus: 'synced' as const, exerciseCount: 3, setCount: 6, durationMinutes: 72 };
const ex = (id: string, exerciseId: string, name: string, sets: ReturnType<typeof set>[], over: Record<string, unknown> = {}) =>
  ({ id, exerciseId, exerciseName: name, sortOrder: 0, setsTarget: null, repsTarget: null, restSeconds: null, sets, newRecords: [], previous: null, ...over });
const detail: WorkoutDetail = {
  workout, dayName: 'Hybrid Conditioning', sessionRpe: 8, trainingDayId: 'd',
  blocks: [{ id: 'c', name: 'C · AMRAP 15 min', kind: 'wod', format: 'amrap', rounds: null, timeCapSeconds: 900, restSeconds: null, targetRpe: 7.5, notes: null, result: { id: 'r', roundsCompleted: 6, extraReps: 4, durationSeconds: 900 } }],
  exercises: [
    ex('a', 'gob', 'Sentadilla goblet', [set('1', 24, 12), set('2', 24, 12), set('w', 10, 10, true)], { newRecords: [{ kind: 'max_weight', value: 24, weightKg: 24, reps: 12 }] }),
    ex('b', 'wb', 'Wall ball', [], { blockId: 'c', repsTarget: 12, repsMax: 12 }),
    ex('c', 'row', 'Remo ergómetro', [], { blockId: 'c', targetDistanceMeters: 200 }),
  ],
};
const catalog = new Map<string, Exercise>([['gob', { id: 'gob', name: 'Sentadilla goblet', muscleGroup: '', equipment: null, origin: 'sample', muscleRoles: { primary: [{ slug: 'quadriceps', name: 'Cuádriceps' }, { slug: 'glutes', name: 'Glúteos' }], secondary: [{ slug: 'core', name: 'Core' }] } }]]);

test('tarjeta de WOD: "6+4", receta y +1 ronda vs la vez pasada', () => {
  const block = featuredBlock(detail)!;
  const data = wodCard(detail, block, { roundsCompleted: 5, extraReps: 10, durationSeconds: 900 });
  expect(data).toMatchObject({ big: '6+4', unit: 'rondas + reps', delta: '+1 ronda vs la vez pasada', blockLabel: 'AMRAP 15 min', rpe: 8, durationMin: 72, load: 576 });
  expect(data.recipe).toEqual(['12 wall ball', '200 m remo ergómetro']);
  expect(wodCard(detail, block, { roundsCompleted: 6, extraReps: 1, durationSeconds: 900 }).delta).toBe('+3 reps vs la vez pasada');
  expect(wodCard(detail, block, null).delta).toBeNull();
});

test('tarjeta de sesión: series efectivas, volumen, músculos y récord', () => {
  const data = sessionCard(detail, catalog);
  expect(data).toMatchObject({ title: 'Hybrid Conditioning', sets: 2, volumeKg: 576, load: 576, record: 'Sentadilla goblet 24 kg × 12' });
  expect(data.muscles.map((m) => [m.name, m.sets])).toEqual([['Cuádriceps', 2], ['Glúteos', 2], ['Core', 1]]);
});

test('tarjeta de cardio y de semana', () => {
  const c = cardioCard({ id: 'x', activity: 'swim', startedAt: '2026-11-09T13:00:00Z', localDate: '2026-11-09', durationSeconds: 2400, distanceMeters: 1500, rounds: null, rpe: 5, avgHeartRateBpm: null, maxHeartRateBpm: null, swim: null, notes: 'Natación · Aeróbica — Continuo: 1/1 ✓', syncStatus: 'synced' }, 'metric');
  expect(c).toMatchObject({ title: 'Natación · Aeróbica', big: '1500', unit: 'm' });
  expect(c.stats).toEqual([['tiempo', '40:00'], ['ritmo', '2:40 /100 m'], ['RPE', '5'], ['carga', '200']]);
  const day = (id: string, weekday: number, modality: 'strength' | 'swim') => ({ id, name: id, weekday, modality, targetRpe: null, targetDurationMinutes: 60, notes: null, blocks: [] });
  const w = weekCard({ id: 'p', name: 'Hybrid Athlete 1.0', templateSlug: null, days: [day('a', 1, 'strength'), day('b', 1, 'swim'), day('c', 2, 'strength')] }, { a: { workoutId: '1' }, b: { cardioId: '2' } }, { swimMeters: 1400, runMeters: 0, strengthSets: 18, load: 900 });
  expect(w.done).toBe(2);
  expect(w.days[0]!.bars.map((b) => b.done)).toEqual([true, true]);
  expect(w.stats).toEqual([['sesiones', '2 / 3'], ['nadé', '1.4 km'], ['fuerza', '18 series'], ['carga', '900']]);
});

const mockRepository = {
  getWorkout: jest.fn().mockResolvedValue(detail), searchExercises: jest.fn().mockResolvedValue([...catalog.values()]),
  previousBlockResult: jest.fn().mockResolvedValue({ roundsCompleted: 5, extraReps: 0, durationSeconds: 900 }), listPrograms: jest.fn().mockResolvedValue([]),
};
jest.mock('expo-router', () => {
  const { useEffect } = jest.requireActual('react');
  return { useRouter: () => ({ back: jest.fn(), push: jest.fn() }), useLocalSearchParams: () => ({ kind: 'session', id: 's1' }), useFocusEffect: (cb: () => void) => useEffect(cb, [cb]) };
});
jest.mock('@/data/MobileTrainingContext', () => ({ useTrainingRepository: () => mockRepository }));
import ShareScreen from '../../app/share/[kind]/[id]';

test('pantalla de compartir: elige la tarjeta del WOD, cambia a resumen y comparte una imagen 1080 × 1920', async () => {
  const screen = await render(<ShareScreen/>);
  await waitFor(() => expect(screen.getByText('6+4')).toBeTruthy());
  expect(screen.getByText('↗ +1 ronda vs la vez pasada')).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('Resumen de la sesión'));
  expect(screen.getByText(/Récord: Sentadilla goblet 24 kg × 12/)).toBeTruthy();
  await fireEvent.press(screen.getByText('Compartir imagen'));
  await waitFor(() => expect(mockShare).toHaveBeenCalledWith('file:///tmp/card.png', expect.objectContaining({ mimeType: 'image/png' })));
  expect(mockCapture.mock.calls[0][1]).toMatchObject({ format: 'png', width: 1080, height: 1920 });
});
