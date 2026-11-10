import { useCallback, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { AnimatedA } from '@/brand/AnimatedA';
import { Card } from '@/components/Card';
import { Screen } from '@/components/Screen';
import { useTrainingRepository } from '@/data/MobileTrainingContext';
import type { BenchmarkItem, CardioEntry, ExerciseRecord, Program, StreakSummary, Workout } from '@/data/trainingTypes';
import { HybridCard } from '@/program/HybridCard';
import { achievements } from '@/profile/achievements';
import { colors } from '@/theme/colors';

type Tab = 'grid' | 'logros' | 'programa';
type Tile = { id: string; kind: 'workout' | 'cardio'; date: string; title: string; sub: string };
const LEVEL: Record<string, string> = { beginner: 'Principiante', intermediate: 'Intermedio', advanced: 'Avanzado' };
const CARDIO: Record<string, string> = { run: 'Carrera', walk: 'Caminata', bike: 'Bici', row: 'Remo', swim: 'Nado', elliptical: 'Elíptica', stairs: 'Escaladora', other: 'Cardio' };
const initials = (n: string) => n.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('');

/**
 * Perfil tipo Instagram, PRIVADO: solo tú lo ves (ATHLETE no es red social; se comparte con las tarjetas).
 * Encabezado con tus números, destacados con tus mejores marcas y pestañas: cuadrícula, logros y programa.
 */
export default function ProfileScreen() {
  const router = useRouter();
  const repository = useTrainingRepository();
  const [tab, setTab] = useState<Tab>('grid');
  const [data, setData] = useState<{
    name: string; goal: string | null; level: string | null; workouts: Workout[]; cardio: CardioEntry[]; streak: StreakSummary | null;
    records: ExerciseRecord[]; benchmarks: BenchmarkItem[]; program: Program | null; status: Record<string, unknown>;
  } | null>(null);

  useFocusEffect(useCallback(() => {
    let alive = true;
    if (!repository) return;
    void (async () => {
      const [prefs, athlete, workouts, cardio, streak, progress, benchmarks, programs] = await Promise.all([
        repository.getPreferences(), repository.getAthleteProfile().catch(() => null), repository.listHistory().catch(() => []),
        repository.listCardio().catch(() => []), repository.getStreak().catch(() => null), repository.getProgress().catch(() => null),
        repository.getBenchmarks().catch(() => []), repository.listPrograms().catch(() => []),
      ]);
      const program = programs[0] ?? null;
      const status = program ? await repository.programWeekStatus(program.id).catch(() => ({})) : {};
      if (alive) setData({
        name: prefs.displayName, goal: athlete?.goals[0] ?? null, level: athlete?.experienceLevel ? LEVEL[athlete.experienceLevel] ?? null : null,
        workouts: workouts.filter((w) => w.state === 'completed'), cardio, streak, records: progress?.records ?? [], benchmarks, program, status,
      });
    })().catch(() => undefined);
    return () => { alive = false; };
  }, [repository]));

  const tiles: Tile[] = data ? [
    ...data.workouts.map((w) => ({ id: w.id, kind: 'workout' as const, date: w.startedAt, title: `${w.exerciseCount} ejerc.`, sub: w.durationMinutes ? `${w.durationMinutes} min` : `${w.setCount} series` })),
    ...data.cardio.map((c) => ({ id: c.id, kind: 'cardio' as const, date: c.startedAt, title: CARDIO[c.activity] ?? 'Cardio', sub: c.distanceMeters ? `${Math.round(c.distanceMeters / 100) / 10} km` : `${Math.round(c.durationSeconds / 60)} min` })),
  ].sort((a, b) => b.date.localeCompare(a.date)) : [];
  const total = tiles.length;
  const done = data ? achievements({
    workouts: data.workouts.length, cardio: data.cardio.length, bestStreak: data.streak?.days.best ?? 0,
    weeksCompleted: data.streak?.weeks?.best ?? 0, records: data.records.length, benchmarks: data.benchmarks.length,
  }) : [];
  const highlights = data ? [
    ...(data.streak && data.streak.days.best > 0 ? [{ key: 'streak', top: String(data.streak.days.best), label: 'Mejor racha' }] : []),
    ...data.records.slice(0, 4).map((r) => ({ key: r.exerciseId, top: `${r.weightKg}`, label: r.exerciseName })),
    ...data.benchmarks.slice(0, 2).map((b) => ({ key: b.key, top: b.points.at(-1)?.roundsCompleted ? `${b.points.at(-1)!.roundsCompleted}r` : 'WOD', label: b.name })),
  ] : [];

  return <Screen>
    <View style={s.top}>
      <Pressable accessibilityRole="button" accessibilityLabel="Regresar" hitSlop={12} onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}><Text style={s.back}>‹ Regresar</Text></Pressable>
      <View style={s.lock}><Ionicons name="lock-closed" size={12} color={colors.secondary}/><Text style={s.lockText}>Privado</Text></View>
      <Pressable accessibilityRole="button" accessibilityLabel="Ajustes" hitSlop={12} onPress={() => router.push('/settings')}><Ionicons name="settings-outline" size={22} color={colors.text}/></Pressable>
    </View>

    <View style={s.header}>
      <View style={s.avatar}><Text style={s.avatarText}>{data?.name ? initials(data.name) : ''}</Text>{!data?.name ? <Ionicons name="person" size={30} color={colors.secondary}/> : null}</View>
      <View style={s.stats}>
        <Stat value={String(total)} label="Sesiones"/>
        <View style={s.stat}><View style={s.streakRow}><AnimatedA lit={(data?.streak?.days.current ?? 0) > 0} size={26}/><Text style={s.statValue}>{data?.streak?.days.current ?? 0}</Text></View><Text style={s.statLabel}>Racha</Text></View>
        <Stat value={String(data?.streak?.weeks?.current ?? 0)} label="Semanas"/>
      </View>
    </View>
    <View>
      <Text style={s.name}>{data?.name || 'Tu nombre'}</Text>
      <Text style={s.bio}>{[data?.goal, data?.level, data?.program?.name].filter(Boolean).join(' · ') || 'Completa el asistente para definir tu meta.'}</Text>
    </View>
    <View style={s.actions}>
      <Pressable accessibilityRole="button" onPress={() => router.push('/settings')} style={s.action}><Text style={s.actionText}>Editar perfil</Text></Pressable>
      <Pressable accessibilityRole="button" onPress={() => router.push('/progress')} style={s.action}><Text style={s.actionText}>Mi progreso</Text></Pressable>
    </View>

    {highlights.length ? <View style={s.highlights}>{highlights.map((h) => <View key={h.key} style={s.hl}>
      <View style={s.hlCircle}><Text style={s.hlTop} numberOfLines={1}>{h.top}</Text></View>
      <Text style={s.hlLabel} numberOfLines={1}>{h.label}</Text>
    </View>)}</View> : null}

    <View style={s.tabs}>{([['grid', 'grid-outline', 'Entrenamientos'], ['logros', 'ribbon-outline', 'Logros'], ['programa', 'calendar-outline', 'Programa']] as const).map(([key, icon, label]) =>
      <Pressable key={key} accessibilityRole="tab" accessibilityLabel={label} accessibilityState={{ selected: tab === key }} onPress={() => setTab(key)} style={[s.tab, tab === key && s.tabOn]}>
        <Ionicons name={icon} size={20} color={tab === key ? colors.text : colors.muted}/></Pressable>)}</View>

    {tab === 'grid' ? tiles.length ? <View style={s.grid}>{tiles.map((t) => {
      const d = new Date(t.date);
      return <Pressable key={t.id} accessibilityRole="button" accessibilityLabel={`${t.kind === 'cardio' ? t.title : 'Entrenamiento'} del ${d.toLocaleDateString('es-MX')}`}
        onPress={() => router.push(t.kind === 'cardio' ? { pathname: '/cardio/[cardioId]', params: { cardioId: t.id } } as never : { pathname: '/history/[sessionId]', params: { sessionId: t.id } } as never)}
        style={[s.tile, { borderColor: t.kind === 'cardio' ? '#3CC8E6' : colors.blue }]}>
        <Ionicons name={t.kind === 'cardio' ? 'pulse' : 'barbell'} size={16} color={t.kind === 'cardio' ? '#3CC8E6' : colors.blue}/>
        <Text style={s.tileDay}>{d.getDate()}</Text>
        <Text style={s.tileMonth}>{d.toLocaleDateString('es-MX', { month: 'short' }).replace('.', '')}</Text>
        <Text style={s.tileSub} numberOfLines={1}>{t.title} · {t.sub}</Text>
      </Pressable>;
    })}</View> : <Card><Text style={s.bio}>Aquí aparecerán tus entrenamientos cuando termines el primero.</Text></Card> : null}

    {tab === 'logros' ? <View style={s.badges}>{done.map((a) => <View key={a.key} style={[s.badge, !a.done && s.badgeOff]} accessibilityLabel={`${a.title}: ${a.done ? 'logrado' : 'pendiente'}`}>
      <Ionicons name={a.icon as never} size={24} color={a.done ? '#F5B841' : colors.muted}/>
      <Text style={[s.badgeTitle, !a.done && s.muted]}>{a.title}</Text>
      <Text style={s.badgeDetail}>{a.detail}</Text>
    </View>)}</View> : null}

    {tab === 'programa' ? <HybridCard program={data?.program ?? null} status={(data?.status ?? {}) as never} loaded={data !== null}/> : null}
  </Screen>;
}

