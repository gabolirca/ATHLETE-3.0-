import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { BrandHeader } from '@/brand/BrandHeader';
import { AnimatedA } from '@/brand/AnimatedA';
import { StreakCelebration, getSeenStreak, setSeenStreak, shouldCelebrate } from '@/brand/StreakCelebration';
import { ActionButton } from '@/components/ActionButton';
import { EmptyState } from '@/components/EmptyState';
import { Title } from '@/components/Typography';
import { Screen } from '@/components/Screen';
import { useLocalDataReady, useTrainingRepository } from '@/data/MobileTrainingContext';
import type { StreakSummary, TrainingOverview } from '@/data/trainingTypes';
import { nextPhrase, sessionPhrase } from '@/brand/vibe';
import { AppState } from 'react-native';
import { StatChip } from '@/brand/ZoneIcon';
import { useAppRefresh } from '@/brand/useAppRefresh';
import { weeklyGoal } from '@/progress/progressView';
import { closeIfStale } from '@/workout/staleSession';
import { weekDays } from '@/lib/week';
import { daySummary, modalityInfo, todayWeekday } from '@/program/format';
import { useProgram, useStartDay } from '@/program/useProgram';
import { DailyWeightCard } from '@/progress/DailyWeightCard';
import { localDateOfDevice } from '@/lib/localDate';
import { getOnboardingDone } from '@/settings/devicePrefs';
import { colors, themed } from '@/theme/colors';
import { display } from '@/theme/fonts';

/** "Buenos días" / "Buenas tardes" / "Buenas noches" según la hora del teléfono. */
export function greeting(now: Date): string {
  const h = now.getHours();
  return h >= 5 && h < 12 ? 'Buenos días' : h >= 12 && h < 19 ? 'Buenas tardes' : 'Buenas noches';
}

/** Iniciales para el avatar (hasta 2). Vacío si no hay nombre. */
export function initials(name: string): string {
  return name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('');
}

/**
 * Inicio: UNA decisión. "Hoy te toca" sale de tu programa (fuerza, WOD, nado o carrera) y EMPEZAR te lleva directo.
 * Sin programa: entrenamiento libre o elegir un programa. Debajo lo que motiva a volver: tu semana, tu racha y tu peso.
 */
