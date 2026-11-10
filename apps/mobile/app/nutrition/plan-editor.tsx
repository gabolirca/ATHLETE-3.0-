import { useCallback, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import type { NutritionPlan } from '@athlete/contracts';
import { Card } from '@/components/Card';
import { Screen } from '@/components/Screen';
import { Eyebrow, Title } from '@/components/Typography';
import { localDateOfDevice } from '@/lib/localDate';
import { useNutrition } from '@/nutrition/mobileNutrition';
import { PlanEditor, type PlanSubmit } from '@/nutrition/PlanEditor';
import { draftFromPlan, newPlanDraft, type PlanDraft } from '@/nutrition/planForm';
import { colors } from '@/theme/colors';

/** "Cargar mi plan": el usuario captura el plan de su nutriólogo por tiempos y raciones del SMAE. */
export default function PlanEditorScreen() {
  const router = useRouter();
  const nutrition = useNutrition();
  const today = localDateOfDevice(new Date());
  const [current, setCurrent] = useState<NutritionPlan | null | undefined>(undefined);
  const [initial, setInitial] = useState<PlanDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(useCallback(() => {
    if (!nutrition || initial) return;
    nutrition.getPlan(today).then((plan) => {
      setCurrent(plan);
      setInitial(plan ? draftFromPlan(plan, plan.effectiveFrom < today ? today : plan.effectiveFrom) : newPlanDraft(today));
    }).catch(() => { setCurrent(null); setInitial(newPlanDraft(today)); });
  }, [nutrition, initial, today]));

  async function save(plan: PlanSubmit) {
    if (!nutrition || saving) return;
    setSaving(true); setError(null);
    try {
      await nutrition.savePlan(plan);
      router.dismissTo('/nutrition');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo guardar el plan.');
    } finally {
      setSaving(false);
    }
  }

  return <Screen>
    <View><Eyebrow>NUTRICIÓN</Eyebrow><Title>Cargar mi plan</Title></View>
    <Text style={s.detail}>Copia tu plan por tiempo de comida: cuántas raciones de cada grupo del SMAE (como viene en tu hoja de equivalentes).</Text>
    {current?.source === 'assigned' ? <Card accent={colors.amber}>
      <Text style={s.warn}>Este plan te lo asignó {current.assignedByName ?? 'tu nutriólogo'}. Si lo cambias, se guardará como plan propio.</Text>
    </Card> : null}
    {initial ? <PlanEditor initial={initial} submitLabel="Guardar mi plan" onSubmit={(p) => void save(p)} saving={saving} error={error}/> : null}
  </Screen>;
}

const s = StyleSheet.create({
  detail: { color: colors.secondary, fontSize: 12, lineHeight: 18 },
  warn: { color: colors.text, fontSize: 12, lineHeight: 18 },
});
