import React from 'react';
import { render } from '@testing-library/react-native';
import { AdherenceCard, BenchmarksCard, CycleCard, benchmarkValue } from './HybridProgress';
import { StreakCard, streakMessage } from './StreakCard';
import type { StreakSummary } from '@/data/trainingTypes';

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));

const streak = (days: Partial<StreakSummary['days']>, extra: Partial<StreakSummary> = {}): StreakSummary =>
  ({ days: { current: 0, best: 0, todayDone: false, atRisk: false, daysSinceLast: null, ...days }, weeks: null, programName: null, ...extra });

test('mensajes de racha: hoy hecho, en riesgo, descanso y días sin entrenar', () => {
  expect(streakMessage(streak({ current: 6, todayDone: true }))).toBe('¡Hoy ya entrenaste! Racha asegurada.');
  expect(streakMessage(streak({ current: 6, atRisk: true }, { programName: 'Hybrid Athlete 1.0' }))).toBe('Hoy te toca entrenar: hazlo para no perder tu racha.');
  expect(streakMessage(streak({ current: 6 }, { programName: 'H' }))).toBe('Hoy es descanso en tu programa: la racha sigue.');
  expect(streakMessage(streak({ current: 0, daysSinceLast: 4 }))).toBe('Llevas 4 días sin entrenar. Hoy es buen día para volver.');
});

test('tarjeta de racha con mejor marca y semanas cumplidas', async () => {
  const screen = await render(<StreakCard streak={streak({ current: 12, best: 20, todayDone: true }, { weeks: { current: 3, best: 3 }, programName: 'H' })}/>);
  expect(screen.getByLabelText('Racha de 12 días')).toBeTruthy();
  expect(screen.getByText('de racha · tu mejor: 20')).toBeTruthy();
  expect(screen.getByText('3')).toBeTruthy();
});

test('la "A" del logo se enciende con racha y queda gris sin racha', async () => {
  const on = await render(<StreakCard streak={streak({ current: 2, todayDone: true })}/>);
  expect(on.getByTestId('streak-a-lit', { includeHiddenElements: true })).toBeTruthy();
  const off = await render(<StreakCard streak={streak({ current: 0 })}/>);
  expect(off.getByTestId('streak-a-off', { includeHiddenElements: true })).toBeTruthy();
});

test('ciclo: semana 6 es descarga; cumplimiento y benchmarks', async () => {
  const program = { id: 'p', name: 'Hybrid Athlete 1.0', templateSlug: null, days: [], startedOn: '2026-10-05' };
  const cycle = await render(<CycleCard program={program} load={null} today="2026-11-10"/>);
  expect(cycle.getByText(/Semana 6/)).toBeTruthy();
  expect(cycle.getByText(/Toca semana de descarga/)).toBeTruthy();
  const adherence = await render(<AdherenceCard weeks={[{ weekStart: '2026-10-26', done: 9, planned: 10 }, { weekStart: '2026-11-02', done: 6, planned: 10 }, { weekStart: '2026-11-09', done: 2, planned: 10 }]}/>);
  expect(adherence.getByText(/Esta semana: 2 de 10\. Promedio de semanas anteriores: 75 %/)).toBeTruthy();
  expect(benchmarkValue('amrap', { roundsCompleted: 6, extraReps: 4, durationSeconds: null })).toBe('6+4');
  expect(benchmarkValue('for_time', { roundsCompleted: null, extraReps: null, durationSeconds: 1450 })).toBe('24:10');
  const bench = await render(<BenchmarksCard items={[{ key: 'a', name: 'C · AMRAP 15 min', dayName: 'Hybrid Conditioning', format: 'amrap', trend: 'up', points: [
    { localDate: '2026-10-31', roundsCompleted: 5, extraReps: 10, durationSeconds: 900 }, { localDate: '2026-11-07', roundsCompleted: 6, extraReps: 4, durationSeconds: 900 }] }]}/>);
  expect(bench.getByText('AMRAP 15 min')).toBeTruthy();
  expect(bench.getByText('6+4 ↗')).toBeTruthy();
  expect(bench.getByText('Hybrid Conditioning · 2 veces')).toBeTruthy();
});
