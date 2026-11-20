import { useAppRefresh } from '@/brand/useAppRefresh';
import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { ImageBackground, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line, Polyline, Rect, Text as SvgText } from 'react-native-svg';
import { BrandHeader } from '@/brand/BrandHeader';
import { AnimatedA } from '@/brand/AnimatedA';
import { ActionButton } from '@/components/ActionButton';
import { AppInput } from '@/components/AppInput';
import { EmptyState } from '@/components/EmptyState';
import { Sheet, sheetStyles as st } from '@/components/Sheet';
import { Title } from '@/components/Typography';
import { Screen } from '@/components/Screen';
import { useTrainingRepository } from '@/data/MobileTrainingContext';
import { BodyMeasurementSchema } from '@/data/trainingSchemas';
import type { BenchmarkItem, BodyMeasurement, Program, ProgramWeekCount, ProgressSummary, StreakSummary, TrainingOverview, WeeklyLoad, WeeklyMuscleVolume } from '@/data/trainingTypes';
import { dayLabel, localDateOfDevice } from '@/lib/localDate';
import { CardioProgress } from '@/progress/CardioProgress';
import { AdherenceCard, BenchmarksCard, CycleCard } from '@/progress/HybridProgress';
import { LoadCard } from '@/progress/LoadCard';
import { MuscleVolumeRow } from '@/progress/muscleVolume';
import { bodyTrend, chartPath, monthSummary, recentRecords, weeklyGoal, weeklySessions } from '@/progress/progressView';
import { BRAND } from '@/brand/assets';
import { formatKg } from '@/progress/records';
import { colors, themed } from '@/theme/colors';
import { display, displayBold } from '@/theme/fonts';

const KINDS = [
  { id: 'weight_kg', title: 'Peso', unit: 'kg' }, { id: 'waist_cm', title: 'Cintura', unit: 'cm' },
  { id: 'chest_cm', title: 'Pecho', unit: 'cm' }, { id: 'hip_cm', title: 'Cadera', unit: 'cm' },
] as const;
type Kind = typeof KINDS[number]['id'];
const W = 320, H = 110;

/**
 * Progreso: lo que motiva a volver, de un vistazo. Semana contra tu meta y racha; récords más recientes;
 * peso (o medida) con su tendencia y meta; series por músculo y cardio. Registrar medidas va en una hoja.
 */
