import { useCallback, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { MealEntry, NutritionDaySummary } from '@athlete/contracts';
import { ActionButton } from '@/components/ActionButton';
import { Card } from '@/components/Card';
import { DatePickerSheet } from '@/components/DatePicker';
import { EmptyState } from '@/components/EmptyState';
import { Screen } from '@/components/Screen';
import { Eyebrow, Title } from '@/components/Typography';
import { MEAL_TYPES, dayLabel, formatAmount, localDateOfDevice, shiftDay, timeOf } from '@/nutrition/mealForm';
import { useNutrition } from '@/nutrition/mobileNutrition';
import { colors } from '@/theme/colors';

type DayState = { meals: MealEntry[]; summary: NutritionDaySummary } | null;

export default function NutritionScreen() {
  const router = useRouter();
  const nutrition = useNutrition();
  const today = localDateOfDevice(new Date());
  const [date, setDate] = useState(today);
  const [day, setDay] = useState<DayState>(null);
  const [error, setError] = useState<string | null>(null);
  const [calendar, setCalendar] = useState(false);

  const load = useCallback(() => {
    if (!nutrition) return;
    nutrition.loadDay(date).then((d) => { setDay(d); setError(null); })
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'No se pudieron cargar tus comidas.'));
  }, [nutrition, date]);
  useFocusEffect(load);

  const summary = day?.summary;
  const meals = day?.meals ?? [];
  const isFuture = date > today;

  return <Screen>
    <View><Eyebrow>REGISTRO DE COMIDAS</Eyebrow><Title>Nutrición</Title></View>

    <View style={s.dayRow}>
      <Pressable accessibilityRole="button" accessibilityLabel="Día anterior" onPress={() => setDate(shiftDay(date, -1))} style={s.arrow}>
        <Ionicons name="chevron-back" size={20} color={colors.text}/>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Elegir día en el calendario" onPress={() => setCalendar(true)} style={s.dayCenter}>
        <View style={s.dayLine}><Ionicons name="calendar-outline" size={16} color={colors.blue}/><Text style={s.dayText}>{dayLabel(date, today)}</Text></View>
        <Text style={s.hint}>Toca para elegir otro día</Text>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Día siguiente" disabled={date >= today} onPress={() => setDate(shiftDay(date, 1))} style={[s.arrow, date >= today && s.disabled]}>
        <Ionicons name="chevron-forward" size={20} color={colors.text}/>
      </Pressable>
    </View>

    <DatePickerSheet visible={calendar} value={date} onSelect={setDate} onClose={() => setCalendar(false)}/>

    {error ? <EmptyState icon="alert-circle-outline" title="No pudimos cargar tus comidas" detail={error} action="Reintentar" onAction={load}/> : null}

    {summary && summary.entryCount > 0 ? <Card accent={colors.blue}>
      <Eyebrow>TOTAL DEL DÍA</Eyebrow>
      <View style={s.kcalRow}>
        <Text style={s.kcal}>{summary.energyKcal === null ? '—' : formatAmount(summary.energyKcal)}</Text>
        <Text style={s.kcalUnit}>kcal</Text>
      </View>
      {summary.entriesMissingEnergy > 0 && summary.energyKcal !== null ? <Text style={s.hint}>
        Al menos: {summary.entriesMissingEnergy === 1 ? '1 comida no tiene' : `${summary.entriesMissingEnergy} comidas no tienen`} calorías.
      </Text> : null}
      <View style={s.macros}>
        <Macro label="Proteína" value={summary.proteinG}/>
        <Macro label="Carbos" value={summary.carbsG}/>
        <Macro label="Grasa" value={summary.fatG}/>
      </View>
    </Card> : null}

    {day && meals.length === 0 && !error ? <EmptyState icon="nutrition-outline" title={date === today ? 'Aún no registras comidas hoy' : 'Sin comidas este día'}
      detail="Registra lo que comes; las calorías y macros son opcionales." /> : null}

    {MEAL_TYPES.map((type) => {
      const group = meals.filter((m) => m.mealType === type.key);
      if (group.length === 0) return null;
      return <View key={type.key} style={s.group}>
        <View style={s.groupHead}><Ionicons name={type.icon as never} size={15} color={colors.secondary}/><Eyebrow>{type.label}</Eyebrow></View>
        {group.map((m) => <Pressable key={m.id} accessibilityRole="button" accessibilityLabel={`Editar ${m.description}`}
          onPress={() => router.push({ pathname: '/nutrition/[mealId]', params: { mealId: m.id, date: m.localDate } })} style={s.meal}>
          <View style={s.flex}>
            <Text style={s.mealText} numberOfLines={2}>{m.description}</Text>
            <Text style={s.hint}>{timeOf(m.consumedAt)}{macroLine(m)}</Text>
          </View>
          <Text style={s.mealKcal}>{m.energyKcal === null ? '—' : `${formatAmount(m.energyKcal)} kcal`}</Text>
        </Pressable>)}
      </View>;
    })}

    {!isFuture ? <ActionButton disabled={!nutrition} onPress={() => router.push({ pathname: '/nutrition/new', params: { date } })}>Registrar comida</ActionButton> : null}
  </Screen>;
}

function macroLine(m: MealEntry): string {
  const parts = [['P', m.proteinG], ['C', m.carbsG], ['G', m.fatG]].filter(([, v]) => v !== null).map(([k, v]) => `${k} ${formatAmount(v as number)} g`);
  return parts.length ? ` · ${parts.join(' · ')}` : '';
}

function Macro({ label, value }: { label: string; value: number | null }) {
  return <View style={s.macro}><Text style={s.macroValue}>{value === null ? '—' : `${formatAmount(value)} g`}</Text><Text style={s.hint}>{label}</Text></View>;
}

const s = StyleSheet.create({
  dayRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  arrow: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  disabled: { opacity: 0.35 },
  dayCenter: { flex: 1, alignItems: 'center' },
  dayLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dayText: { color: colors.text, fontSize: 16, fontWeight: '800', textTransform: 'capitalize' },
  kcalRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  kcal: { color: colors.text, fontSize: 34, fontWeight: '800', letterSpacing: -1 },
  kcalUnit: { color: colors.secondary, fontSize: 14, fontWeight: '700' },
  macros: { flexDirection: 'row', gap: 10 },
  macro: { flex: 1, backgroundColor: colors.surfaceRaised, borderRadius: 12, padding: 10, gap: 2 },
  macroValue: { color: colors.text, fontSize: 15, fontWeight: '800' },
  group: { gap: 8 },
  groupHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  meal: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 14, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  flex: { flex: 1, gap: 3 },
  mealText: { color: colors.text, fontSize: 14, fontWeight: '700' },
  mealKcal: { color: colors.text, fontSize: 13, fontWeight: '800' },
  hint: { color: colors.secondary, fontSize: 11, lineHeight: 16 },
});
