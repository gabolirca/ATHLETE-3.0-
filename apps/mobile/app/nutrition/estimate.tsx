import { useEffect, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { estimateNutritionPlan, validateNutritionPlanInput, type ActivityLevel, type BiologicalSex, type NutritionGoal, type NutritionPlanEstimate } from '@athlete/domain';
import { ActionButton } from '@/components/ActionButton';
import { AppInput } from '@/components/AppInput';
import { Card } from '@/components/Card';
import { Chip } from '@/components/Chip';
import { Screen } from '@/components/Screen';
import { Eyebrow, Label, Title } from '@/components/Typography';
import { NUTRITION_DISCLAIMER, acceptNutritionDisclaimer, hasAcceptedNutritionDisclaimer } from '@/legal/nutritionDisclaimer';
import { localDateOfDevice } from '@/lib/localDate';
import { formatAmount, parseAmount } from '@/nutrition/mealForm';
import { useNutrition } from '@/nutrition/mobileNutrition';
import { colors } from '@/theme/colors';

const ACTIVITIES: ReadonlyArray<{ key: ActivityLevel; label: string; detail: string }> = [
  { key: 'sedentary', label: 'Sedentaria', detail: 'Trabajo sentado, casi sin ejercicio' },
  { key: 'light', label: 'Ligera', detail: 'Ejercicio 1–3 días por semana' },
  { key: 'moderate', label: 'Moderada', detail: 'Ejercicio 3–5 días por semana' },
  { key: 'active', label: 'Alta', detail: 'Ejercicio intenso 6–7 días' },
  { key: 'very_active', label: 'Muy alta', detail: 'Doble sesión o trabajo físico pesado' },
];
const GOALS: ReadonlyArray<{ key: NutritionGoal; label: string }> = [
  { key: 'lose', label: 'Bajar grasa' }, { key: 'maintain', label: 'Mantener' }, { key: 'gain', label: 'Ganar músculo' },
];

export default function EstimatePlanScreen() {
  const router = useRouter();
  // Desde el asistente de bienvenida llegan estatura, peso y la meta para no volver a preguntarlos.
  const params = useLocalSearchParams<{ height?: string; weight?: string; goal?: string }>();
  const nutrition = useNutrition();
  const [accepted, setAccepted] = useState<boolean | null>(null);
  const [checked, setChecked] = useState(false);
  const [sex, setSex] = useState<BiologicalSex | null>(null);
  const [activity, setActivity] = useState<ActivityLevel>('moderate');
  const [goal, setGoal] = useState<NutritionGoal>(params.goal === 'lose' || params.goal === 'gain' ? params.goal : 'maintain');
  const [values, setValues] = useState({ age: '', height: params.height ?? '', weight: params.weight ?? '' });
  const [errors, setErrors] = useState<Partial<Record<'sex' | 'age' | 'height' | 'weight' | 'form', string>>>({});
  const [plan, setPlan] = useState<NutritionPlanEstimate | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => { void hasAcceptedNutritionDisclaimer().then(setAccepted); }, []);
  const set = (k: keyof typeof values, v: string) => { setValues((cur) => ({ ...cur, [k]: v })); setPlan(null); };

  if (accepted === null) return <Screen><Title>Cargando…</Title></Screen>;

  if (!accepted) {
    return <Screen>
      <View><Eyebrow>PLAN PROVISIONAL</Eyebrow><Title>{NUTRITION_DISCLAIMER.title}</Title></View>
      <Card accent={colors.red}>
        {NUTRITION_DISCLAIMER.points.map((p, i) => <View key={i} style={s.point}><Text style={s.bullet}>•</Text><Text style={s.pointText}>{p}</Text></View>)}
      </Card>
      <Pressable accessibilityRole="checkbox" accessibilityState={{ checked }} accessibilityLabel={NUTRITION_DISCLAIMER.accept} onPress={() => setChecked((c) => !c)} style={s.check}>
        <Ionicons name={checked ? 'checkbox' : 'square-outline'} size={22} color={checked ? colors.blue : colors.secondary}/>
        <Text style={s.checkText}>{NUTRITION_DISCLAIMER.accept}</Text>
      </Pressable>
      <ActionButton disabled={!checked} onPress={() => { void acceptNutritionDisclaimer().then(() => setAccepted(true)); }}>Aceptar y continuar</ActionButton>
      <ActionButton secondary onPress={() => router.back()}>Ahora no</ActionButton>
    </Screen>;
  }

  function calculate() {
    const e: typeof errors = {};
    if (!sex) e.sex = 'Elige una opción (la fórmula es distinta).';
    const age = parseAmount(values.age); const height = parseAmount(values.height); const weight = parseAmount(values.weight);
    const invalid = validateNutritionPlanInput({ ageYears: age ?? NaN, heightCm: height ?? NaN, weightKg: weight ?? NaN });
    if (invalid.includes('age')) e.age = 'El cálculo es solo para adultos de 18 a 90 años.';
    if (invalid.includes('height')) e.height = 'Escribe tu estatura en centímetros (120–230).';
    if (invalid.includes('weight')) e.weight = 'Escribe tu peso en kilos (35–300).';
    setErrors(e);
    if (Object.keys(e).length || !sex) { setPlan(null); return; }
    setPlan(estimateNutritionPlan({ sex, ageYears: age!, heightCm: height!, weightKg: weight!, activity, goal }));
  }

  async function useAsTarget() {
    if (!nutrition || !plan || saving) return;
    setSaving(true);
    try {
      await nutrition.setTarget({ effectiveFrom: localDateOfDevice(new Date()), energyKcal: plan.energyKcal, proteinG: plan.proteinG, carbsG: plan.carbsG, fatG: plan.fatG, source: 'estimated' });
      router.dismissTo('/nutrition');
    } catch (cause) {
      setErrors({ form: cause instanceof Error ? cause.message : 'No se pudo guardar la meta.' });
    } finally {
      setSaving(false);
    }
  }

  const num = { autoCorrect: false, spellCheck: false, keyboardType: 'decimal-pad' as const };
  return <Screen>
    <View><Eyebrow>PLAN PROVISIONAL · SUGERENCIA</Eyebrow><Title>Calcular mi plan</Title></View>
    <Card>
      <Eyebrow>SEXO (PARA LA FÓRMULA)</Eyebrow>
      <View style={s.chips}>
        <Chip label="Hombre" selected={sex === 'male'} onPress={() => { setSex('male'); setPlan(null); }}/>
        <Chip label="Mujer" selected={sex === 'female'} onPress={() => { setSex('female'); setPlan(null); }}/>
      </View>
      {errors.sex ? <Text accessibilityRole="alert" style={s.error}>{errors.sex}</Text> : null}
      <View style={s.row}>
        <View style={s.flex}><AppInput label="Edad (años)" defaultValue={values.age} onChangeText={(t) => set('age', t)} error={errors.age} {...num} keyboardType="number-pad"/></View>
        <View style={s.flex}><AppInput label="Estatura (cm)" defaultValue={values.height} onChangeText={(t) => set('height', t)} error={errors.height} {...num}/></View>
        <View style={s.flex}><AppInput label="Peso (kg)" defaultValue={values.weight} onChangeText={(t) => set('weight', t)} error={errors.weight} {...num}/></View>
      </View>
    </Card>
    <Card>
      <Eyebrow>ACTIVIDAD</Eyebrow>
      {ACTIVITIES.map((a) => <Pressable key={a.key} accessibilityRole="button" accessibilityState={{ selected: activity === a.key }} accessibilityLabel={a.label}
        onPress={() => { setActivity(a.key); setPlan(null); }} style={[s.option, activity === a.key && s.optionOn]}>
        <Text style={s.optionLabel}>{a.label}</Text><Text style={s.hint}>{a.detail}</Text>
      </Pressable>)}
    </Card>
    <Card>
      <Eyebrow>OBJETIVO</Eyebrow>
      <View style={s.chips}>{GOALS.map((g) => <Chip key={g.key} label={g.label} selected={goal === g.key} onPress={() => { setGoal(g.key); setPlan(null); }}/>)}</View>
    </Card>
    <ActionButton secondary onPress={calculate}>Calcular</ActionButton>

    {plan ? <Card accent={colors.blue}>
      <Eyebrow>SUGERENCIA PROVISIONAL</Eyebrow>
      <View style={s.kcalRow}><Text style={s.kcal}>{formatAmount(plan.energyKcal)}</Text><Text style={s.unit}>kcal al día</Text></View>
      <View style={s.row}>
        <Macro label="Proteína" value={plan.proteinG}/><Macro label="Carbos" value={plan.carbsG}/><Macro label="Grasa" value={plan.fatG}/>
      </View>
      <Text style={s.hint}>Basal {formatAmount(plan.bmrKcal)} kcal · gasto diario estimado {formatAmount(plan.tdeeKcal)} kcal.</Text>
      {plan.flooredToMinimum ? <Text style={s.warn}>Lo subimos al mínimo recomendado sin supervisión. Para bajar más, hazlo con un nutriólogo.</Text> : null}
      <Label>No es un plan de un nutriólogo.</Label>
      {errors.form ? <Text accessibilityRole="alert" style={s.error}>{errors.form}</Text> : null}
      <ActionButton onPress={() => void useAsTarget()} loading={saving}>Usar como mi meta</ActionButton>
    </Card> : null}
  </Screen>;
}

