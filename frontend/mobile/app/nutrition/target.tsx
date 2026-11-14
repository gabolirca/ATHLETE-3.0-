import { useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import type { NutritionTargetSource } from '@athlete/contracts';
import { ActionButton } from '@/components/ActionButton';
import { AppInput } from '@/components/AppInput';
import { Card } from '@/components/Card';
import { Chip } from '@/components/Chip';
import { DateField } from '@/components/DatePicker';
import { Screen } from '@/components/Screen';
import { Eyebrow, Title } from '@/components/Typography';
import { localDateOfDevice } from '@/lib/localDate';
import { parseAmount } from '@/nutrition/mealForm';
import { useNutrition } from '@/nutrition/mobileNutrition';
import { colors } from '@/theme/colors';

type Errors = Partial<Record<'kcal' | 'protein' | 'carbs' | 'fat' | 'form', string>>;

export default function NutritionTargetScreen() {
  const router = useRouter();
  const nutrition = useNutrition();
  const params = useLocalSearchParams<{ source?: string }>();
  const [source, setSource] = useState<Exclude<NutritionTargetSource, 'estimated'>>(params.source === 'manual' ? 'manual' : 'professional');
  const [from, setFrom] = useState(localDateOfDevice(new Date()));
  const [values, setValues] = useState({ kcal: '', protein: '', carbs: '', fat: '' });
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);
  const set = (k: keyof typeof values, v: string) => setValues((cur) => ({ ...cur, [k]: v }));

  async function save() {
    if (!nutrition || saving) return;
    const e: Errors = {};
    const kcal = parseAmount(values.kcal);
    if (kcal === null) e.kcal = 'Las calorías son obligatorias.';
    else if (Number.isNaN(kcal) || kcal < 800 || kcal > 10_000) e.kcal = 'Escribe un número entre 800 y 10,000.';
    const grams = {} as Record<'protein' | 'carbs' | 'fat', number | null>;
    for (const k of ['protein', 'carbs', 'fat'] as const) {
      const v = parseAmount(values[k]);
      if (v !== null && (Number.isNaN(v) || v > 2000)) e[k] = 'Escribe un número entre 0 y 2,000.';
      grams[k] = v === null || Number.isNaN(v) ? null : v;
    }
    setErrors(e);
    if (Object.keys(e).length) return;
    setSaving(true);
    try {
      await nutrition.setTarget({ effectiveFrom: from, energyKcal: kcal as number, proteinG: grams.protein, carbsG: grams.carbs, fatG: grams.fat, source });
      router.dismissTo('/nutrition');
    } catch (cause) {
      setErrors({ form: cause instanceof Error ? cause.message : 'No se pudo guardar la meta.' });
    } finally {
      setSaving(false);
    }
  }

  const text = { autoCorrect: false, spellCheck: false, keyboardType: 'decimal-pad' as const, placeholder: '—' };
  return <Screen>
    <View><Eyebrow>NUTRICIÓN</Eyebrow><Title>{source === 'professional' ? 'Plan de mi nutriólogo' : 'Mis metas'}</Title></View>
    <Card>
      <View style={s.chips}>
        <Chip label="De mi nutriólogo" icon="medkit-outline" selected={source === 'professional'} onPress={() => setSource('professional')}/>
        <Chip label="Mías" icon="person-outline" selected={source === 'manual'} onPress={() => setSource('manual')}/>
      </View>
      <DateField label="Desde" value={from} onChange={setFrom}/>
      <AppInput label="Calorías al día (kcal)" defaultValue={values.kcal} onChangeText={(t) => set('kcal', t)} error={errors.kcal} {...text}/>
      <View style={s.row}>
        <View style={s.flex}><AppInput label="Proteína (g)" defaultValue={values.protein} onChangeText={(t) => set('protein', t)} error={errors.protein} {...text}/></View>
        <View style={s.flex}><AppInput label="Carbos (g)" defaultValue={values.carbs} onChangeText={(t) => set('carbs', t)} error={errors.carbs} {...text}/></View>
        <View style={s.flex}><AppInput label="Grasa (g)" defaultValue={values.fat} onChangeText={(t) => set('fat', t)} error={errors.fat} {...text}/></View>
      </View>
      <Text style={s.hint}>Los macros son opcionales. Copia los números tal como vienen en tu plan.</Text>
    </Card>
    {errors.form ? <Text accessibilityRole="alert" style={s.error}>{errors.form}</Text> : null}
    <ActionButton onPress={() => void save()} loading={saving}>Guardar meta</ActionButton>
  </Screen>;
}

const s = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  row: { flexDirection: 'row', gap: 10 },
  flex: { flex: 1 },
  hint: { color: colors.secondary, fontSize: 11, lineHeight: 16 },
  error: { color: colors.red, fontSize: 11 },
});
