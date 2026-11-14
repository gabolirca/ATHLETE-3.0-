import React from 'react';
import { render } from '@testing-library/react-native';
import { NewRecordBadge, RecordCard, formatKg } from './records';

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));

test('el 1RM estimado se redondea a 0.5 kg; el PR real se muestra tal cual', () => {
  expect(formatKg(93.333, true)).toBe('93.5');
  expect(formatKg(100.2, true)).toBe('100');
  expect(formatKg(92.25)).toBe('92.25');
});

test('tarjeta de récords: PR con reps y 1RM estimado con su serie de origen', async () => {
  const screen = await render(<RecordCard record={{ exerciseId: 'e', exerciseName: 'Press de banca', weightKg: 90, reps: 1, measuredAt: '2026-11-03T12:00:00.000Z', e1rm: { valueKg: 93.33, weightKg: 80, reps: 5, localDate: '2026-11-01' } }}/>);
  expect(screen.getByText('Press de banca')).toBeTruthy();
  expect(screen.getByText(/× 1 rep ·/)).toBeTruthy();
  expect(screen.getByText('de 80 kg × 5')).toBeTruthy();
});

test('sin una serie útil no se inventa el 1RM estimado', async () => {
  const screen = await render(<RecordCard record={{ exerciseId: 'e', exerciseName: 'Dominadas', weightKg: 10, reps: 15, measuredAt: '2026-11-03T12:00:00.000Z', e1rm: null }}/>);
  expect(screen.getByText('Necesita una serie de 1 a 12 reps con peso.')).toBeTruthy();
});

test('aviso de nuevo récord en el entrenamiento', async () => {
  const screen = await render(<NewRecordBadge records={[{ kind: 'max_weight', value: 92.5, weightKg: 92.5, reps: 1 }, { kind: 'best_e1rm', value: 95.1, weightKg: 85, reps: 4 }]}/>);
  expect(screen.getByText('¡Nuevo récord!')).toBeTruthy();
  expect(screen.getByText('PR de peso: 92.5 kg × 1 · 1RM estimado: 95 kg')).toBeTruthy();
  const empty = await render(<NewRecordBadge records={[]}/>);
  expect(empty.queryByText('¡Nuevo récord!')).toBeNull();
});
