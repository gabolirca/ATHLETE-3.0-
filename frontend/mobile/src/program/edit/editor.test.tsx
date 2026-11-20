import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import type { Exercise, Program } from '@/data/trainingTypes';
import { parseBlockForm } from './BlockSheet';
import { parseExerciseForm, similarExercises } from './ExerciseSheet';

const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn() };
const mockParams: Record<string, string> = { dayId: 'd1' };
const ex = (id: string, name: string, pattern: string, primary: string[], modality: 'strength' | 'cardio' = 'strength'): Exercise => ({
  id, name, muscleGroup: primary.join(', '), equipment: 'Barra', origin: 'sample', movementPattern: pattern, modality, loadType: modality === 'cardio' ? 'time' : 'external',
  muscleRoles: { primary: primary.map((slug) => ({ slug, name: slug })), secondary: [] },
});
const CATALOG = [ex('sq', 'Sentadilla trasera', 'squat', ['quadriceps']), ex('fs', 'Sentadilla frontal', 'squat', ['quadriceps']), ex('lp', 'Prensa de piernas', 'squat', ['quadriceps']),
  ex('le', 'Extensión de cuádriceps', 'knee_extension', ['quadriceps']), ex('bp', 'Press de banca', 'horizontal_push', ['chest']), ex('row', 'Remo ergómetro', 'locomotion', ['full-body'], 'cardio')];
const program = (): Program => ({ id: 'p', name: 'Híbrido 3 días', templateSlug: 'hibrido-3-dias', days: [{
  id: 'd1', name: 'Cuerpo completo A', weekday: 1, modality: 'strength', targetRpe: 7.5, targetDurationMinutes: 60, notes: null,
  blocks: [{ id: 'b1', name: 'Fuerza', kind: 'strength', format: 'sets', rounds: null, timeCapSeconds: null, restSeconds: null, targetRpe: null, notes: null, exercises: [
    { id: 'pe1', exerciseId: 'sq', exerciseName: 'Sentadilla trasera', modality: 'strength', loadType: 'external', sets: 3, repsMin: 6, repsMax: 8, durationSeconds: null, distanceMeters: null, restSeconds: 150, perSide: false, targetRpe: null, notes: null },
  ] }],
}] });
const mockRepository = {
  listPrograms: jest.fn(async () => [program()]), programWeekStatus: jest.fn().mockResolvedValue({}), searchExercises: jest.fn().mockResolvedValue(CATALOG),
  updateProgramExercise: jest.fn().mockResolvedValue(undefined), addProgramBlock: jest.fn().mockResolvedValue('b2'), addProgramExercise: jest.fn().mockResolvedValue('x'),
  updateProgramDay: jest.fn().mockResolvedValue(undefined), removeProgramExercise: jest.fn(), updateProgramBlock: jest.fn(), deleteProgramBlock: jest.fn(), duplicateProgramDay: jest.fn(), deleteProgramDay: jest.fn(),
};
jest.mock('expo-router', () => {
  const { useEffect } = jest.requireActual('react');
  return { useRouter: () => mockRouter, useLocalSearchParams: () => mockParams, useFocusEffect: (cb: () => void) => useEffect(cb, [cb]) };
});
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('@/data/MobileTrainingContext', () => ({ useTrainingRepository: () => mockRepository }));

import DayScreen from '../../../app/program/day/[dayId]';

beforeEach(() => jest.clearAllMocks());

test('reemplazos parecidos: mismo patrón primero, luego mismo músculo; nunca cardio por fuerza', () => {
  expect(similarExercises(CATALOG[0], CATALOG).map((e) => e.name)).toEqual(['Prensa de piernas', 'Sentadilla frontal', 'Extensión de cuádriceps']);
  expect(similarExercises(undefined, CATALOG)).toEqual([]);
});

test('validación del ejercicio y del bloque', () => {
  expect(parseExerciseForm(false, { sets: '4', repsMin: '6', repsMax: '', time: '', meters: '', rest: 120, perSide: true }))
    .toEqual({ ok: true, patch: { sets: 4, repsMin: 6, repsMax: 6, restSeconds: 120, perSide: true } });
  expect(parseExerciseForm(false, { sets: '3', repsMin: '10', repsMax: '8', time: '', meters: '', rest: null, perSide: false })).toMatchObject({ ok: false });
  expect(parseExerciseForm(true, { sets: '6', repsMin: '', repsMax: '', time: '1:30', meters: '400', rest: 90, perSide: false }))
    .toEqual({ ok: true, patch: { sets: 6, durationSeconds: 90, distanceMeters: 400, repsMin: null, repsMax: null, restSeconds: 90, perSide: false } });
  expect(parseBlockForm({ name: 'WOD', format: 'amrap', rounds: '', minutes: '', rest: '', rpe: null })).toEqual({ ok: false, error: 'Indica cuántos minutos dura el bloque.' });
  expect(parseBlockForm({ name: 'WOD', format: 'amrap', rounds: '5', minutes: '12', rest: '60', rpe: 8 }))
    .toEqual({ ok: true, value: { name: 'WOD', format: 'amrap', rounds: null, timeCapSeconds: 720, restSeconds: null, targetRpe: 8, notes: null } });
});

test('editar el día: cambiar sentadilla por frontal 5×5 y agregar un bloque AMRAP', async () => {
  const screen = await render(<DayScreen/>);
  await waitFor(() => expect(screen.getByText('Cuerpo completo A')).toBeTruthy());
  await fireEvent.press(screen.getByLabelText('Editar sesión'));
  await fireEvent.press(screen.getByLabelText('Editar Sentadilla trasera'));
  await waitFor(() => expect(screen.getByLabelText('Cambiar por Sentadilla frontal')).toBeTruthy());
  await fireEvent.press(screen.getByLabelText('Cambiar por Sentadilla frontal'));
  expect(screen.getByText('Se cambiará Sentadilla trasera → Sentadilla frontal')).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('Series × reps: 5×5'));
  await fireEvent.press(screen.getByText('Guardar'));
  await waitFor(() => expect(mockRepository.updateProgramExercise).toHaveBeenCalledWith('pe1', { exerciseId: 'fs', sets: 5, repsMin: 5, repsMax: 5, restSeconds: 150, perSide: false }));

  await fireEvent.press(screen.getByText('＋ Agregar bloque'));
  await fireEvent.changeText(screen.getByLabelText('Nombre'), 'Finisher');
  await fireEvent.press(screen.getByLabelText('Formato: AMRAP'));
  await fireEvent.changeText(screen.getByLabelText('Duración (min)'), '8');
  await fireEvent.press(screen.getByText('Agregar bloque'));
  await waitFor(() => expect(mockRepository.addProgramBlock).toHaveBeenCalledWith('d1', { name: 'Finisher', format: 'amrap', rounds: null, timeCapSeconds: 480, restSeconds: null, targetRpe: null, notes: null }));
});