function Macro({ label, value }: { label: string; value: number }) {
  return <View style={s.macro}><Text style={s.macroValue}>{value} g</Text><Text style={s.hint}>{label}</Text></View>;
}

const s = StyleSheet.create({
  point: { flexDirection: 'row', gap: 8 },
  bullet: { color: colors.text, fontSize: 14 },
  pointText: { flex: 1, color: colors.text, fontSize: 13, lineHeight: 19 },
  check: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 6 },
  checkText: { flex: 1, color: colors.text, fontSize: 13, fontWeight: '700' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  row: { flexDirection: 'row', gap: 10 },
  flex: { flex: 1 },
  option: { padding: 12, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceRaised, gap: 2 },
  optionOn: { borderColor: colors.blue, backgroundColor: '#10203F' },
  optionLabel: { color: colors.text, fontSize: 13, fontWeight: '800' },
  hint: { color: colors.secondary, fontSize: 11, lineHeight: 16 },
  warn: { color: '#F5B841', fontSize: 11, lineHeight: 16 },
  error: { color: colors.red, fontSize: 11 },
  kcalRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  kcal: { color: colors.text, fontSize: 34, fontWeight: '800', letterSpacing: -1 },
  unit: { color: colors.secondary, fontSize: 14, fontWeight: '700' },
  macro: { flex: 1, backgroundColor: colors.surfaceRaised, borderRadius: 12, padding: 10, gap: 2 },
  macroValue: { color: colors.text, fontSize: 15, fontWeight: '800' },
});
