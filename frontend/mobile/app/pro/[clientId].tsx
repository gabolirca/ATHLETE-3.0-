import { useCallback, useState } from 'react';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { ActionButton } from '@/components/ActionButton';
import { Card } from '@/components/Card';
import { Screen } from '@/components/Screen';
import { Eyebrow, Title } from '@/components/Typography';
import { localDateOfDevice } from '@/lib/localDate';
import { PlanEditor, type PlanSubmit } from '@/nutrition/PlanEditor';
import { PlanView } from '@/nutrition/PlanView';
import { draftFromPlan, newPlanDraft, type PlanDraft } from '@/nutrition/planForm';
import { proApi, type ClientPlan } from '@/pro/proApi';
import { colors } from '@/theme/colors';

/** Cliente del nutriólogo: ver su plan vigente y asignarle uno nuevo (o ajustarlo). */
export default function ProClientScreen() {
  const router = useRouter();
  const { clientId, name, linkId } = useLocalSearchParams<{ clientId: string; name?: string; linkId?: string }>();
  const today = localDateOfDevice(new Date());
  const [plan, setPlan] = useState<ClientPlan | null | undefined>(undefined);
  const [editing, setEditing] = useState<PlanDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!clientId) return;
    proApi.getClientPlan(clientId).then((p) => { setPlan(p); setError(null); })
      .catch((e: unknown) => { setPlan(null); setError(e instanceof Error ? e.message : 'No se pudo cargar el plan.'); });
  }, [clientId]);
  useFocusEffect(load);

  async function assign(p: PlanSubmit) {
    if (!clientId || saving) return;
    setSaving(true); setError(null);
    try {
      await proApi.assignPlan(clientId, {
        effectiveFrom: p.effectiveFrom, name: p.name, meals: p.meals, notes: p.notes,
        energyKcal: p.totals.kcal, proteinG: p.totals.proteinG, carbsG: p.totals.carbsG, fatG: p.totals.fatG,
      });
      setEditing(null);
      setMessage('Plan asignado. Le llegará a tu cliente al sincronizar su app.');
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo asignar el plan.');
    } finally { setSaving(false); }
  }

  function end() {
    if (!linkId) return;
    Alert.alert('Terminar vínculo', `Ya no podrás ver ni asignar planes a ${name ?? 'este cliente'}. Sus planes se quedan con él.`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Terminar', style: 'destructive', onPress: () => {
        proApi.endLink(linkId).then(() => router.back()).catch((e: unknown) => setError(e instanceof Error ? e.message : 'No se pudo terminar.'));
      } },
    ]);
  }

  const startEditing = () => setEditing(plan ? draftFromPlan(plan, today) : newPlanDraft(today, `Plan de ${name ?? 'cliente'}`));

  return <Screen>
    <View><Eyebrow>MODO NUTRIÓLOGO</Eyebrow><Title>{name ?? 'Cliente'}</Title></View>
    {editing ? <>
      <Text style={s.detail}>Arma el plan por tiempos de comida y raciones del SMAE. El total del día queda como su meta de calorías y macros.</Text>
      <PlanEditor initial={editing} submitLabel="Asignar plan" onSubmit={(p) => void assign(p)} saving={saving} error={error}/>
      <ActionButton secondary onPress={() => setEditing(null)}>Cancelar</ActionButton>
    </> : <>
      {plan ? <Card><PlanView plan={plan}/><Text style={s.detail}>Vigente desde {plan.effectiveFrom}</Text></Card>
        : plan === null ? <Card><Text style={s.detail}>Todavía no tiene plan.</Text></Card> : null}
      <ActionButton onPress={startEditing}>{plan ? 'Ajustar y asignar plan' : 'Asignar plan'}</ActionButton>
      {message ? <Text style={s.ok}>{message}</Text> : null}
      {error ? <Text accessibilityRole="alert" style={s.error}>{error}</Text> : null}
      {linkId ? <ActionButton secondary onPress={end}>Terminar vínculo</ActionButton> : null}
    </>}
  </Screen>;
}

const s = StyleSheet.create({
  detail: { color: colors.secondary, fontSize: 12, lineHeight: 18 },
  ok: { color: colors.green, fontSize: 12, lineHeight: 18 },
  error: { color: colors.red, fontSize: 12, lineHeight: 18 },
});
