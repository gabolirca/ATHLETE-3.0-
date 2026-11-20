import { useCallback, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import Svg, { Circle } from 'react-native-svg';
import { display, displayBold } from '@/theme/fonts';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { MealEntry, NutritionDaySummary, NutritionPlan, NutritionTarget } from '@athlete/contracts';
import { ActionButton } from '@/components/ActionButton';
import { Card } from '@/components/Card';
import { DatePickerSheet } from '@/components/DatePicker';
import { EmptyState } from '@/components/EmptyState';
import { Screen } from '@/components/Screen';
import { Eyebrow, Title } from '@/components/Typography';
import { MEAL_TYPES, dayLabel, formatAmount, localDateOfDevice, shiftDay, timeOf } from '@/nutrition/mealForm';
import { useNutrition } from '@/nutrition/mobileNutrition';
import { NutritionOptions } from '@/nutrition/NutritionOptions';
import { PlanView } from '@/nutrition/PlanView';
import { FEATURES } from '@/config/features';
import { TARGET_SOURCE_LABEL } from '@/nutrition/targetLabels';
import { colors, themed } from '@/theme/colors';
import { BrandHeader } from '@/brand/BrandHeader';

type DayState = { meals: MealEntry[]; summary: NutritionDaySummary; target: NutritionTarget | null; plan: NutritionPlan | null } | null;

/** Nutrición: como pestaña (con el logo arriba) o como pantalla aparte (con «Regresar»). */
export function NutritionScreen({ asTab = false }: { asTab?: boolean }) {
  const router = useRouter();
  const nutrition = useNutrition();
  const today = localDateOfDevice(new Date());
  const [date, setDate] = useState(today);
  const [day, setDay] = useState<DayState>(null);
  const [error, setError] = useState<string | null>(null);
  const [calendar, setCalendar] = useState(false);

  const load = useCallback(() => {
    if (!nutrition) return;
    Promise.all([nutrition.loadDay(date), nutrition.getTarget(date), nutrition.getPlan(date).catch(() => null)])
      .then(([d, target, plan]) => { setDay({ ...d, target, plan }); setError(null); })
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'No se pudieron cargar tus comidas.'));
  }, [nutrition, date]);
  useFocusEffect(load);
  useFocusEffect(useCallback(() => {
  }, []));

  const summary = day?.summary;
  const meals = day?.meals ?? [];
  const isFuture = date > today;

  const target = day?.target ?? null;
  const kcal = summary?.energyKcal ?? null;
  const goal = target?.energyKcal ?? null;
  const left = goal !== null ? Math.round(goal - (kcal ?? 0)) : null;

  return <Screen>
    {asTab ? <BrandHeader/> : <Pressable accessibilityRole="button" accessibilityLabel="Regresar" onPress={() => router.back()} hitSlop={10}><Text style={{ color: colors.accentText, fontSize: 14, fontWeight: '700' }}>‹ Regresar</Text></Pressable>}
    <View style={s.titleRow}>
      <Title>Nutrición</Title>
      <Pressable accessibilityRole="button" accessibilityLabel="Cambiar mi plan de nutrición" hitSlop={10} onPress={() => router.push('/nutrition/plan')} style={s.planBtn}>
        <Ionicons name="options-outline" size={16} color={colors.blue}/><Text style={s.link}>Mi plan</Text>
      </Pressable>
    </View>

    <View style={s.dayRow}>
      <Pressable accessibilityRole="button" accessibilityLabel="Día anterior" onPress={() => setDate(shiftDay(date, -1))} style={s.arrow}>
        <Ionicons name="chevron-back" size={18} color={colors.text}/>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Elegir día en el calendario" onPress={() => setCalendar(true)} style={s.dayCenter}>
        <Ionicons name="calendar-outline" size={16} color={colors.blue}/><Text style={s.dayText}>{dayLabel(date, today)}</Text>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Día siguiente" disabled={date >= today} onPress={() => setDate(shiftDay(date, 1))} style={[s.arrow, date >= today && s.disabled]}>
        <Ionicons name="chevron-forward" size={18} color={colors.text}/>
      </Pressable>
    </View>

    <DatePickerSheet visible={calendar} value={date} onSelect={setDate} onClose={() => setCalendar(false)}/>

    {error ? <EmptyState icon="alert-circle-outline" title="No pudimos cargar tus comidas" detail={error} action="Reintentar" onAction={load}/> : null}

    {target ? <View style={s.hero}>
      <View style={s.heroHead}>
        <Text style={s.eyebrow}>META DEL DÍA</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Cambiar meta" onPress={() => router.push('/nutrition/plan')}><Text style={s.link}>Cambiar</Text></Pressable>
      </View>
      <View style={s.heroBody}>
        <KcalRing value={kcal} goal={goal}/>
        <View style={s.macroCol}>
          {target.proteinG !== null ? <MacroBar label="Proteína" value={summary?.proteinG ?? null} target={target.proteinG} color={colors.blue}/> : null}
          {target.carbsG !== null ? <MacroBar label="Carbos" value={summary?.carbsG ?? null} target={target.carbsG} color={colors.amber}/> : null}
          {target.fatG !== null ? <MacroBar label="Grasa" value={summary?.fatG ?? null} target={target.fatG} color={colors.green}/> : null}
        </View>
      </View>
      {goal !== null ? <Text style={[s.left, left !== null && left < 0 && { color: colors.amber }]}>{left !== null && left >= 0 ? `Te faltan ${formatAmount(left)} kcal` : `Te pasaste ${formatAmount(-(left ?? 0))} kcal`}</Text> : null}
      <Text style={s.hint}>{TARGET_SOURCE_LABEL[target.source]}</Text>
      {summary && summary.entriesMissingEnergy > 0 ? <Text style={s.hint}>
        {summary.entriesMissingEnergy === 1 ? '1 comida no tiene' : `${summary.entriesMissingEnergy} comidas no tienen`} calorías: lo consumido es al menos esto.
      </Text> : null}
    </View> : day && !error ? <View style={s.group}>
      <Text style={s.eyebrow}>ELIGE TU PLAN DE NUTRICIÓN</Text>
      <NutritionOptions/>
    </View> : null}

    {!target && summary && summary.entryCount > 0 ? <View style={s.hero}>
      <Text style={s.eyebrow}>TOTAL DEL DÍA</Text>
      <View style={s.kcalRow}>
        <Text style={s.kcal}>{summary.energyKcal === null ? '—' : formatAmount(summary.energyKcal)}</Text>
        <Text style={s.kcalUnit}>kcal</Text>
      </View>
      {summary.entriesMissingEnergy > 0 && summary.energyKcal !== null ? <Text style={s.hint}>
        Al menos: {summary.entriesMissingEnergy === 1 ? '1 comida no tiene' : `${summary.entriesMissingEnergy} comidas no tienen`} calorías.
      </Text> : null}
      <View style={s.macros}>
        <Macro label="Proteína" value={summary.proteinG} color={colors.blue}/>
        <Macro label="Carbos" value={summary.carbsG} color={colors.amber}/>
        <Macro label="Grasa" value={summary.fatG} color={colors.green}/>
      </View>
    </View> : null}

    {!isFuture ? <View style={s.actions}>
      {FEATURES.foodPhoto ? <Pressable accessibilityRole="button" accessibilityLabel="Comida por foto" disabled={!nutrition} onPress={() => router.push({ pathname: '/nutrition/photo', params: { date } })} style={[s.action, s.actionMain]}>
        <MaterialCommunityIcons name="camera" size={26} color="white"/><Text style={s.actionMainText}>Por foto</Text><Text style={s.actionMainSub}>La IA reconoce tu plato</Text>
      </Pressable> : null}
      <Pressable accessibilityRole="button" accessibilityLabel="Registrar a mano" disabled={!nutrition} onPress={() => router.push({ pathname: '/nutrition/new', params: { date } })} style={s.action}>
        <MaterialCommunityIcons name="pencil-plus" size={26} color={colors.blue}/><Text style={s.actionText}>Registrar</Text><Text style={s.actionSub}>Escríbela tú</Text>
      </Pressable>
    </View> : null}

    {day && meals.length === 0 && !error ? <EmptyState icon="nutrition-outline" title={date === today ? 'Aún no registras comidas hoy' : 'Sin comidas este día'}
      detail="Registra lo que comes; las calorías y macros son opcionales." /> : null}

    {MEAL_TYPES.map((type) => {
      const group = meals.filter((m) => m.mealType === type.key);
      if (group.length === 0) return null;
      const subtotal = group.reduce((n, m) => n + (m.energyKcal ?? 0), 0);
      return <View key={type.key} style={s.mealGroup}>
        <View style={s.groupHead}>
          <View style={s.typeIcon}><Ionicons name={type.icon as never} size={16} color={colors.blue}/></View>
          <Text style={s.groupTitle}>{type.label}</Text>
          <Text style={s.groupKcal}>{subtotal ? `${formatAmount(subtotal)} kcal` : ''}</Text>
        </View>
        {group.map((m) => <Pressable key={m.id} accessibilityRole="button" accessibilityLabel={`Editar ${m.description}`}
          onPress={() => router.push({ pathname: '/nutrition/[mealId]', params: { mealId: m.id, date: m.localDate } })} style={s.meal}>
          <View style={s.flex}>
            <Text style={s.mealText} numberOfLines={2}>{m.description}</Text>
            <Text style={s.hint}>{timeOf(m.consumedAt)}{macroLine(m)}{m.source === 'ai_generated' ? ' · 📷' : ''}</Text>
          </View>
          <Text style={s.mealKcal}>{m.energyKcal === null ? '—' : `${formatAmount(m.energyKcal)} kcal`}</Text>
        </Pressable>)}
      </View>;
    })}

    {day?.plan ? <View style={s.card}>
      <View style={s.heroHead}><Text style={s.eyebrow}>TU PLAN</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Editar plan" onPress={() => router.push('/nutrition/plan-editor' as never)}><Text style={s.link}>Editar</Text></Pressable></View>
      <PlanView plan={day.plan}/>
    </View> : null}
  </Screen>;
}

