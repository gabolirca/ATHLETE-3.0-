import type { BodyMeasurement, ExerciseRecord } from '@/data/trainingTypes';
import { bodyTrend, chartPath, monthSummary, recentRecords, weeklyGoal, weeklySessions } from './progressView';

const m = (value: number, measuredAt: string): BodyMeasurement => ({ id: measuredAt, type: 'weight_kg', value, unit: 'kg', measuredAt, localVersion: null, serverVersion: null, syncStatus: 'synced' });

test('meta semanal de la bienvenida (4 por defecto)', () => {
  expect(weeklyGoal(['Bajar grasa', '5 días por semana'])).toBe(5);
  expect(weeklyGoal([])).toBe(4);
});

test('récords: los más nuevos primero', () => {
  const r = (name: string, measuredAt: string) => ({ exerciseId: name, exerciseName: name, weightKg: 100, reps: 5, measuredAt, e1rm: null }) as ExerciseRecord;
  expect(recentRecords([r('a', '2026-11-01'), r('b', '2026-11-14'), r('c', '2026-11-10')]).map((x) => x.exerciseName)).toEqual(['b', 'c', 'a']);
});

test('tendencia de peso: último, cambio en 8 semanas y la línea con su meta', () => {
  const now = new Date('2026-11-16T12:00:00Z');
  const t = bodyTrend([m(78.4, '2026-09-21T12:00:00Z'), m(77.5, '2026-10-19T12:00:00Z'), m(76.2, '2026-11-15T12:00:00Z'), m(80, '2026-01-01T12:00:00Z')], 'weight_kg', now)!;
  expect(t).toMatchObject({ latest: 76.2, change: -2.2, weeks: 8, points: [78.4, 77.5, 76.2] });
  const p = chartPath(t.points, 75, 300, 100);
  expect(p.line.split(' ')).toHaveLength(3);
  expect(p.goalY).toBe(92); // la meta es lo más bajo: queda abajo
  expect(bodyTrend([], 'weight_kg', now)).toBeNull();
});

describe('gráfica de semanas y resumen del mes', () => {
  test('cuenta sesiones por semana de lunes a domingo; la actual al final', () => {
    // jueves 19-nov-2026: su semana empieza el lunes 16
    const w = weeklySessions(['2026-11-16', '2026-11-19', '2026-11-19', '2026-11-15', '2026-09-01'], '2026-11-19', 3);
    expect(w.map((x) => [x.start, x.count, x.current])).toEqual([['2026-11-02', 0, false], ['2026-11-09', 1, false], ['2026-11-16', 3, true]]);
    expect(w[0]!.label).toBe('2 nov');
    const m = monthSummary({ workouts: [{ localDate: '2026-11-03', sets: 20 }, { localDate: '2026-10-30', sets: 9 }], cardioDates: ['2026-11-04'], recordDates: ['2026-11-03', '2026-10-01'] }, '2026-11-19');
    expect(m).toEqual({ sessions: 2, sets: 20, records: 1, monthName: 'noviembre' });
  });
});
