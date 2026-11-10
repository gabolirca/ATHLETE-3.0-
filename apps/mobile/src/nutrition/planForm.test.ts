import { draftFromPlan, newPlanDraft, normalizeTime, stepPortion, validatePlan } from './planForm';
import { proErrorMessage } from '@/pro/proApi';

test('la hora acepta 8:00, 0800 y 08:00; vacío es sin hora', () => {
  expect(normalizeTime('8:00')).toBe('08:00');
  expect(normalizeTime('0830')).toBe('08:30');
  expect(normalizeTime(' ')).toBeNull();
  expect(normalizeTime('25:00')).toBeUndefined();
  expect(normalizeTime('ocho')).toBeUndefined();
});

test('las raciones van en pasos de ½, de 0 a 20; en 0 el grupo desaparece', () => {
  let eq = stepPortion({}, 'frutas', 0.5);
  expect(eq).toEqual({ frutas: 0.5 });
  eq = stepPortion(eq, 'frutas', -0.5);
  expect(eq).toEqual({});
  expect(stepPortion({ frutas: 20 }, 'frutas', 0.5)).toEqual({ frutas: 20 });
});

test('valida nombre, horas y mínimo de kcal; convierte al contrato', () => {
  const draft = newPlanDraft('2026-11-10');
  expect(draft.meals.map((m) => m.label)).toEqual(['Desayuno', 'Colación', 'Comida', 'Colación', 'Cena']);
  const bad = validatePlan({ ...draft, name: ' ', meals: [{ ...draft.meals[0]!, time: '99:99' }] });
  expect(bad.ok).toBe(false);
  if (!bad.ok) {
    expect(bad.errors.name).toBe('Ponle un nombre al plan.');
    expect(Object.values(bad.errors.meals ?? {})[0]).toMatch(/La hora/);
  }
  const ok = validatePlan({ ...draft, meals: [{ ...draft.meals[0]!, time: '7:30', equivalents: { leguminosas: 7 }, note: '  ' }] });
  expect(ok).toEqual({
    ok: true, name: 'Mi plan', notes: null, totals: { kcal: 840, proteinG: 56, carbsG: 140, fatG: 7 },
    meals: [{ label: 'Desayuno', time: '07:30', equivalents: { leguminosas: 7 }, note: null }],
  });
});

test('un plan guardado vuelve al editor sin perder datos', () => {
  const d = draftFromPlan({ name: 'P', notes: null, meals: [{ label: 'Cena', time: null, equivalents: { verduras: 2 }, note: 'Ligera' }] }, '2026-11-10');
  expect(d.meals[0]).toMatchObject({ label: 'Cena', time: '', equivalents: { verduras: 2 }, note: 'Ligera' });
});

test('los errores del servidor se traducen a mensajes claros', () => {
  expect(proErrorMessage({ message: 'ATHLETE:FORBIDDEN' })).toBe('Tu cuenta no tiene activado el modo nutriólogo.');
  expect(proErrorMessage({ message: 'ATHLETE:NOT_FOUND' }, 'Código vencido')).toBe('Código vencido');
  expect(proErrorMessage({ message: 'TypeError: Failed to fetch' })).toMatch(/Sin conexión/);
});