function macroLine(m: MealEntry): string {
  const parts = [['P', m.proteinG], ['C', m.carbsG], ['G', m.fatG]].filter(([, v]) => v !== null).map(([k, v]) => `${k} ${formatAmount(v as number)} g`);
  return parts.length ? ` · ${parts.join(' · ')}` : '';
}

/** Anillo de calorías: lo comido contra la meta (en ámbar si te pasas). */
function KcalRing({ value, goal }: { value: number | null; goal: number | null }) {
  const size = 132; const stroke = 12; const r = (size - stroke) / 2; const c = 2 * Math.PI * r;
  const ratio = goal ? Math.min((value ?? 0) / goal, 1) : 0;
  const over = goal !== null && value !== null && value > goal * 1.05;
  return <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }} accessibilityLabel={`${value === null ? 0 : formatAmount(value)} de ${goal ?? 0} kcal`}>
    <Svg width={size} height={size} style={{ position: 'absolute' }}>
      <Circle cx={size / 2} cy={size / 2} r={r} stroke={colors.surfaceRaised} strokeWidth={stroke} fill="none"/>
      <Circle cx={size / 2} cy={size / 2} r={r} stroke={over ? colors.amber : colors.blue} strokeWidth={stroke} fill="none" strokeLinecap="round"
        strokeDasharray={`${ratio * c} ${c}`} rotation={-90} origin={`${size / 2}, ${size / 2}`}/>
    </Svg>
    <Text style={s.ringValue}>{value === null ? '—' : formatAmount(value)}</Text>
    <Text style={s.ringGoal}>de {goal === null ? '—' : formatAmount(goal)} kcal</Text>
  </View>;
}