export default function ProgressScreen() {
  const repository = useTrainingRepository();
  const [summary, setSummary] = useState<ProgressSummary | null>(null);
  const [overview, setOverview] = useState<TrainingOverview | null>(null);
  const [volume, setVolume] = useState<WeeklyMuscleVolume | null>(null);
  const [streak, setStreak] = useState<StreakSummary | null>(null);
  const [goalDays, setGoalDays] = useState(4);
  const [goals, setGoals] = useState<Record<BodyMeasurement['type'], number | null> | null>(null);
  const [loadingError, setLoadingError] = useState(false);
  const [kind, setKind] = useState<Kind>('weight_kg');
  const [allRecords, setAllRecords] = useState(false);
  const [allMuscles, setAllMuscles] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [history, setHistory] = useState<Array<{ localDate: string; sets: number }>>([]);
  const [cardioDates, setCardioDates] = useState<string[]>([]);
  const [load, setLoad] = useState<WeeklyLoad | null>(null);
  const [hybrid, setHybrid] = useState<{ program: Program | null; weeks: ProgramWeekCount[]; benchmarks: BenchmarkItem[] }>({ program: null, weeks: [], benchmarks: [] });

  const refresh = useCallback(async () => {
    if (!repository) return;
    try { setSummary(await repository.getProgress()); setLoadingError(false); } catch { setLoadingError(true); }
    repository.getOverview().then(setOverview).catch(() => setOverview(null));
    repository.getWeeklyMuscleVolume().then(setVolume).catch(() => setVolume(null));
    repository.getStreak().then(setStreak).catch(() => setStreak(null));
    repository.getBodyGoals().then(setGoals).catch(() => setGoals(null));
    repository.getAthleteProfile().then((p) => setGoalDays(weeklyGoal(p.goals))).catch(() => undefined);
    repository.listHistory().then((items) => setHistory(items.map((w) => ({ localDate: localDateOfDevice(new Date(w.startedAt)), sets: w.setCount })))).catch(() => setHistory([]));
    repository.listCardio().then((items) => setCardioDates(items.map((c) => c.localDate))).catch(() => setCardioDates([]));
    repository.getWeeklyLoad(4).then(setLoad).catch(() => setLoad(null));
    (async () => {
      const [program] = await repository.listPrograms();
      const [weeks, benchmarks] = await Promise.all([program ? repository.programWeeks(program.id, 8) : Promise.resolve([]), repository.getBenchmarks()]);
      setHybrid({ program: program ?? null, weeks, benchmarks });
    })().catch(() => undefined);
  }, [repository]);
  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));
  const pull = useAppRefresh(refresh);

  if (loadingError) return <Screen><Title>Progreso</Title><EmptyState icon="alert-circle-outline" title="No pudimos cargar tus datos" detail="Tus registros siguen guardados en el teléfono." action="Reintentar" onAction={() => void refresh()}/></Screen>;

  const now = new Date();
  const today = localDateOfDevice(now);
  const sessions = overview?.sessionsThisWeek ?? 0;
  const weeks = streak?.weeks?.current ?? 0;
  const days = streak?.days.current ?? 0;
  const records = recentRecords(summary?.records ?? [], allRecords ? 50 : 4);
  const k = KINDS.find((x) => x.id === kind)!;
  const trend = bodyTrend(summary?.measurements ?? [], kind, now);
  const goal = goals?.[kind] ?? null;
  const chart = trend && trend.points.length > 1 ? chartPath(trend.points, goal, W, H) : null;
  const muscles = (volume?.items ?? []).filter((m) => m.sets > 0 || m.status === 'low');
  const scaleMax = Math.max(22, ...muscles.map((m) => m.sets));
  const month = monthSummary({ workouts: history, cardioDates, recordDates: (summary?.records ?? []).map((r) => r.measuredAt.slice(0, 10)) }, today);
  const weeksChart = weeklySessions([...history.map((h) => h.localDate), ...cardioDates], today);

  return <Screen refreshing={pull.refreshing} onRefresh={pull.onRefresh}>
    <BrandHeader/>
    <Title>Progreso</Title>

    <ImageBackground source={BRAND.cover} resizeMode="cover" style={s.hero} imageStyle={s.heroImg}>
      <View style={s.heroVeil}/>
      <Text style={s.heroEyebrow}>TU {month.monthName.toUpperCase()}</Text>
      <View style={s.heroStats}>
        <HeroStat icon="dumbbell" value={month.sessions} label="SESIONES"/>
        <HeroStat icon="layers-triple" value={month.sets} label="SERIES"/>
        <HeroStat icon="trophy" value={month.records} label="RÉCORDS"/>
      </View>
    </ImageBackground>

    <View style={s.tiles}>
      <View style={s.tile} accessibilityLabel={`${sessions} de ${goalDays} sesiones esta semana`}>
        <Text style={s.tileLabel}>ESTA SEMANA</Text>
        <Text style={s.big}>{sessions}<Text style={s.unit}> / {goalDays}</Text></Text>
        <View style={s.segments}>{Array.from({ length: goalDays }, (_, i) => <View key={i} style={[s.segment, i < sessions && s.segmentOn]}/>)}</View>
        <Text style={[s.tileFoot, sessions >= goalDays && { color: colors.green }]}>{sessions >= goalDays ? '¡Meta cumplida!' : `Te faltan ${goalDays - sessions}`}</Text>
      </View>
      <View style={s.tile} accessibilityLabel={weeks ? `Racha de ${weeks} semanas` : `Racha de ${days} días`}>
        <View style={s.rowBetween}><Text style={s.tileLabel}>RACHA</Text><AnimatedA lit={days > 0} size={30}/></View>
        <Text style={s.big}>{weeks || days}<Text style={s.unit}> {weeks ? (weeks === 1 ? 'semana' : 'semanas') : days === 1 ? 'día' : 'días'}</Text></Text>
        <Text style={s.tileFoot}>{streak?.days.best ? `Tu mejor: ${streak.days.best} días` : 'Entrena hoy para empezarla'}</Text>
      </View>
    </View>

    <View style={s.card}>
      <SectionTitle icon="chart-bar" color={colors.blue} title="Últimas 8 semanas"/>
      <WeeksChart weeks={weeksChart} goal={goalDays}/>
    </View>

    <View style={s.section}>
      <View style={s.rowBetween}><SectionTitle icon="trophy-variant" color={colors.amber} title="Récords"/>{(summary?.records.length ?? 0) > 4 ? <Pressable accessibilityRole="button" onPress={() => setAllRecords(!allRecords)} hitSlop={10}><Text style={s.more}>{allRecords ? 'Ver menos' : 'Ver todos'}</Text></Pressable> : null}</View>
      {records.length ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.recRow}>{records.map((r) => {
        const isToday = r.measuredAt.slice(0, 10) === today;
        return <View key={r.exerciseId} style={[s.recCard, isToday && s.recToday]} accessibilityLabel={`${r.exerciseName}: ${formatKg(r.weightKg)} kilos por ${r.reps ?? 'sin'} repeticiones`}>
          <View style={s.recIcon}><MaterialCommunityIcons name={isToday ? 'trophy' : 'weight-lifter'} size={20} color={colors.amber}/></View>
          <Text style={s.recValue}>{formatKg(r.weightKg)}<Text style={s.unitSm}> kg</Text>{r.reps ? <Text style={s.unitSm}> × {r.reps}</Text> : null}</Text>
          <Text style={s.recName} numberOfLines={2}>{r.exerciseName}</Text>
          <Text style={[s.recDate, isToday && { color: colors.accentText }]}>{isToday ? 'Récord de hoy' : dayLabel(r.measuredAt.slice(0, 10), today)}</Text>
        </View>;
      })}</ScrollView> : <View style={s.card}><Text style={s.muted}>Tus récords aparecen cuando registras series con peso.</Text></View>}
    </View>

    <View style={s.card}>
      <View style={s.kinds}>{KINDS.map((x) => <Pressable key={x.id} accessibilityRole="button" accessibilityState={{ selected: kind === x.id }} onPress={() => setKind(x.id)} style={[s.kind, kind === x.id && s.kindOn]}><Text style={[s.kindText, kind === x.id && s.kindTextOn]}>{x.title}</Text></Pressable>)}</View>
      {trend ? <View style={s.rowBetween}>
        <View><Text style={s.big}>{trend.latest}<Text style={s.unit}> {k.unit}</Text></Text>
          {trend.change !== null ? <Text style={[s.change, { color: trend.change <= 0 ? colors.green : colors.amber }]}>{trend.change > 0 ? '+' : ''}{trend.change} {k.unit} en {trend.weeks} {trend.weeks === 1 ? 'semana' : 'semanas'}</Text> : null}</View>
        {goal !== null ? <View style={s.goal}><View style={s.goalDot}/><Text style={s.goalText}>Meta: {goal} {k.unit}</Text></View> : null}
      </View> : <Text style={s.muted}>Aún no registras tu {k.title.toLowerCase()}.</Text>}
      {chart ? <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} accessibilityLabel={`Tendencia de ${k.title.toLowerCase()}`}>
        <Line x1={0} x2={W} y1={H / 2} y2={H / 2} stroke={colors.border} strokeWidth={1}/>
        {chart.goalY !== null ? <Line x1={0} x2={W} y1={chart.goalY} y2={chart.goalY} stroke={colors.amber} strokeWidth={1.5} strokeDasharray="5,5"/> : null}
        <Polyline points={chart.line} fill="none" stroke={colors.blue} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round"/>
        <Circle cx={chart.last.x} cy={chart.last.y} r={5} fill={colors.blue} stroke={colors.text} strokeWidth={2}/>
      </Svg> : null}
      <ActionButton secondary onPress={() => setSheet(true)}>{kind === 'weight_kg' ? 'Registrar peso de hoy' : `Registrar ${k.title.toLowerCase()}`}</ActionButton>
    </View>

    <View style={s.section}>
      <View style={s.rowBetween}><SectionTitle icon="arm-flex" color={colors.green} title="Series por músculo · 7 días"/>{muscles.length > 5 ? <Pressable accessibilityRole="button" onPress={() => setAllMuscles(!allMuscles)} hitSlop={10}><Text style={s.more}>{allMuscles ? 'Ver menos' : 'Ver todos'}</Text></Pressable> : null}</View>
      {volume && volume.totalSets > 0
        ? <View style={s.card}>{(allMuscles ? muscles : muscles.slice(0, 5)).map((item) => <MuscleVolumeRow key={item.muscle} item={item} scaleMax={scaleMax}/>)}</View>
        : <View style={s.card}><Text style={s.muted}>Registra series esta semana y verás qué músculos trabajaste.</Text></View>}
    </View>

    <View style={s.section}><SectionTitle icon="run-fast" color={colors.cyan} title="Cardio"/><CardioProgress/></View>

    {hybrid.program || hybrid.benchmarks.length || load ? <View style={s.section}>
      <SectionTitle icon="lightning-bolt" color={colors.amber} title="Modo híbrido"/>
      {hybrid.program ? <CycleCard program={hybrid.program} load={load} today={today}/> : null}
      {load ? <LoadCard load={load}/> : null}
      {hybrid.program && hybrid.weeks.length ? <AdherenceCard weeks={hybrid.weeks}/> : null}
      {hybrid.benchmarks.length ? <BenchmarksCard items={hybrid.benchmarks}/> : null}
    </View> : null}

    <MeasurementSheet visible={sheet} kind={kind} onClose={() => setSheet(false)} measurements={summary?.measurements ?? []} goal={goal}
      onSave={async (value) => { await repository?.addBodyMeasurement(BodyMeasurementSchema.parse({ type: kind, value, measuredAt: new Date().toISOString() })); await refresh(); }}
      onDelete={async (item) => { await repository?.tombstoneBodyMeasurement(item.id); await refresh(); }}
      onSaveGoal={async (v) => { await repository?.saveBodyGoal(kind, v); setGoals(await repository!.getBodyGoals()); }}/>
  </Screen>;
}

