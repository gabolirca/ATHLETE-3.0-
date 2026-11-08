import { cardioActivityFor, cardioPlanText, daySummary, formatBlock, formatPrescription, todayWeekday, weekdayLabel } from './format';
import type { ProgramDay } from '@/data/trainingTypes';

const ex = (o: Partial<Parameters<typeof formatPrescription>[0]>) => ({ sets: null, repsMin: null, repsMax: null, durationSeconds: null, distanceMeters: null, perSide: false, ...o });

test('prescripciones como en el plan', () => {
  expect(formatPrescription(ex({ sets: 3, repsMin: 5, repsMax: 6 }))).toBe('3 × 5–6');
  expect(formatPrescription(ex({ sets: 3, repsMin: 8, repsMax: 8, perSide: true }))).toBe('3 × 8 por lado');
  expect(formatPrescription(ex({ sets: 3, durationSeconds: 40 }))).toBe('3 × 40 s');
  expect(formatPrescription(ex({ sets: 4, distanceMeters: 50 }))).toBe('4 × 50 m');
  expect(formatPrescription(ex({ distanceMeters: 400 }))).toBe('400 m');
  expect(formatPrescription(ex({ durationSeconds: 300 }))).toBe('5 min');
  expect(formatPrescription(ex({ repsMin: 12, repsMax: 12 }))).toBe('12');
});

test('formato del bloque', () => {
  const b = { rounds: null, timeCapSeconds: null, restSeconds: null, targetRpe: null };
  expect(formatBlock({ ...b, format: 'amrap', timeCapSeconds: 900, targetRpe: 7.5 })).toBe('AMRAP 15 min · RPE 7.5');
  expect(formatBlock({ ...b, format: 'rounds', rounds: 3, restSeconds: 90 })).toBe('3 rondas · descanso 1:30 entre rondas');
  expect(formatBlock({ ...b, format: 'for_time' })).toBe('Por tiempo');
  expect(formatBlock({ ...b, format: 'sets' })).toBe('Series');
});

test('días, cardio y resumen', () => {
  expect(weekdayLabel(3)).toBe('Miércoles');
  expect(todayWeekday(new Date(2026, 10, 8))).toBe(7); // domingo
  expect(todayWeekday(new Date(2026, 10, 9))).toBe(1);
  expect(cardioActivityFor('swim')).toBe('swim');
  expect(cardioActivityFor('conditioning')).toBeNull();
  const swim: ProgramDay = { id: 'd', name: 'Natación', weekday: 1, modality: 'swim', targetRpe: 3.5, targetDurationMinutes: 50, notes: null, blocks: [
    { id: 'b1', name: 'Calentamiento', kind: 'warmup', format: 'continuous', rounds: null, timeCapSeconds: null, restSeconds: null, targetRpe: null, notes: null,
      exercises: [{ id: 'e', exerciseId: 'x', exerciseName: 'Natación (libre)', modality: 'cardio', loadType: 'time', ...ex({ distanceMeters: 200 }), restSeconds: null, targetRpe: null, notes: null }] },
    { id: 'b2', name: 'Técnica', kind: 'swim', format: 'intervals', rounds: null, timeCapSeconds: null, restSeconds: null, targetRpe: null, notes: null,
      exercises: [{ id: 'f', exerciseId: 'y', exerciseName: 'Drills', modality: 'cardio', loadType: 'time', ...ex({ sets: 4, distanceMeters: 50 }), restSeconds: 20, targetRpe: null, notes: null }] },
  ] };
  expect(daySummary(swim)).toBe('400 m · 50 min · RPE 3.5');
  expect(cardioPlanText(swim)).toEqual(['Calentamiento: 200 m', 'Técnica: 4 × 50 m (desc. 20 s)']);
});
