import { weekDays } from './week';

test('semana de lunes a domingo con los días entrenados y el de hoy', () => {
  const w = weekDays(['2026-11-16', '2026-11-18', '2026-11-09'], new Date(2026, 10, 18, 9)); // miércoles
  expect(w.map((d) => d.localDate)).toEqual(['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20', '2026-11-21', '2026-11-22']);
  expect(w.map((d) => d.done)).toEqual([true, false, true, false, false, false, false]);
  expect(w.findIndex((d) => d.today)).toBe(2);
  expect(weekDays([], new Date(2026, 10, 22, 9))[6]!.today).toBe(true); // domingo sigue siendo la misma semana
});

import { shouldCelebrate, streakCheer } from '@/brand/StreakCelebration';
test('festejo de racha: solo cuando sube y hoy ya entrenaste; mensajes por hito', () => {
  expect(shouldCelebrate(5, 4, true)).toBe(true);
  expect(shouldCelebrate(5, 5, true)).toBe(false); // ya la viste
  expect(shouldCelebrate(5, 4, false)).toBe(false); // hoy no ha entrenado
  expect(shouldCelebrate(1, null, true)).toBe(true); // primera racha
  expect(streakCheer(7)).toContain('semana');
  expect(streakCheer(30)).toContain('1 mes');
  expect(streakCheer(60)).toContain('2 meses');
});