function Stat({ value, label }: { value: string; label: string }) {
  return <View style={s.stat}><Text style={s.statValue}>{value}</Text><Text style={s.statLabel}>{label}</Text></View>;
}

const s = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  back: { color: '#9DBDFF', fontSize: 15, fontWeight: '700' },
  lock: { flexDirection: 'row', alignItems: 'center', gap: 4 }, lockText: { color: colors.secondary, fontSize: 11, fontWeight: '700' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 18 },
  avatar: { width: 84, height: 84, borderRadius: 42, backgroundColor: colors.surfaceRaised, borderWidth: 2, borderColor: colors.blue, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: colors.text, fontSize: 28, fontWeight: '800' },
  stats: { flex: 1, flexDirection: 'row', justifyContent: 'space-around' },
  stat: { alignItems: 'center', gap: 2 }, streakRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  statValue: { color: colors.text, fontSize: 20, fontWeight: '800' }, statLabel: { color: colors.secondary, fontSize: 11 },
  name: { color: colors.text, fontSize: 16, fontWeight: '800' }, bio: { color: colors.secondary, fontSize: 13, lineHeight: 18 },
  actions: { flexDirection: 'row', gap: 8 },
  action: { flex: 1, borderRadius: 10, backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border, paddingVertical: 9, alignItems: 'center' },
  actionText: { color: colors.text, fontSize: 13, fontWeight: '700' },
  highlights: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  hl: { width: 66, alignItems: 'center', gap: 4 },
  hlCircle: { width: 60, height: 60, borderRadius: 30, borderWidth: 2, borderColor: '#F5B841', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  hlTop: { color: colors.text, fontSize: 15, fontWeight: '800', paddingHorizontal: 4 }, hlLabel: { color: colors.secondary, fontSize: 10, maxWidth: 66 },
  tabs: { flexDirection: 'row', borderTopWidth: 1, borderColor: colors.border },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 10, borderTopWidth: 2, borderColor: 'transparent' }, tabOn: { borderColor: colors.text },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  tile: { width: '32.4%', aspectRatio: 1, borderRadius: 10, borderWidth: 1, backgroundColor: colors.surface, padding: 8, justifyContent: 'space-between' },
  tileDay: { color: colors.text, fontSize: 26, fontWeight: '800' }, tileMonth: { color: colors.secondary, fontSize: 11, textTransform: 'uppercase', marginTop: -6 },
  tileSub: { color: colors.secondary, fontSize: 10 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  badge: { width: '48.5%', borderRadius: 14, borderWidth: 1, borderColor: '#F5B841', backgroundColor: colors.surface, padding: 12, gap: 4 },
  badgeOff: { borderColor: colors.border, opacity: 0.6 },
  badgeTitle: { color: colors.text, fontSize: 13, fontWeight: '800' }, badgeDetail: { color: colors.secondary, fontSize: 11 }, muted: { color: colors.secondary },
});
