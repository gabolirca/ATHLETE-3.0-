import { useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { NutritionPlanMeal } from '@athlete/contracts';
import { SMAE_GROUPS, type Macros, type SmaeGroup } from '@athlete/domain';
import { ActionButton } from '@/components/ActionButton';
import { AppInput } from '@/components/AppInput';
import { Card } from '@/components/Card';
import { DateField } from '@/components/DatePicker';
import { Eyebrow, Label } from '@/components/Typography';
import { colors } from '@/theme/colors';
import {
  STEP, emptyMeal, groupLabel, groupsIn, groupsMissing, mealMacros, planTotals, stepPortion, validatePlan,
  type EditableMeal, type PlanDraft, type PlanErrors,
} from './planForm';

export type PlanSubmit = { effectiveFrom: string; name: string; meals: NutritionPlanMeal[]; notes: string | null; totals: Macros };

/**
 * Editor del plan por tiempos de comida y raciones del SMAE. Lo usan el usuario ("Cargar mi plan") y el nutriólogo
 * ("Asignar plan"). Las kcal y macros se calculan en vivo con la tabla SMAE.
 */
export function PlanEditor({ initial, submitLabel, onSubmit, saving, error }: {
  initial: PlanDraft; submitLabel: string; onSubmit: (plan: PlanSubmit) => void; saving: boolean; error?: string | null;
}) {
  const [draft, setDraft] = useState<PlanDraft>(initial);
  const [errors, setErrors] = useState<PlanErrors>({});
  const [adding, setAdding] = useState<string | null>(null);
  const totals = planTotals(draft.meals);

  const setMeal = (key: string, patch: Partial<EditableMeal>) =>
    setDraft((d) => ({ ...d, meals: d.meals.map((m) => (m.key === key ? { ...m, ...patch } : m)) }));
  const step = (key: string, g: SmaeGroup, delta: number) =>
    setDraft((d) => ({ ...d, meals: d.meals.map((m) => (m.key === key ? { ...m, equivalents: stepPortion(m.equivalents, g, delta) } : m)) }));

  function submit() {
    const r = validatePlan(draft);
    if (!r.ok) { setErrors(r.errors); return; }
    setErrors({});
    onSubmit({ effectiveFrom: draft.effectiveFrom, name: r.name, meals: r.meals, notes: r.notes, totals: r.totals });
  }

  return <>
    <Card>
      <AppInput label="Nombre del plan" defaultValue={draft.name} onChangeText={(t) => setDraft((d) => ({ ...d, name: t }))} error={errors.name} maxLength={80}/>
      <DateField label="Vigente desde" value={draft.effectiveFrom} onChange={(v) => setDraft((d) => ({ ...d, effectiveFrom: v }))}/>
    </Card>

    {draft.meals.map((m, i) => {
      const macros = mealMacros(m);
      return <Card key={m.key}>
        <View style={s.head}>
          <Eyebrow>{`TIEMPO ${i + 1}`}</Eyebrow>
          <Pressable accessibilityRole="button" accessibilityLabel={`Quitar ${m.label || `tiempo ${i + 1}`}`} hitSlop={10}
            onPress={() => setDraft((d) => ({ ...d, meals: d.meals.filter((x) => x.key !== m.key) }))}>
            <Ionicons name="trash-outline" size={18} color={colors.secondary}/>
          </Pressable>
        </View>
        <View style={s.row}>
          <View style={s.flex2}><AppInput label="Tiempo de comida" defaultValue={m.label} placeholder="Desayuno" maxLength={40} onChangeText={(t) => setMeal(m.key, { label: t })}/></View>
          <View style={s.flex1}><AppInput label="Hora" defaultValue={m.time} placeholder="08:00" keyboardType="numbers-and-punctuation" maxLength={5} onChangeText={(t) => setMeal(m.key, { time: t })}/></View>
        </View>

        {groupsIn(m.equivalents).map((g) => <View key={g} style={s.portion}>
          <View style={s.flex2}><Text style={s.group}>{groupLabel(g)}</Text><Text style={s.hint}>{SMAE_GROUPS[g].example}</Text></View>
          <Pressable accessibilityRole="button" accessibilityLabel={`Menos ${groupLabel(g)}`} onPress={() => step(m.key, g, -STEP)} style={s.stepBtn}>
            <Ionicons name="remove" size={18} color={colors.text}/>
          </Pressable>
          <Text style={s.count} accessibilityLabel={`${m.equivalents[g]} raciones de ${groupLabel(g)}`}>{m.equivalents[g]}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel={`Más ${groupLabel(g)}`} onPress={() => step(m.key, g, STEP)} style={s.stepBtn}>
            <Ionicons name="add" size={18} color={colors.text}/>
          </Pressable>
        </View>)}

        {adding === m.key ? <View style={s.chips}>
          {groupsMissing(m.equivalents).map((g) => <Pressable key={g} accessibilityRole="button" accessibilityLabel={`Agregar ${groupLabel(g)}`}
            onPress={() => { step(m.key, g, 1); setAdding(null); }} style={s.chip}>
            <Text style={s.chipText}>{groupLabel(g)}</Text>
          </Pressable>)}
        </View> : <Pressable accessibilityRole="button" onPress={() => setAdding(m.key)} style={s.addGroup}>
          <Ionicons name="add-circle-outline" size={17} color={colors.blue}/><Text style={s.link}>Agregar grupo del SMAE</Text>
        </Pressable>}

        <AppInput label="Nota (opcional)" defaultValue={m.note} placeholder="Ej. sin refresco, agua natural" maxLength={300} onChangeText={(t) => setMeal(m.key, { note: t })}/>
        <Text style={s.hint}>{macros.kcal} kcal · P {macros.proteinG} g · C {macros.carbsG} g · G {macros.fatG} g</Text>
        {errors.meals?.[m.key] ? <Text accessibilityRole="alert" style={s.error}>{errors.meals[m.key]}</Text> : null}
      </Card>;
    })}

    {draft.meals.length < 10 ? <ActionButton secondary onPress={() => setDraft((d) => ({ ...d, meals: [...d.meals, emptyMeal()] }))}>Agregar tiempo de comida</ActionButton> : null}

    <Card>
      <AppInput label="Indicaciones generales (opcional)" defaultValue={draft.notes} placeholder="Ej. 2 L de agua al día" multiline maxLength={2000}
        onChangeText={(t) => setDraft((d) => ({ ...d, notes: t }))}/>
    </Card>

    <Card accent={colors.blue}>
      <Label>Total del día</Label>
      <Text style={s.total}>{totals.kcal} kcal</Text>
      <Text style={s.hint}>Proteína {totals.proteinG} g · Carbos {totals.carbsG} g · Grasa {totals.fatG} g</Text>
      <Text style={s.hint}>Calculado con los valores promedio del SMAE. Se usará como la meta diaria.</Text>
    </Card>

    {errors.form ? <Text accessibilityRole="alert" style={s.error}>{errors.form}</Text> : null}
    {error ? <Text accessibilityRole="alert" style={s.error}>{error}</Text> : null}
    <ActionButton onPress={submit} loading={saving}>{submitLabel}</ActionButton>
  </>;
}

const s = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  row: { flexDirection: 'row', gap: 10 },
  flex1: { flex: 1 },
  flex2: { flex: 2 },
  portion: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
  group: { color: colors.text, fontSize: 13, fontWeight: '700' },
  stepBtn: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border },
  count: { minWidth: 30, textAlign: 'center', color: colors.text, fontSize: 15, fontWeight: '800' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { paddingHorizontal: 10, paddingVertical: 8, borderRadius: 10, backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border },
  chipText: { color: colors.text, fontSize: 12, fontWeight: '600' },
  addGroup: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6 },
  link: { color: colors.blue, fontSize: 13, fontWeight: '800' },
  total: { color: colors.text, fontSize: 28, fontWeight: '800', letterSpacing: -0.5 },
  hint: { color: colors.secondary, fontSize: 11, lineHeight: 16 },
  error: { color: colors.red, fontSize: 12, lineHeight: 18 },
});
