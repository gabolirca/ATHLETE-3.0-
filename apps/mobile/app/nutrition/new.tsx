import { useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { View } from 'react-native';
import { Screen } from '@/components/Screen';
import { Eyebrow, Title } from '@/components/Typography';
import { MealFormView } from '@/nutrition/MealFormView';
import { dayLabel, emptyMealForm, localDateOfDevice, parseMealForm, type MealFormErrors, type MealFormValues } from '@/nutrition/mealForm';
import { useNutrition } from '@/nutrition/mobileNutrition';

export default function NewMealScreen() {
  const router = useRouter();
  const nutrition = useNutrition();
  const params = useLocalSearchParams<{ date?: string }>();
  const today = localDateOfDevice(new Date());
  const localDate = typeof params.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(params.date) ? params.date : today;
  const isToday = localDate === today;
  const [errors, setErrors] = useState<MealFormErrors>({});
  const [saving, setSaving] = useState(false);
  const [initial] = useState(() => emptyMealForm(new Date()));

  async function save(values: MealFormValues) {
    if (!nutrition || saving) return;
    const parsed = parseMealForm(values, { localDate, now: new Date(), timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC' });
    if (!parsed.ok) { setErrors(parsed.errors); return; }
    setErrors({});
    setSaving(true);
    try {
      await nutrition.logMeal(parsed.draft);
      router.back();
    } catch (cause) {
      setErrors({ form: cause instanceof Error ? cause.message : 'No se pudo guardar la comida.' });
    } finally {
      setSaving(false);
    }
  }

  return <Screen>
    <View><Eyebrow>NUTRICIÓN · {dayLabel(localDate, today).toUpperCase()}</Eyebrow><Title>Registrar comida</Title></View>
    <MealFormView initial={initial} errors={errors} saving={saving} submitLabel="Guardar comida"
      timeHint={isToday ? 'Hora (HH:MM, vacío = ahora)' : 'Hora (HH:MM)'} onSubmit={(v) => void save(v)}/>
  </Screen>;
}
