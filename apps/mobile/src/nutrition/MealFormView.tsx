import { useMemo, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ActionButton } from '@/components/ActionButton';
import { AppInput } from '@/components/AppInput';
import { Card } from '@/components/Card';
import { Eyebrow } from '@/components/Typography';
import { colors } from '@/theme/colors';
import { MEAL_TYPES, kcalFromMacros, type MealFormErrors, type MealFormValues } from './mealForm';

function Chip({ label, selected, onPress, icon }: { label: string; selected: boolean; onPress: () => void; icon?: string }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ selected }} accessibilityLabel={label} onPress={onPress} style={[s.chip, selected && s.chipOn]}>
    {icon ? <Ionicons name={icon as never} size={15} color={selected ? 'white' : colors.secondary}/> : null}
    <Text style={[s.chipText, selected && s.chipTextOn]}>{label}</Text>
  </Pressable>;
}

/**
 * Formulario de comida (nueva o edición). Campos no controlados (`defaultValue`): en iOS 27 los
 * TextInput controlados reinician el estado del teclado (mismo arreglo que en el login).
 */
export function MealFormView({ initial, errors, timeHint, saving, submitLabel, onSubmit }: {
  initial: MealFormValues;
  errors: MealFormErrors;
  timeHint: string;
  saving: boolean;
  submitLabel: string;
  onSubmit: (values: MealFormValues) => void;
}) {
  const [values, setValues] = useState(initial);
  const [kcalKey, setKcalKey] = useState(0);
  const set = <K extends keyof MealFormValues>(key: K, v: MealFormValues[K]) => setValues((cur) => ({ ...cur, [key]: v }));
  const suggestedKcal = useMemo(() => (values.kcal.trim() === '' ? kcalFromMacros(values) : null), [values]);

  const text = { autoCorrect: false, spellCheck: false } as const;
  return <>
    <Card>
      <Eyebrow>TIPO DE COMIDA</Eyebrow>
      <View style={s.chips}>{MEAL_TYPES.map((m) => <Chip key={m.key} label={m.label} icon={m.icon} selected={values.mealType === m.key} onPress={() => set('mealType', m.key)}/>)}</View>
      <AppInput label="¿Qué comiste?" defaultValue={initial.description} onChangeText={(t) => set('description', t)} placeholder="Ej. 2 tacos de pollo y agua de jamaica" multiline maxLength={500} error={errors.description}/>
      <AppInput label={timeHint} defaultValue={initial.time} onChangeText={(t) => set('time', t)} placeholder="14:30" keyboardType="numbers-and-punctuation" maxLength={5} error={errors.time} {...text}/>
    </Card>

    <Card>
      <Eyebrow>CALORÍAS Y MACROS (OPCIONAL)</Eyebrow>
      <Text style={s.hint}>Lo que no sepas, déjalo vacío: no lo inventamos.</Text>
      <AppInput key={`kcal-${kcalKey}`} label="Calorías (kcal)" defaultValue={values.kcal} onChangeText={(t) => set('kcal', t)} keyboardType="decimal-pad" placeholder="—" error={errors.kcal} {...text}/>
      <View style={s.row3}>
        <View style={s.flex}><AppInput label="Proteína (g)" defaultValue={initial.protein} onChangeText={(t) => set('protein', t)} keyboardType="decimal-pad" placeholder="—" error={errors.protein} {...text}/></View>
        <View style={s.flex}><AppInput label="Carbos (g)" defaultValue={initial.carbs} onChangeText={(t) => set('carbs', t)} keyboardType="decimal-pad" placeholder="—" error={errors.carbs} {...text}/></View>
        <View style={s.flex}><AppInput label="Grasa (g)" defaultValue={initial.fat} onChangeText={(t) => set('fat', t)} keyboardType="decimal-pad" placeholder="—" error={errors.fat} {...text}/></View>
      </View>
      {suggestedKcal !== null ? <Pressable accessibilityRole="button" onPress={() => { set('kcal', String(suggestedKcal)); setKcalKey((k) => k + 1); }} style={s.suggest}>
        <Ionicons name="calculator-outline" size={15} color={colors.blue}/>
        <Text style={s.suggestText}>Usar {suggestedKcal} kcal (calculado de tus macros)</Text>
      </Pressable> : null}
      <AppInput label="Notas (opcional)" defaultValue={initial.notes} onChangeText={(t) => set('notes', t)} multiline maxLength={2000} error={errors.notes}/>
    </Card>

    {errors.form ? <Text accessibilityRole="alert" style={s.error}>{errors.form}</Text> : null}
    <ActionButton onPress={() => onSubmit(values)} loading={saving}>{submitLabel}</ActionButton>
  </>;
}

const s = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 11, backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border },
  chipOn: { backgroundColor: colors.blue, borderColor: colors.blue },
  chipText: { color: colors.secondary, fontSize: 12, fontWeight: '700' },
  chipTextOn: { color: 'white' },
  row3: { flexDirection: 'row', gap: 10 },
  flex: { flex: 1 },
  hint: { color: colors.secondary, fontSize: 11, lineHeight: 16 },
  suggest: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 11, borderWidth: 1, borderColor: colors.blue, backgroundColor: '#10203F' },
  suggestText: { color: colors.text, fontSize: 12, fontWeight: '700' },
  error: { color: colors.red, fontSize: 11 },
});