function HeroStat({ icon, value, label }: { icon: string; value: number; label: string }) {
  return <View style={s.heroStat}><MaterialCommunityIcons name={icon as never} size={20} color="white"/><Text style={s.heroValue}>{value}</Text><Text style={s.heroLabel}>{label}</Text></View>;
}

function SectionTitle({ icon, color, title }: { icon: string; color: string; title: string }) {
  return <View style={s.secTitle}><View style={[s.secIcon, { borderColor: color }]}><MaterialCommunityIcons name={icon as never} size={16} color={color}/></View><Text style={s.secText}>{title}</Text></View>;
}

/** Barras de sesiones por semana con la meta punteada; la semana actual en rojo. */
function WeeksChart({ weeks, goal }: { weeks: ReadonlyArray<{ start: string; count: number; current: boolean; label: string }>; goal: number }) {
  const CW = 320, CH = 140, top = 16, bottom = 22;
  const max = Math.max(goal + 1, ...weeks.map((w) => w.count));
  const slot = CW / weeks.length; const bw = slot * 0.56;
  const y = (v: number) => top + (CH - top - bottom) * (1 - v / max);
  const total = weeks.reduce((n, w) => n + w.count, 0);
  const hit = weeks.filter((w) => w.count >= goal).length;
  return <View style={{ gap: 8 }}>
    <Svg width="100%" height={CH} viewBox={`0 0 ${CW} ${CH}`} accessibilityLabel={`Sesiones por semana: ${weeks.map((w) => w.count).join(', ')}`}>
      <Line x1={0} x2={CW} y1={y(goal)} y2={y(goal)} stroke={colors.amber} strokeWidth={1.5} strokeDasharray="5,5"/>
      {weeks.map((w, i) => {
        const h = Math.max(3, CH - bottom - y(w.count));
        const x = i * slot + (slot - bw) / 2;
        return [
          <Rect key={`b${w.start}`} x={x} y={CH - bottom - h} width={bw} height={h} rx={6} fill={w.current ? colors.blue : w.count >= goal ? colors.green : colors.surfaceRaised}/>,
          w.count ? <SvgText key={`v${w.start}`} x={x + bw / 2} y={CH - bottom - h - 4} fill={colors.text} fontSize={11} fontWeight="700" textAnchor="middle">{w.count}</SvgText> : null,
          <SvgText key={`l${w.start}`} x={x + bw / 2} y={CH - 6} fill={w.current ? colors.text : colors.muted} fontSize={9} textAnchor="middle">{w.current ? 'HOY' : w.label}</SvgText>,
        ];
      })}
    </Svg>
    <View style={s.legend}>
      <View style={s.legendItem}><View style={[s.legendDot, { backgroundColor: colors.green }]}/><Text style={s.legendText}>{hit} de {weeks.length} semanas en tu meta</Text></View>
      <Text style={s.legendText}>{total} sesiones</Text>
    </View>
  </View>;
}

