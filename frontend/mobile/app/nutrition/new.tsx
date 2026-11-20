import { useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { View } from 'react-native';
import { ActionButton } from '@/components/ActionButton';
import { DateField } from '@/components/DatePicker';
import { Screen } from '@/components/Screen';
import { Eyebrow, Title } from '@/components/Typography';
import { isLocalDate } from '@/lib/localDate';
import { MealFormView } from '@/nutrition/MealFormView';
import { emptyMealForm, localDateOfDevice, parseMealForm, shiftDay, yesterdayFits, type MealFormErrors, type MealFormValues } from '@/nutrition/mealForm';
import { useNutrition } from '@/nutrition/mobileNutrition';

export default function NewMealScreen() {
  const router = useRouter();
  const nutrition = useNutrition();
  const params = useLocalSearchParams<{ date?: string }>();
  const today = localDateOfDevice(new Date());
  const [localDate, setLocalDate] = useState(isLocalDate(params.date) && params.date <= today ? params.date : today);
  const [errors, setErrors] = useState<MealFormErrors>({});
  const [saving, setSaving] = useState(false);
  const [initial] = useState(() => emptyMealForm(new Date()));
  const [pendingYesterday, setPendingYesterday] = useState<MealFormValues | null>(null);

  async function save(values: MealFormValues, date = localDate) {
    if (!nutrition || saving) return;
    const now = new Date();
    const parsed = parseMealForm(values, { localDate: date, now, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC' });
    if (!parsed.ok) {
      setErrors(parsed.errors);
      setPendingYesterday(date === today && parsed.errors.time && yesterdayFits(values, today, now) ? values : null);
      return;
    }
    setErrors({});
    setPendingYesterday(null);
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
    <View><Eyebrow>NUTRICIÓN</Eyebrow><Title>Registrar comida</Title></View>
    <DateField value={localDate} onChange={(d) => { setLocalDate(d); setPendingYesterday(null); setErrors({}); }}/>
    {pendingYesterday ? <ActionButton secondary onPress={() => { const yesterday = shiftDay(today, -1); setLocalDate(yesterday); void save(pendingYesterday, yesterday); }}>
      Guardar en ayer a las {pendingYesterday.time.trim()}
    </ActionButton> : null}
    <MealFormView initial={initial} errors={errors} saving={saving} submitLabel="Guardar comida"
      timeHint={localDate === today ? 'Hora (HH:MM, vacío = ahora)' : 'Hora (HH:MM)'} onSubmit={(v) => void save(v)}/>
  </Screen>;
}
