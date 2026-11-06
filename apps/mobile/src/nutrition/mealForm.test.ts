import { dayLabel, emptyMealForm, formFromMeal, kcalFromMacros, parseAmount, parseMealForm, shiftDay, suggestMealType } from './mealForm';

const ctx = (now: Date, localDate = '2026-11-06') => ({ localDate, now, timeZone: 'America/Mexico_City' });
const base = { ...emptyMealForm(new Date(2026, 10, 6, 14, 0)), description: 'Tacos de pollo' };

test('sugiere el tipo de comida por la hora', () => {
  expect([8, 12, 15, 20, 2].map((h) => suggestMealType(new Date(2026, 10, 6, h)))).toEqual(['breakfast', 'snack', 'lunch', 'dinner', 'snack']);
});

test('hoy sin hora = ahora; lo vacío queda null (no 0 inventado)', () => {
  const now = new Date(2026, 10, 6, 14, 30);
  const r = parseMealForm(base, ctx(now));
  expect(r.ok && r.draft).toEqual({
    consumedAt: now.toISOString(), timeZone: 'America/Mexico_City', mealType: 'lunch', description: 'Tacos de pollo',
    energyKcal: null, proteinG: null, carbsG: null, fatG: null, source: 'manual', notes: null,
  });
});

test('acepta coma decimal y hora de un día anterior', () => {
  const r = parseMealForm({ ...base, time: '9:05', kcal: '512,5', protein: '30' }, ctx(new Date(2026, 10, 6, 14), '2026-11-05'));
  expect(r.ok && r.draft).toMatchObject({ consumedAt: new Date(2026, 10, 5, 9, 5).toISOString(), energyKcal: 512.5, proteinG: 30 });
});

test('errores claros', () => {
  const now = new Date(2026, 10, 6, 14, 0);
  const r = parseMealForm({ ...base, description: '  ', time: '25:00', kcal: 'mucho', fat: '3000' }, ctx(now));
  expect(r.ok).toBe(false);
  expect(!r.ok && r.errors).toEqual({ description: 'Describe qué comiste.', time: 'Usa el formato HH:MM, por ejemplo 14:30.', kcal: 'Escribe solo números.', fat: 'Máximo 2,000.' });
  const future = parseMealForm({ ...base, time: '18:00' }, ctx(now));
  expect(!future.ok && future.errors.time).toBe('La hora no puede estar en el futuro.');
  const pastNoTime = parseMealForm(base, ctx(now, '2026-11-05'));
  expect(!pastNoTime.ok && pastNoTime.errors.time).toBe('Indica a qué hora comiste.');
});

test('kcal desde macros solo con los tres valores', () => {
  expect(kcalFromMacros({ protein: '30', carbs: '50', fat: '10' })).toBe(410);
  expect(kcalFromMacros({ protein: '30', carbs: '', fat: '10' })).toBeNull();
  expect(parseAmount('abc')).toBeNaN();
});

test('fechas: etiquetas y desplazamiento entre meses', () => {
  expect(dayLabel('2026-11-06', '2026-11-06')).toBe('Hoy');
  expect(dayLabel('2026-11-05', '2026-11-06')).toBe('Ayer');
  expect(dayLabel('2026-11-03', '2026-11-06')).toBe('martes 3 nov');
  expect(shiftDay('2026-03-01', -1)).toBe('2026-02-28');
  expect(shiftDay('2026-12-31', 1)).toBe('2027-01-01');
});

test('una comida guardada vuelve al formulario sin perder decimales', () => {
  const v = formFromMeal({ id: 'x', userId: 'u', createdAt: '', updatedAt: '', deletedAt: null, revision: 1, consumedAt: new Date(2026, 10, 6, 8, 5).toISOString(), timeZone: 'UTC', localDate: '2026-11-06', mealType: 'breakfast', description: 'Avena', energyKcal: 350, proteinG: 12.5, carbsG: null, fatG: 6, source: 'manual', notes: null });
  expect(v).toEqual({ mealType: 'breakfast', description: 'Avena', time: '08:05', kcal: '350', protein: '12.5', carbs: '', fat: '6', notes: '' });
});