/** Registrar una medida, poner su meta y borrar registros: en una hoja para que Progreso quede limpio. */
function MeasurementSheet({ visible, kind, measurements, goal, onClose, onSave, onDelete, onSaveGoal }: {
  visible: boolean; kind: Kind; measurements: readonly BodyMeasurement[]; goal: number | null; onClose: () => void;
  onSave: (value: number) => Promise<void>; onDelete: (item: BodyMeasurement) => Promise<void>; onSaveGoal: (value: number | null) => Promise<void>;
}) {
  const k = KINDS.find((x) => x.id === kind)!;
  const [value, setValue] = useState('');
  const [goalDraft, setGoalDraft] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const num = (x: string) => Number(x.trim().replace(',', '.'));
  const mine = measurements.filter((m) => m.type === kind).slice(0, 6);
  async function save() {
    const parsed = BodyMeasurementSchema.safeParse({ type: kind, value: num(value), measuredAt: new Date().toISOString() });
    if (!value.trim() || !parsed.success) { setError(parsed.success ? 'Escribe un valor.' : parsed.error.issues[0]?.message ?? 'Revisa el valor.'); return; }
    setBusy(true); setError('');
    try { await onSave(parsed.data.value); setValue(''); onClose(); } catch { setError('No se pudo guardar.'); } finally { setBusy(false); }
  }
  async function saveGoal() {
    const v = goalDraft.trim() === '' ? null : num(goalDraft);
    if (v !== null && (!Number.isFinite(v) || v < 20 || v > 400)) { setError(`La meta debe estar entre 20 y 400 ${k.unit}.`); return; }
    try { await onSaveGoal(v); setGoalDraft(''); setError(''); } catch { setError('No se pudo guardar la meta.'); }
  }
  return <Sheet visible={visible} title={`Registrar ${k.title.toLowerCase()}`} onClose={onClose}>
    <AppInput label={`${k.title} de hoy (${k.unit})`} defaultValue="" onChangeText={setValue} keyboardType="decimal-pad" placeholder={kind === 'weight_kg' ? '76.5' : '82'}/>
    {error ? <Text accessibilityRole="alert" style={st.error}>{error}</Text> : null}
    <ActionButton loading={busy} onPress={() => void save()}>Guardar</ActionButton>
    <Text style={st.label}>META{goal !== null ? ` · AHORA ${goal} ${k.unit}` : ''}</Text>
    <View style={st.row}><View style={st.flex}><AppInput label={`Meta (${k.unit}), vacío para quitarla`} defaultValue="" onChangeText={setGoalDraft} keyboardType="decimal-pad"/></View></View>
    <ActionButton secondary onPress={() => void saveGoal()}>Guardar meta</ActionButton>
    {mine.length ? <><Text style={st.label}>ÚLTIMOS REGISTROS</Text>{mine.map((m) => <View key={m.id} style={sh.item}>
      <Text style={sh.text}>{new Date(m.measuredAt).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })} · {m.value} {m.unit}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel={`Borrar registro de ${m.value} ${m.unit}`} onPress={() => void onDelete(m)} hitSlop={10} style={sh.del}><Ionicons name="trash-outline" size={18} color={colors.red}/></Pressable>
    </View>)}</> : null}
  </Sheet>;
}