export default function HomeScreen() {
  const router = useRouter();
  const repository = useTrainingRepository();
  const { ready, error } = useLocalDataReady();
  const hybrid = useProgram();
  const startDay = useStartDay();
  const [overview, setOverview] = useState<TrainingOverview | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [name, setName] = useState('');
  const [streak, setStreak] = useState<StreakSummary | null>(null);
  const [doneDates, setDoneDates] = useState<string[]>([]);
  const [daySets, setDaySets] = useState<Record<string, number>>({});
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState('');
  const [party, setParty] = useState<{ from: number; to: number } | null>(null);
  const [goal, setGoal] = useState(4);
  const [notice, setNotice] = useState('');
  const [phrase, setPhrase] = useState(sessionPhrase);
  // Cada vez que vuelves a abrir la app, otra frase.
  useEffect(() => { const sub = AppState.addEventListener('change', (st) => { if (st === 'active') setPhrase(nextPhrase()); }); return () => sub.remove(); }, []);

  // Primera vez en este teléfono: el asistente de bienvenida (una sola vez; después se repite desde el Perfil).
  useEffect(() => {
    if (!ready) return;
    void getOnboardingDone().then((done) => { if (!done) router.push('/onboarding'); });
  }, [ready, router]);

  const load = useCallback((isActive: () => boolean = () => true) => {
    if (!repository) return Promise.resolve();
    repository.getPreferences().then((p) => { if (isActive()) setName(p.displayName); }).catch(() => undefined);
    repository.getAthleteProfile().then((p) => { if (isActive()) setGoal(weeklyGoal(p.goals)); }).catch(() => undefined);
    repository.getStreak().then(async (v) => {
      if (!isActive()) return;
      setStreak(v);
      // Festejo tipo Duolingo: solo cuando la racha subió desde la última vez que la viste.
      const seen = await getSeenStreak();
      if (isActive() && shouldCelebrate(v.days.current, seen, v.days.todayDone)) setParty({ from: seen ?? 0, to: v.days.current });
      else if (seen === null || v.days.current < seen) void setSeenStreak(v.days.current);
    }).catch(() => undefined);
    repository.listHistory().then((items) => {
      if (!isActive()) return;
      setDoneDates(items.map((w) => localDateOfDevice(new Date(w.startedAt))));
      const sets: Record<string, number> = {};
      for (const it of items) {
        const d = localDateOfDevice(new Date(it.startedAt));
        sets[d] = (sets[d] ?? 0) + it.setCount;
      }
      setDaySets(sets);
    }).catch(() => undefined);
    return repository.getOverview().then(async (value) => {
      // Sesión olvidada (más de 12 h abierta): se cierra sola para que Inicio no diga "en curso" para siempre.
      const closed = await closeIfStale(repository, value.latestWorkout).catch(() => null);
      const fresh = closed ? await repository.getOverview() : value;
      if (!isActive()) return;
      if (closed) setNotice(closed === 'closed' ? 'Cerramos tu sesión anterior que se quedó abierta; quedó guardada en tu historial.' : 'Descartamos una sesión vacía que se quedó abierta.');
      setOverview(fresh); setLoadError(false);
    }).catch(() => { if (isActive()) setLoadError(true); });
  }, [repository]);

  useFocusEffect(useCallback(() => {
    let active = true;
    void load(() => active);
    return () => { active = false; };
  }, [load]));
  const refresh = useAppRefresh(useCallback(() => { setPhrase(nextPhrase()); return Promise.all([load(), hybrid.refresh()]); }, [load, hybrid]));

  if (error || loadError) return <Screen><Title>Inicio</Title><EmptyState icon="cloud-offline-outline" title="No pudimos leer tus datos locales" detail="Tus sesiones siguen guardadas. Vuelve a intentar en un momento." action="Reintentar" onAction={() => repository?.getOverview().then(setOverview).catch(() => setLoadError(true))} /></Screen>;

  const now = new Date();
  const date = new Intl.DateTimeFormat('es-MX', { weekday: 'long', day: 'numeric', month: 'long' }).format(now);
  const activeWorkout = overview?.latestWorkout?.state === 'active' ? overview.latestWorkout : null;
  const week = weekDays(doneDates, now);
  const weeksStreak = streak?.weeks?.current ?? 0;
  const daysStreak = streak?.days.current ?? 0;
  const doneThisWeek = week.filter((d) => d.done).length;
  const weekSets = week.reduce((n, d) => n + (daySets[d.localDate] ?? 0), 0);
  const maxSets = Math.max(20, ...week.map((d) => daySets[d.localDate] ?? 0));
  const pct = Math.min(100, Math.round((doneThisWeek / Math.max(1, goal)) * 100));
  const program = hybrid.program;
  const todays = program ? program.days.filter((d) => d.weekday === todayWeekday(now)) : [];
  const pending = todays.find((d) => !(hybrid.status[d.id] && !hybrid.status[d.id]!.active)) ?? null;
  const allDone = todays.length > 0 && !pending;
  const info = modalityInfo(pending?.modality ?? null);

  async function start() {
    if (starting) return;
    if (activeWorkout) { router.push(`/workout/${activeWorkout.id}`); return; }
    if (!pending) { router.push(allDone && program ? `/program/${program.id}` : '/workout/new'); return; }
    setStarting(true); setStartError('');
    try { await startDay(pending, hybrid.status[pending.id]); }
    catch { setStartError('No se pudo iniciar la sesión. Intenta de nuevo.'); }
    finally { setStarting(false); }
  }

  return <Screen refreshing={refresh.refreshing} onRefresh={refresh.onRefresh}>
    <BrandHeader initials={initials(name)}/>
    <View style={s.rowBetween}>
      <View style={s.flex}><Text style={s.date}>{date}</Text><Title>{name ? `Hola, ${name.split(' ')[0]}` : greeting(now)}</Title></View>
      {daysStreak > 0 ? <Pressable accessibilityRole="button" style={s.chip} accessibilityLabel={`Racha de ${daysStreak} ${daysStreak === 1 ? 'día' : 'días'}`} onPress={() => setParty({ from: Math.max(0, daysStreak - 1), to: daysStreak })}><AnimatedA lit size={28}/><Text style={s.chipText}>{daysStreak} {daysStreak === 1 ? 'DÍA' : 'DÍAS'}</Text></Pressable> : null}
    </View>

    <View style={s.quote}><Text style={s.quoteMark}>“</Text><Text style={s.phrase}>{phrase}</Text></View>
    {notice ? <Text style={s.notice}>{notice}</Text> : null}
    <View style={s.hero}>
      <View style={s.glow} pointerEvents="none"/>
      <View style={s.rowBetween}>
        <View style={s.liveRow}><View style={s.liveDot}/><Text style={s.heroTag}>{activeWorkout ? 'SESIÓN EN CURSO' : pending ? 'HOY TE TOCA' : allDone ? 'HOY YA CUMPLISTE' : program ? 'HOY DESCANSAS' : 'ENTRENA HOY'}</Text></View>
        {program && !activeWorkout ? <Text style={s.dayPill}>{program.name.toUpperCase()}</Text> : null}
      </View>
      <View style={s.heroMain}>
        <View style={[s.modTile, { backgroundColor: `${info.color}22` }]}><Ionicons name={(activeWorkout ? 'play' : allDone ? 'checkmark-done' : info.icon) as never} size={32} color={allDone ? colors.green : info.color}/></View>
        <View style={s.flex}>
          {pending && !activeWorkout ? <Text style={s.focus}>{info.label.toUpperCase()}</Text> : null}
          <Text style={s.heroTitle} numberOfLines={2}>{activeWorkout ? 'Sigue donde ibas' : pending ? pending.name : allDone ? '¡Bien hecho!' : program ? 'Recupera' : 'Entrenamiento libre'}</Text>
        </View>
      </View>
      {activeWorkout ? <Text style={s.heroDetail}>{activeWorkout.exerciseCount} ejercicios · {activeWorkout.setCount} series registradas</Text>
        : pending ? <><Text style={s.heroDetail}>{daySummary(pending)}</Text>
          {pending.targetDurationMinutes || pending.targetRpe ? <View style={s.chips}>
            {pending.targetDurationMinutes ? <StatChip icon="timer-outline" value={`${pending.targetDurationMinutes} MIN`} label="TIEMPO" tone="red"/> : null}
            {pending.targetRpe ? <StatChip icon="speedometer" value={`RPE ${pending.targetRpe}`} label="ESFUERZO" tone="amber"/> : null}
          </View> : null}</>
        : <Text style={s.heroDetail}>{allDone ? 'Ya hiciste lo de hoy en tu programa. Mañana sigue.' : program ? `Hoy no hay sesión en ${program.name}. Si quieres, entrena libre.` : 'Elige un programa en Entrenar o empieza una sesión libre.'}</Text>}
      <ActionButton loading={starting} onPress={() => void start()}>{activeWorkout ? 'Continuar  →' : allDone ? 'Ver mi semana  →' : 'Empezar  →'}</ActionButton>
      {startError ? <Text accessibilityRole="alert" style={s.error}>{startError}</Text> : null}
    </View>


    <Pressable accessibilityRole="button" accessibilityLabel="Tu semana: ver progreso" onPress={() => router.push('/progress')} style={s.card}>
      <View style={s.rowBetween}>
        <View style={s.titleRow}><View style={s.iconBubble}><MaterialCommunityIcons name="calendar-check" size={16} color={colors.blue}/></View><Text style={s.cardTitle}>Tu semana</Text></View>
        <Text style={s.pct}>{doneThisWeek} de {goal} días · {pct}%</Text>
      </View>
      <View style={s.chart}>{week.map((d) => {
        const n = daySets[d.localDate] ?? 0;
        const h = n ? Math.max(14, Math.round((n / maxSets) * 96)) : 6;
        return <View key={d.localDate} style={s.col} accessibilityLabel={`${d.localDate}: ${n} series`}>
          <Text style={[s.colValue, !n && s.colValueOff]}>{n || ''}</Text>
          <View style={[s.colBar, { height: h }, n ? (d.today ? s.colToday : s.colDone) : (d.today ? s.colTodayEmpty : s.colEmpty)]}/>
          <Text style={[s.dayLabel, d.today && s.dayLabelToday]}>{d.today ? 'HOY' : d.label}</Text>
        </View>;
      })}</View>
      <View style={s.weekStats}>
        <View style={s.weekStat}><Text style={s.weekStatValue}>{weekSets}</Text><Text style={s.weekStatLabel}>SERIES</Text></View>
        <View style={s.weekStat}><Text style={s.weekStatValue}>{doneThisWeek}</Text><Text style={s.weekStatLabel}>DÍAS</Text></View>
        <View style={s.weekStat}><Text style={[s.weekStatValue, { color: colors.green }]}>{pct}%</Text><Text style={s.weekStatLabel}>DE TU META</Text></View>
      </View>
      {weeksStreak > 0 ? <Text style={s.muted}>Racha: {weeksStreak} {weeksStreak === 1 ? 'semana' : 'semanas'} cumpliendo tu meta 🔥</Text> : null}
    </Pressable>

    {repository ? <DailyWeightCard repository={repository}/> : null}

    <StreakCelebration from={party?.from ?? 0} to={party?.to ?? null} onClose={() => { if (party) void setSeenStreak(party.to); setParty(null); }}/>
  </Screen>;
}

