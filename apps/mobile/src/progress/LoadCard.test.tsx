import React from 'react';
import { render } from '@testing-library/react-native';
import { LoadCard, loadMessage } from './LoadCard';
import type { WeeklyLoad } from '@/data/trainingTypes';

const week = (weekStart: string, strength: number, conditioning = 0, cardio = 0, missingRpe = 0) =>
  ({ weekStart, total: strength + conditioning + cardio, byKind: { strength, conditioning, cardio }, sessions: 3, missingRpe });

test('carga semanal apilada y aviso de pico', async () => {
  const load: WeeklyLoad = { weeks: [week('2026-10-19', 1000), week('2026-10-26', 1100, 300), week('2026-11-02', 900, 200, 200), week('2026-11-09', 1500, 600, 400, 1)], trend: { ratio: 1.95, status: 'spike' } };
  const screen = await render(<LoadCard load={load}/>);
  expect(screen.getByText(/2,500|2\.500|2500/)).toBeTruthy();
  expect(screen.getByText('Esta semana llevas 1.95× tu carga promedio. Cuida la recuperación: baja la intensidad o planea una semana de descarga.')).toBeTruthy();
  expect(screen.getByText(/1 sesión no tiene RPE/)).toBeTruthy();
});

test('mensajes sin datos suficientes', () => {
  expect(loadMessage({ weeks: [week('2026-11-09', 0, 0, 0, 2)], trend: { ratio: null, status: 'low_data' } })).toBe('Anota el RPE al terminar cada sesión para calcular tu carga.');
  expect(loadMessage({ weeks: [week('2026-11-09', 300)], trend: { ratio: null, status: 'low_data' } })).toMatch(/3 semanas/);
});
