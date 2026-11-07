import type { LogMealEntryInput, MealEntry, MealType } from '@athlete/contracts';
import { atLocalTime, localDateOfDevice, shiftDay } from '@/lib/localDate';

/**
 * Formulario de comida → entrada del contrato. Calorías y macros son opcionales: lo que no se escribe
 * queda null (nunca 0 inventado). Las horas son de la zona horaria del teléfono.
 */
export const MEAL_TYPES: ReadonlyArray<{ key: MealType; label: string; icon: string }> = [
  { key: 'breakfast', label: 'Desayuno', icon: 'sunny-outline' },
  { key: 'lunch', label: 'Comida', icon: 'restaurant-outline' },
  { key: 'dinner', label: 'Cena', icon: 'moon-outline' },
  { key: 'snack', label: 'Colación', icon: 'cafe-outline' },
  { key: 'other', label: 'Otro', icon: 'ellipsis-horizontal-outline' },
];

export const mealTypeLabel = (t: MealType) => MEAL_TYPES.find((m) => m.key === t)?.label ?? 'Otro';

/** Tipo sugerido según la hora (horarios habituales en México: la comida fuerte es por la tarde). */
export function suggestMealType(date: Date): MealType {
  const h = date.getHours();
  if (h >= 5 && h < 11) return 'breakfast';
  if (h >= 11 && h < 13) return 'snack';
  if (h >= 13 && h < 18) return 'lunch';
  if (h >= 18 && h < 23) return 'dinner';
  return 'snack';
}

export type MealFormValues = {
  mealType: MealType;
  description: string;
  time: string;
  kcal: string;
  protein: string;
  carbs: string;
  fat: string;
  notes: string;
};

export type MealFormErrors = Partial<Record<keyof MealFormValues | 'form', string>>;
export type MealDraft = Omit<LogMealEntryInput, 'id'>;

const pad = (n: number) => String(n).padStart(2, '0');
export const timeOf = (iso: string) => { const d = new Date(iso); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };

export function emptyMealForm(now: Date): MealFormValues {
  return { mealType: suggestMealType(now), description: '', time: '', kcal: '', protein: '', carbs: '', fat: '', notes: '' };
}

export function formFromMeal(m: MealEntry): MealFormValues {
  const num = (v: number | null) => (v === null ? '' : formatAmount(v));
  return {
    mealType: m.mealType, description: m.description, time: timeOf(m.consumedAt),
    kcal: num(m.energyKcal), protein: num(m.proteinG), carbs: num(m.carbsG), fat: num(m.fatG), notes: m.notes ?? '',
  };
}

/** Acepta coma o punto decimal. Vacío → null. Texto no numérico → NaN (error). */
export function parseAmount(raw: string): number | null {
  const t = raw.trim().replace(',', '.');
  if (t === '') return null;
  return /^\d+(\.\d+)?$/.test(t) ? Number(t) : NaN;
}

export function formatAmount(n: number): string {
  const r = Math.round(n * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}

/** kcal derivadas de los macros (4/4/9). Solo si los tres están escritos; es una sugerencia, no un dato. */
export function kcalFromMacros(values: Pick<MealFormValues, 'protein' | 'carbs' | 'fat'>): number | null {
  const [p, c, f] = [parseAmount(values.protein), parseAmount(values.carbs), parseAmount(values.fat)];
  if ([p, c, f].some((v) => v === null || Number.isNaN(v))) return null;
  return Math.round((p as number) * 4 + (c as number) * 4 + (f as number) * 9);
}

const LIMITS = { kcal: 20_000, protein: 2_000, carbs: 2_000, fat: 2_000 } as const;

/** Si la hora escrita es futura hoy, la misma hora ayer sí es válida (para ofrecer "Cambiar a ayer"). */
export function yesterdayFits(values: Pick<MealFormValues, 'time'>, today: string, now: Date): boolean {
  const m = /^(\d{1,2}):(\d{2})$/.exec(values.time.trim());
  if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) return false;
  return atLocalTime(today, Number(m[1]), Number(m[2])).getTime() > now.getTime() + 60_000
    && atLocalTime(shiftDay(today, -1), Number(m[1]), Number(m[2])).getTime() <= now.getTime();
}

export function parseMealForm(
  values: MealFormValues,
  context: { localDate: string; now: Date; timeZone: string },
): { ok: true; draft: MealDraft } | { ok: false; errors: MealFormErrors } {
  const errors: MealFormErrors = {};
  const description = values.description.trim();
  if (!description) errors.description = 'Describe qué comiste.';
  else if (description.length > 500) errors.description = 'Máximo 500 caracteres.';

  const isToday = context.localDate === localDateOfDevice(context.now);
  let consumedAt: Date | null = null;
  const time = values.time.trim();
  if (!time) {
    if (isToday) consumedAt = new Date(context.now);
    else errors.time = 'Indica a qué hora comiste.';
  } else {
    const match = /^(\d{1,2}):(\d{2})$/.exec(time);
    const h = match ? Number(match[1]) : NaN;
    const min = match ? Number(match[2]) : NaN;
    if (!match || h > 23 || min > 59) errors.time = 'Usa el formato HH:MM, por ejemplo 14:30.';
    else {
      consumedAt = atLocalTime(context.localDate, h, min);
      if (consumedAt.getTime() > context.now.getTime() + 60_000) {
        // Caso típico: cenaste a las 21:45 y lo registras pasada la medianoche.
        errors.time = isToday ? 'Esa hora todavía no llega hoy. Si fue ayer, cambia el día.' : 'La hora no puede estar en el futuro.';
      }
    }
  }

  const amounts = {} as Record<'kcal' | 'protein' | 'carbs' | 'fat', number | null>;
  for (const key of ['kcal', 'protein', 'carbs', 'fat'] as const) {
    const v = parseAmount(values[key]);
    if (v !== null && (Number.isNaN(v) || v > LIMITS[key])) {
      errors[key] = Number.isNaN(v) ? 'Escribe solo números.' : `Máximo ${LIMITS[key].toLocaleString('es-MX')}.`;
    }
    amounts[key] = v === null || Number.isNaN(v) ? null : v;
  }
  const notes = values.notes.trim();
  if (notes.length > 2000) errors.notes = 'Máximo 2000 caracteres.';

  if (Object.keys(errors).length > 0 || !consumedAt) return { ok: false, errors };
  return {
    ok: true,
    draft: {
      consumedAt: consumedAt.toISOString(), timeZone: context.timeZone, mealType: values.mealType, description,
      energyKcal: amounts.kcal, proteinG: amounts.protein, carbsG: amounts.carbs, fatG: amounts.fat,
      source: 'manual', notes: notes || null,
    },
  };
}

export { dayLabel, localDateOfDevice, shiftDay } from '@/lib/localDate';
