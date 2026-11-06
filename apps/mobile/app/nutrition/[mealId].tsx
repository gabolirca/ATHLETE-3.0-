import { useEffect, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Alert, View } from 'react-native';
import type { MealEntry } from '@athlete/contracts';
import { ActionButton } from '@/components/ActionButton';
import { EmptyState } from '@/components/EmptyState';
import { Screen } from '@/components/Screen';
import { Eyebrow, Title } from '@/components/Typography';
import { MealFormView } from '@/nutrition/MealFormView';
import { dayLabel, formFromMeal, localDateOfDevice, parseMealForm, type MealFormErrors, type MealFormValues } from '@/nutrition/mealForm';
import { useNutrition } from '@/nutrition/mobileNutrition';

export default function EditMealScreen() {
  const router = useRouter();
  const nutrition = useNutrition();
  const { mealId, date } = useLocalSearchParams<{ mealId: string; date?: string }>();
  const today = localDateOfDevice(new Date());
  const localDate = typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : today;
  const [meal, setMeal] = useState<MealEntry | null | undefined>(undefined);
  const [errors, setErrors] = useState<MealFormErrors>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!nutrition || typeof mealId !== 'string') return;
    nutrition.getMeal(mealId, localDate).then(setMeal).catch(() => setMeal(null));
  }, [nutrition, mealId, localDate]);

  if (meal === undefined) return <Screen><Title>Cargando…</Title></Screen>;
  if (meal === null) {
    return <Screen><Title>Comida</Title><EmptyState icon="alert-circle-outline" title="No encontramos esta comida" detail="Puede que se haya borrado en otro dispositivo." action="Volver" onAction={() => router.back()}/></Screen>;
  }

  async function save(values: MealFormValues) {
    if (!nutrition || !meal || saving) return;
    const parsed = parseMealForm(values, { localDate: meal.localDate, now: new Date(), timeZone: meal.timeZone });
    if (!parsed.ok) { setErrors(parsed.errors); return; }
    setErrors({});
    setSaving(true);
    try {
      await nutrition.updateMeal(meal.id, parsed.draft);
      router.back();
    } catch (cause) {
      setErrors({ form: cause instanceof Error ? cause.message : 'No se pudo guardar la comida.' });
    } finally {
      setSaving(false);
    }
  }

  function confirmDelete() {
    Alert.alert('¿Borrar esta comida?', meal?.description ?? '', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Borrar', style: 'destructive', onPress: () => {
        void nutrition?.deleteMeal(meal!.id).then(() => router.back())
          .catch((cause: unknown) => setErrors({ form: cause instanceof Error ? cause.message : 'No se pudo borrar.' }));
      } },
    ]);
  }

  return <Screen>
    <View><Eyebrow>NUTRICIÓN · {dayLabel(meal.localDate, today).toUpperCase()}</Eyebrow><Title>Editar comida</Title></View>
    <MealFormView initial={formFromMeal(meal)} errors={errors} saving={saving} submitLabel="Guardar cambios" timeHint="Hora (HH:MM)" onSubmit={(v) => void save(v)}/>
    <ActionButton secondary onPress={confirmDelete}>Borrar comida</ActionButton>
  </Screen>;
}
