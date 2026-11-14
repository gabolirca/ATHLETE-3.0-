import { atLocalTime, dayLabel, isLocalDate, monthGrid, shiftDay } from './localDate';

test('cuadrícula del mes empieza en lunes y completa semanas', () => {
  const nov = monthGrid(2026, 11); // 1-nov-2026 es domingo
  expect(nov[0]).toEqual([null, null, null, null, null, null, '2026-11-01']);
  expect(nov.flat().filter(Boolean)).toHaveLength(30);
  expect(nov.every((w) => w.length === 7)).toBe(true);
  expect(monthGrid(2028, 2).flat().filter(Boolean)).toHaveLength(29); // bisiesto
});

test('etiquetas y desplazamientos', () => {
  expect(dayLabel('2026-11-07', '2026-11-07')).toBe('Hoy');
  expect(dayLabel('2026-11-06', '2026-11-07')).toBe('Ayer');
  expect(dayLabel('2026-11-03', '2026-11-07')).toBe('martes 3 nov');
  expect(dayLabel('2025-12-31', '2026-11-07')).toBe('miércoles 31 dic 2025');
  expect(shiftDay('2026-01-01', -1)).toBe('2025-12-31');
  expect(atLocalTime('2026-11-06', 21, 45).getHours()).toBe(21);
  expect([isLocalDate('2026-11-06'), isLocalDate('6/11/2026'), isLocalDate(undefined)]).toEqual([true, false, false]);
});