function MacroBar({ label, value, target, color }: { label: string; value: number | null; target: number | null; color: string }) {
  const ratio = target ? Math.min((value ?? 0) / target, 1) : 0;
  return <View style={s.progress}>
    <View style={s.progressHead}><Text style={s.progressLabel}>{label}</Text>
      <Text style={s.progressValue}>{value === null ? '—' : formatAmount(value)}{target !== null ? <Text style={s.hint}> / {formatAmount(target)} g</Text> : <Text style={s.hint}> g</Text>}</Text></View>
    <View style={s.track}><View style={[s.fill, { width: `${Math.round(ratio * 100)}%`, backgroundColor: color }]}/></View>
  </View>;
}

function Macro({ label, value, color }: { label: string; value: number | null; color: string }) {
  return <View style={[s.macro, { borderTopColor: color }]}><Text style={s.macroValue}>{value === null ? '—' : `${formatAmount(value)} g`}</Text><Text style={s.hint}>{label}</Text></View>;
}

const s = themed(() => StyleSheet.create({
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  planBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 11, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  dayRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  arrow: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  disabled: { opacity: 0.35 },
  dayCenter: { flex: 1, height: 42, borderRadius: 21, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  dayText: { color: colors.text, fontSize: 15, fontWeight: '800', textTransform: 'capitalize' },
  hero: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 22, padding: 16, gap: 12 },
  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 18, padding: 14, gap: 10 },
  heroHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  heroBody: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  eyebrow: { color: colors.secondary, fontSize: 12, fontWeight: '800', letterSpacing: 1 },
  link: { color: colors.blue, fontSize: 12, fontWeight: '800' },
  ringValue: { color: colors.text, fontSize: 30, lineHeight: 32, ...display },
  ringGoal: { color: colors.secondary, fontSize: 11, fontWeight: '700' },
  macroCol: { flex: 1, gap: 10 },
  left: { color: colors.green, fontSize: 15, fontWeight: '800' },
  progress: { gap: 5 },
  progressHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  progressLabel: { color: colors.text, fontSize: 13, fontWeight: '700' },
  progressValue: { color: colors.text, fontSize: 14, fontWeight: '800' },
  track: { height: 8, borderRadius: 4, backgroundColor: colors.surfaceRaised, overflow: 'hidden' },
  fill: { height: 8, borderRadius: 4, backgroundColor: colors.blue },
  kcalRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  kcal: { color: colors.text, fontSize: 44, lineHeight: 46, ...display },
  kcalUnit: { color: colors.secondary, fontSize: 14, fontWeight: '700' },
  macros: { flexDirection: 'row', gap: 8 },
  macro: { flex: 1, backgroundColor: colors.surfaceRaised, borderRadius: 12, padding: 10, gap: 2, borderTopWidth: 3 },
  macroValue: { color: colors.text, fontSize: 15, fontWeight: '800' },
  actions: { flexDirection: 'row', gap: 10 },
  action: { flex: 1, minHeight: 104, borderRadius: 18, padding: 14, gap: 4, justifyContent: 'flex-end', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  actionMain: { backgroundColor: colors.blue, borderColor: colors.blue },
  actionMainText: { color: 'white', fontSize: 22, lineHeight: 24, ...displayBold }, actionMainSub: { color: 'rgba(255,255,255,0.85)', fontSize: 12 },
  actionText: { color: colors.text, fontSize: 22, lineHeight: 24, ...displayBold }, actionSub: { color: colors.secondary, fontSize: 12 },
  group: { gap: 8 },
  mealGroup: { gap: 8, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 18, padding: 12 },
  groupHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  typeIcon: { width: 32, height: 32, borderRadius: 10, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' },
  groupTitle: { flex: 1, color: colors.text, fontSize: 16, fontWeight: '800' },
  groupKcal: { color: colors.secondary, fontSize: 13, fontWeight: '800' },
  meal: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingHorizontal: 4, borderTopWidth: 1, borderTopColor: colors.border },
  flex: { flex: 1, gap: 3 },
  mealText: { color: colors.text, fontSize: 14, fontWeight: '700' },
  mealKcal: { color: colors.text, fontSize: 13, fontWeight: '800' },
  hint: { color: colors.secondary, fontSize: 11, lineHeight: 16 },
}));

export default function NutritionStackScreen() { return <NutritionScreen/>; }
