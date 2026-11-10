import { StyleSheet, Text, View } from 'react-native';
import type { NutritionPlanMeal } from '@athlete/contracts';
import { describeEquivalents, type Equivalents } from '@athlete/domain';
import { colors } from '@/theme/colors';
import { planTotals } from './planForm';

type PlanLike = { name: string; meals: NutritionPlanMeal[]; notes: string | null; source: 'self' | 'assigned'; assignedByName: string | null };

export function planOrigin(plan: Pick<PlanLike, 'source' | 'assignedByName'>): string {
  return plan.source === 'assigned' ? `Asignado por ${plan.assignedByName ?? 'tu nutriólogo'}` : 'Capturado por ti';
}

/** Muestra el plan: cada tiempo con su hora, raciones del SMAE y nota; y el total del día. */
export function PlanView({ plan, showName = true }: { plan: PlanLike; showName?: boolean }) {
  const totals = planTotals(plan.meals.map((m) => ({ equivalents: m.equivalents as Equivalents })));
  return <View style={s.root}>
    {showName ? <View><Text style={s.name}>{plan.name}</Text><Text style={s.hint}>{planOrigin(plan)} · {totals.kcal} kcal al día</Text></View> : null}
    {plan.meals.map((m, i) => <View key={`${m.label}-${i}`} style={s.meal}>
      <Text style={s.mealTitle}>{m.time ? `${m.time} · ` : ''}{m.label}</Text>
      <Text style={s.body}>{describeEquivalents(m.equivalents as Equivalents) || 'Sin raciones'}</Text>
      {m.note ? <Text style={s.hint}>{m.note}</Text> : null}
    </View>)}
    {plan.notes ? <Text style={s.notes}>{plan.notes}</Text> : null}
  </View>;
}

const s = StyleSheet.create({
  root: { gap: 10 },
  name: { color: colors.text, fontSize: 16, fontWeight: '800' },
  meal: { gap: 2, paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.border },
  mealTitle: { color: colors.text, fontSize: 13, fontWeight: '800' },
  body: { color: colors.text, fontSize: 13, lineHeight: 19 },
  notes: { color: colors.secondary, fontSize: 12, lineHeight: 18, fontStyle: 'italic' },
  hint: { color: colors.secondary, fontSize: 11, lineHeight: 16 },
});