const s = themed(() => StyleSheet.create({
  flex: { flex: 1 }, rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  date: { color: colors.secondary, fontSize: 13, textTransform: 'capitalize' },
  quote: { flexDirection: 'row', gap: 8, paddingLeft: 12, borderLeftWidth: 3, borderLeftColor: colors.blue },
  quoteMark: { color: colors.blue, fontSize: 34, lineHeight: 34, ...display },
  phrase: { flex: 1, color: colors.text, fontSize: 24, lineHeight: 27, ...display },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 4, paddingRight: 12, minHeight: 44, borderRadius: 22, backgroundColor: colors.accentDeep },
  chipText: { color: colors.text, fontSize: 18, ...display },
  hero: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 22, padding: 18, gap: 14, overflow: 'hidden' },
  glow: { position: 'absolute', right: -50, top: -50, width: 170, height: 170, borderRadius: 85, backgroundColor: colors.accentSoft, opacity: 0.7 },
  liveRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  liveDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: colors.blue },
  heroTag: { color: colors.text, fontSize: 12, fontWeight: '800', letterSpacing: 1 },
  dayPill: { color: colors.green, fontSize: 11, fontWeight: '800', letterSpacing: 0.6, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 8, backgroundColor: colors.greenSoft, overflow: 'hidden' },
  heroMain: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  focus: { color: colors.accentText, fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  heroTitle: { color: colors.text, fontSize: 40, lineHeight: 42, ...display },
  heroDetail: { color: colors.secondary, fontSize: 14 },
  chips: { flexDirection: 'row', gap: 8 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  muted: { color: colors.secondary, fontSize: 13 }, error: { color: colors.red, fontSize: 12 },
  notice: { color: colors.secondary, fontSize: 12, backgroundColor: colors.surfaceRaised, padding: 10, borderRadius: 12, overflow: 'hidden' },
  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 18, padding: 16, gap: 12 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  iconBubble: { width: 30, height: 30, borderRadius: 9, backgroundColor: colors.surfaceRaised, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { color: colors.text, fontSize: 15, fontWeight: '800' },
  pct: { color: colors.green, fontSize: 12, fontWeight: '800' },
  bar: { height: 8, borderRadius: 4, backgroundColor: colors.surfaceRaised, overflow: 'hidden' },
  barFill: { height: 8, borderRadius: 4, backgroundColor: colors.green },
  week: { flexDirection: 'row', gap: 7 }, day: { flex: 1, alignItems: 'center', gap: 5 },
  dayBox: { alignSelf: 'stretch', aspectRatio: 1, maxHeight: 42, borderRadius: 10, backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  chart: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, height: 140, paddingTop: 6 },
  col: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', gap: 5 },
  colBar: { alignSelf: 'stretch', borderRadius: 8 },
  colDone: { backgroundColor: colors.green }, colToday: { backgroundColor: colors.blue },
  colEmpty: { backgroundColor: colors.surfaceRaised }, colTodayEmpty: { backgroundColor: colors.accentSoft, borderWidth: 1, borderColor: colors.blue, borderStyle: 'dashed' },
  colValue: { color: colors.text, fontSize: 12, fontWeight: '800' }, colValueOff: { color: colors.secondary },
  weekStats: { flexDirection: 'row', gap: 8 },
  weekStat: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 12, backgroundColor: colors.surfaceRaised },
  weekStatValue: { color: colors.text, fontSize: 24, lineHeight: 26, ...display },
  weekStatLabel: { color: colors.secondary, fontSize: 9, fontWeight: '800', letterSpacing: 0.6 },
  dayDone: { backgroundColor: colors.green, borderColor: colors.green }, dayToday: { borderColor: colors.blue, borderWidth: 2 },
  todayDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.blue },
  dayLabel: { color: colors.secondary, fontSize: 12, fontWeight: '700' }, dayLabelToday: { color: colors.blue, fontWeight: '800' },
  dayFoot: { fontSize: 9, fontWeight: '800', color: colors.secondary, minHeight: 11 },
  modTile: { width: 64, height: 64, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
}));