const sh = themed(() => StyleSheet.create({
  item: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44, borderBottomWidth: 1, borderBottomColor: colors.border },
  text: { color: colors.text, fontSize: 14 }, del: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
}));
const s = themed(() => StyleSheet.create({
  hero: { borderRadius: 22, overflow: 'hidden', padding: 16, gap: 12, backgroundColor: colors.surfaceRaised },
  heroImg: { borderRadius: 22 },
  heroVeil: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.55)' },
  heroEyebrow: { color: '#F5B841', fontSize: 12, fontWeight: '900', letterSpacing: 1 },
  heroStats: { flexDirection: 'row', justifyContent: 'space-between' },
  heroStat: { flex: 1, alignItems: 'center', gap: 2 },
  heroValue: { color: 'white', fontSize: 34, lineHeight: 38, ...display }, heroLabel: { color: 'rgba(255,255,255,0.8)', fontSize: 10, fontWeight: '800', letterSpacing: 0.8 },
  secTitle: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  secIcon: { width: 28, height: 28, borderRadius: 9, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  secText: { color: colors.text, fontSize: 16, fontWeight: '800' },
  legend: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 }, legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { color: colors.secondary, fontSize: 12 },
  recRow: { gap: 10, paddingRight: 4 },
  recCard: { width: 140, borderRadius: 18, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: 12, gap: 4 },
  recToday: { borderColor: colors.amber },
  recIcon: { width: 34, height: 34, borderRadius: 11, backgroundColor: colors.amberSoft, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  recValue: { color: colors.text, fontSize: 28, lineHeight: 30, ...display },
  recName: { color: colors.text, fontSize: 13, fontWeight: '700' }, recDate: { color: colors.secondary, fontSize: 11 },
  flex: { flex: 1 }, section: { gap: 10 }, rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  tiles: { flexDirection: 'row', gap: 12 },
  tile: { flex: 1, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 18, padding: 14, gap: 6 },
  tileLabel: { color: colors.secondary, fontSize: 12, fontWeight: '700', letterSpacing: 1 },
  tileFoot: { color: colors.secondary, fontSize: 12 },
  big: { color: colors.text, fontSize: 46, lineHeight: 48, ...display },
  unit: { color: colors.secondary, fontSize: 15, fontFamily: undefined, textTransform: 'none', fontWeight: '500' },
  unitSm: { color: colors.secondary, fontSize: 14, fontFamily: undefined, textTransform: 'none' },
  segments: { flexDirection: 'row', gap: 5 }, segment: { flex: 1, height: 8, borderRadius: 4, backgroundColor: colors.surfaceRaised }, segmentOn: { backgroundColor: colors.green },
  heading: { color: colors.secondary, fontSize: 13, fontWeight: '700', letterSpacing: 1 },
  more: { color: colors.accentText, fontSize: 13, fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 10 },
  rowTitle: { color: colors.text, fontSize: 22, lineHeight: 25, ...displayBold }, rowDetail: { color: colors.green, fontSize: 12 },
  rowValue: { color: colors.text, fontSize: 24, ...display },
  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 18, padding: 16, gap: 12 },
  muted: { color: colors.secondary, fontSize: 13, lineHeight: 19 },
  change: { fontSize: 13, fontWeight: '700' },
  goal: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, minHeight: 30, borderRadius: 15, backgroundColor: colors.surfaceRaised },
  goalDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.amber }, goalText: { color: colors.text, fontSize: 12, fontWeight: '600' },
  kinds: { flexDirection: 'row', gap: 6 },
  kind: { flex: 1, minHeight: 36, borderRadius: 10, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  kindOn: { borderColor: colors.blue, backgroundColor: colors.accentSoft }, kindText: { color: colors.secondary, fontSize: 12, fontWeight: '700' }, kindTextOn: { color: colors.accentText },
}));
