import { useCallback, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { MealEntry, NutritionDaySummary, NutritionTarget } from '@athlete/contracts';
import { ActionButton } from '@/components/ActionButton';
import { Card } from '@/components/Card';
import { DatePickerSheet } from '@/components/DatePicker';
import { EmptyState } from '@/components/EmptyState';
import { Screen } from '@/components/Screen';
import { Eyebrow, Title } from '@/components/Typography';
import { MEAL_TYPES, dayLabel, formatAmount, localDateOfDevice, shiftDay, timeOf } from '@/nutrition/mealForm';
import { useNutrition } from '@/nutrition/mobileNutrition';
import { TARGET_SOURCE_LABEL } from '@/nutrition/targetLabels';
import { colors } from '@/theme/colors';

type DayState = { meals: MealEntry[]; summary: NutritionDaySummary; target: NutritionTarget | null } | null;

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
    Promise.all([nutrition.loadDay(date), nutrition.getTarget(date)]).then(([d, target]) => { setDay({ ...d, target }); setError(null); })
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

    {day?.target ? <Card accent={colors.blue}>
      <View style={s.targetHead}><Eyebrow>META DEL DÍA</Eyebrow>
        <Pressable accessibilityRole="button" accessibilityLabel="Cambiar meta" onPress={() => router.push('/nutrition/plan')}><Text style={s.link}>Cambiar</Text></Pressable></View>
      <Text style={s.hint}>{TARGET_SOURCE_LABEL[day.target.source]}</Text>
      <Progress label="Calorías" unit="kcal" value={summary?.energyKcal ?? null} target={day.target.energyKcal}/>
      <Progress label="Proteína" unit="g" value={summary?.proteinG ?? null} target={day.target.proteinG}/>
      <Progress label="Carbos" unit="g" value={summary?.carbsG ?? null} target={day.target.carbsG}/>
      <Progress label="Grasa" unit="g" value={summary?.fatG ?? null} target={day.target.fatG}/>
      {summary && summary.entriesMissingEnergy > 0 ? <Text style={s.hint}>
        {summary.entriesMissingEnergy === 1 ? '1 comida no tiene' : `${summary.entriesMissingEnergy} comidas no tienen`} calorías: lo consumido es al menos esto.
      </Text> : null}
    </Card> : day && !error ? <Pressable accessibilityRole="button" onPress={() => router.push('/nutrition/plan')} style={s.cta}>
      <Ionicons name="flag-outline" size={18} color={colors.blue}/>
      <View style={s.flex}><Text style={s.mealText}>Define tu meta diaria</Text><Text style={s.hint}>Captura el plan de tu nutriólogo o calcula uno provisional.</Text></View>
      <Ionicons name="chevron-forward" size={18} color={colors.secondary}/>
    </Pressable> : null}

    {!day?.target && summary && summary.entryCount > 0 ? <Card accent={colors.blue}>
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

    {!isFuture ? <ActionButton disabled={!nutrition} onPress={() => router.push({ pathname: '/nutrition/photo', params: { date } })}>📷 Comida por foto</ActionButton> : null}
    {!isFuture ? <ActionButton secondary disabled={!nutrition} onPress={() => router.push({ pathname: '/nutrition/new', params: { date } })}>Registrar a mano</ActionButton> : null}
  </Screen>;
}

function macroLine(m: MealEntry): string {
  const parts = [['P', m.proteinG], ['C', m.carbsG], ['G', m.fatG]].filter(([, v]) => v !== null).map(([k, v]) => `${k} ${formatAmount(v as number)} g`);
  return parts.length ? ` · ${parts.join(' · ')}` : '';
}

function Progress({ label, unit, value, target }: { label: string; unit: string; value: number | null; target: number | null }) {
  if (target === null) return null;
  const ratio = value === null ? 0 : Math.min(value / target, 1);
  const over = value !== null && value > target * 1.05;
  return <View style={s.progress}>
    <View style={s.progressHead}>
      <Text style={s.progressLabel}>{label}</Text>
      <Text style={s.progressValue}>{value === null ? '—' : formatAmount(value)} <Text style={s.hint}>de {formatAmount(target)} {unit}</Text></Text>
    </View>
    <View style={s.track}><View style={[s.fill, { width: `${Math.round(ratio * 100)}%` }, over && s.fillOver]}/></View>
  </View>;
}

function Macro({ label, value }: { label: string; value: number | null }) {
  return <View style={s.macro}><Text style={s.macroValue}>{value === null ? '—' : `${formatAmount(value)} g`}</Text><Text style={s.hint}>{label}</Text></View>;
}

const s = StyleSheet.create({
  dayRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  arrow: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  disabled: { opacity: 0.35 },
  dayCenter: { flex: 1, alignItems: 'center' },
  targetHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  link: { color: colors.blue, fontSize: 12, fontWeight: '800' },
  cta: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 14, borderWidth: 1, borderColor: colors.blue, backgroundColor: '#10203F' },
  progress: { gap: 6 },
  progressHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  progressLabel: { color: colors.text, fontSize: 13, fontWeight: '700' },
  progressValue: { color: colors.text, fontSize: 14, fontWeight: '800' },
  track: { height: 8, borderRadius: 4, backgroundColor: colors.surfaceRaised, overflow: 'hidden' },
  fill: { height: 8, borderRadius: 4, backgroundColor: colors.blue },
  fillOver: { backgroundColor: '#F5B841' },
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
