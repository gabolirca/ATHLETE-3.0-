import { useCallback, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Alert, Image, ImageBackground, Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { BRAND } from '@/brand/assets';
import { display } from '@/theme/fonts';
import { pickAvatar, removeAvatar, useAvatar } from '@/profile/avatar';
import { AnimatedA } from '@/brand/AnimatedA';
import { Card } from '@/components/Card';
import { Screen } from '@/components/Screen';
import { useTrainingRepository } from '@/data/MobileTrainingContext';
import type { CardioEntry, ExerciseRecord, StreakSummary, Workout } from '@/data/trainingTypes';
import { achievements } from '@/profile/achievements';
import { colors, themed } from '@/theme/colors';

type Tab = 'grid' | 'logros';
type Tile = { id: string; kind: 'workout' | 'cardio'; date: string; title: string; sub: string };
const LEVEL: Record<string, string> = { beginner: 'Principiante', intermediate: 'Intermedio', advanced: 'Avanzado' };
const CARDIO: Record<string, string> = { run: 'Carrera', walk: 'Caminata', bike: 'Bici', row: 'Remo', swim: 'Nado', elliptical: 'Elíptica', stairs: 'Escaladora', other: 'Cardio' };
const initials = (n: string) => n.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('');

/**
 * Perfil tipo Instagram, PRIVADO: solo tú lo ves (ATHLETE no es red social; se comparte con las tarjetas).
 * Encabezado con tus números, destacados con tus mejores marcas y pestañas: cuadrícula y logros.
 */
export default function ProfileScreen() {
  const router = useRouter();
  const repository = useTrainingRepository();
  const [tab, setTab] = useState<Tab>('grid');
  const avatar = useAvatar();
  const changePhoto = () => Alert.alert('Foto de perfil', 'Se guarda solo en este teléfono.', [
    { text: avatar ? 'Cambiar foto' : 'Elegir foto', onPress: () => { void pickAvatar().then((r) => { if (r === 'denied') Alert.alert('Sin permiso de fotos', 'Actívalo en Ajustes del iPhone.'); }).catch(() => Alert.alert('No se pudo guardar la foto.')); } },
    ...(avatar ? [{ text: 'Quitar foto', style: 'destructive' as const, onPress: () => { void removeAvatar(); } }] : []),
    { text: 'Cancelar', style: 'cancel' as const },
  ]);
  const [data, setData] = useState<{
    name: string; goal: string | null; level: string | null; workouts: Workout[]; cardio: CardioEntry[]; streak: StreakSummary | null;
    records: ExerciseRecord[];
  } | null>(null);

  useFocusEffect(useCallback(() => {
    let alive = true;
    if (!repository) return;
    void (async () => {
      const [prefs, athlete, workouts, cardio, streak, progress] = await Promise.all([
        repository.getPreferences(), repository.getAthleteProfile().catch(() => null), repository.listHistory().catch(() => []),
        repository.listCardio().catch(() => []), repository.getStreak().catch(() => null), repository.getProgress().catch(() => null),
      ]);
      if (alive) setData({
        name: prefs.displayName, goal: athlete?.goals[0] ?? null, level: athlete?.experienceLevel ? LEVEL[athlete.experienceLevel] ?? null : null,
        workouts: workouts.filter((w) => w.state === 'completed'), cardio, streak, records: progress?.records ?? [],
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
    weeksCompleted: data.streak?.weeks?.best ?? 0, records: data.records.length,
  }) : [];
  const highlights = data ? [
    ...(data.streak && data.streak.days.best > 0 ? [{ key: 'streak', top: String(data.streak.days.best), label: 'Mejor racha' }] : []),
    ...data.records.slice(0, 4).map((r) => ({ key: r.exerciseId, top: `${r.weightKg}`, label: r.exerciseName })),
  ] : [];

  return <Screen>
    <ImageBackground source={BRAND.cover} resizeMode="cover" style={s.cover} imageStyle={s.coverImg}>
      <View style={s.coverShade}/>
      <View style={s.top}>
        <Pressable accessibilityRole="button" accessibilityLabel="Regresar" hitSlop={12} onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} style={s.coverBtn}><Ionicons name="chevron-back" size={22} color="white"/></Pressable>
        <View style={s.lock}><Ionicons name="lock-closed" size={12} color="white"/><Text style={s.lockText}>Privado</Text></View>
        <Pressable accessibilityRole="button" accessibilityLabel="Ajustes" hitSlop={12} onPress={() => router.push('/settings')} style={s.coverBtn}><Ionicons name="settings-outline" size={20} color="white"/></Pressable>
      </View>
    </ImageBackground>

    <View style={s.header}>
      <Pressable accessibilityRole="button" accessibilityLabel={avatar ? 'Cambiar foto de perfil' : 'Agregar foto de perfil'} onPress={changePhoto} style={s.avatar}>
        {avatar ? <Image source={{ uri: avatar }} style={s.avatarImg}/> : data?.name ? <Text style={s.avatarText}>{initials(data.name)}</Text> : <Ionicons name="person" size={34} color={colors.secondary}/>}
        <View style={s.camera}><Ionicons name="camera" size={13} color="white"/></View>
      </Pressable>
      <View style={s.flex}>
        <Text style={s.name} numberOfLines={1}>{data?.name || 'Tu nombre'}</Text>
        <Text style={s.number}>ATLETA ATHLETE</Text>
      </View>
    </View>
    <Text style={s.bio}>{[data?.goal, data?.level].filter(Boolean).join(' · ') || 'Completa el asistente para definir tu meta.'}</Text>

    <View style={s.stats}>
      <StatTile icon="dumbbell" value={String(total)} label="SESIONES" color={colors.blue}/>
      <View style={[s.statTile, { borderColor: colors.amber }]}><View style={s.streakRow}><AnimatedA lit={(data?.streak?.days.current ?? 0) > 0} size={30}/><Text style={s.statValue}>{data?.streak?.days.current ?? 0}</Text></View><Text style={s.statLabel}>DÍAS DE RACHA</Text></View>
      <StatTile icon="calendar-check" value={String(data?.streak?.weeks?.current ?? 0)} label="SEMANAS" color={colors.green}/>
    </View>

    <View style={s.actions}>
      <Pressable accessibilityRole="button" onPress={() => router.push('/settings')} style={s.action}><MaterialCommunityIcons name="pencil" size={16} color={colors.text}/><Text style={s.actionText}>Editar</Text></Pressable>
      <Pressable accessibilityRole="button" onPress={() => router.push('/progress')} style={s.action}><MaterialCommunityIcons name="chart-line" size={16} color={colors.text}/><Text style={s.actionText}>Progreso</Text></Pressable>
      <Pressable accessibilityRole="button" onPress={() => router.push('/train')} style={[s.action, s.actionRed]}><MaterialCommunityIcons name="calendar-star" size={16} color="white"/><Text style={[s.actionText, { color: 'white' }]}>Mi programa</Text></Pressable>
    </View>

    {highlights.length ? <Text style={s.section}>MIS MEJORES MARCAS</Text> : null}
    {highlights.length ? <View style={s.highlights}>{highlights.map((h, i) => <View key={h.key} style={s.hl}>
      <View style={[s.hlCircle, { borderColor: [colors.amber, colors.blue, colors.green, colors.amber, colors.blue][i % 5] }]}>
        <MaterialCommunityIcons name={h.key === 'streak' ? 'fire' : 'trophy'} size={14} color={[colors.amber, colors.blue, colors.green, colors.amber, colors.blue][i % 5]}/>
        <Text style={s.hlTop} numberOfLines={1}>{h.top}</Text></View>
      <Text style={s.hlLabel} numberOfLines={1}>{h.label}</Text>
    </View>)}</View> : null}

    <View style={s.tabs}>{([['grid', 'grid-outline', 'Entrenamientos'], ['logros', 'ribbon-outline', 'Logros']] as const).map(([key, icon, label]) =>
      <Pressable key={key} accessibilityRole="tab" accessibilityLabel={label} accessibilityState={{ selected: tab === key }} onPress={() => setTab(key)} style={[s.tab, tab === key && s.tabOn]}>
        <Ionicons name={icon} size={18} color={tab === key ? 'white' : colors.secondary}/><Text style={[s.tabText, tab === key && { color: 'white' }]}>{label}</Text></Pressable>)}</View>

    {tab === 'grid' ? tiles.length ? <View style={s.grid}>{tiles.map((t) => {
      const d = new Date(t.date);
      return <Pressable key={t.id} accessibilityRole="button" accessibilityLabel={`${t.kind === 'cardio' ? t.title : 'Entrenamiento'} del ${d.toLocaleDateString('es-MX')}`}
        onPress={() => router.push(t.kind === 'cardio' ? { pathname: '/cardio/[cardioId]', params: { cardioId: t.id } } as never : { pathname: '/history/[sessionId]', params: { sessionId: t.id } } as never)}
        style={[s.tile, { backgroundColor: t.kind === 'cardio' ? colors.greenSoft : colors.accentSoft, borderColor: t.kind === 'cardio' ? colors.green : colors.blue }]}>
        <MaterialCommunityIcons name={t.kind === 'cardio' ? 'heart-pulse' : 'weight-lifter'} size={18} color={t.kind === 'cardio' ? colors.green : colors.blue}/>
        <Text style={s.tileDay}>{d.getDate()}</Text>
        <Text style={s.tileMonth}>{d.toLocaleDateString('es-MX', { month: 'short' }).replace('.', '')}</Text>
        <Text style={s.tileSub} numberOfLines={1}>{t.title} · {t.sub}</Text>
      </Pressable>;
    })}</View> : <Card><Text style={s.bio}>Aquí aparecerán tus entrenamientos cuando termines el primero.</Text></Card> : null}

    {tab === 'logros' ? <View style={s.badges}>{done.map((a) => <View key={a.key} style={[s.badge, a.done && { borderColor: colors[a.tone] }, !a.done && s.badgeOff]} accessibilityLabel={`${a.title}: ${a.done ? 'logrado' : 'pendiente'}`}>
      <View style={[s.badgeIcon, { backgroundColor: a.done ? colors[a.tone] + '22' : colors.surfaceRaised }]}><MaterialCommunityIcons name={(a.done ? a.icon : 'lock-outline') as never} size={24} color={a.done ? colors[a.tone] : colors.muted}/></View>
      <Text style={[s.badgeTitle, !a.done && s.muted]}>{a.title}</Text>
      <Text style={s.badgeDetail}>{a.detail}</Text>
    </View>)}</View> : null}

  </Screen>;
}

function StatTile({ icon, value, label, color }: { icon: string; value: string; label: string; color: string }) {
  return <View style={[s.statTile, { borderColor: color }]}><View style={s.streakRow}><MaterialCommunityIcons name={icon as never} size={22} color={color}/><Text style={s.statValue}>{value}</Text></View><Text style={s.statLabel}>{label}</Text></View>;
}

const s = themed(() => StyleSheet.create({
  flex: { flex: 1 },
  cover: { height: 150, marginHorizontal: -20, marginTop: -10, justifyContent: 'flex-start', backgroundColor: colors.surfaceRaised },
  coverImg: {},
  coverShade: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.45)' },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 10 },
  coverBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' },
  lock: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(0,0,0,0.45)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12 }, lockText: { color: 'white', fontSize: 11, fontWeight: '700' },
  header: { flexDirection: 'row', alignItems: 'flex-end', gap: 14, marginTop: -62 },
  avatar: { width: 104, height: 104, borderRadius: 52, backgroundColor: colors.surfaceRaised, borderWidth: 4, borderColor: colors.black, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: colors.text, fontSize: 32, fontWeight: '800' },
  avatarImg: { width: 96, height: 96, borderRadius: 48 },
  camera: { position: 'absolute', right: 2, bottom: 2, width: 28, height: 28, borderRadius: 14, backgroundColor: colors.blue, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.black },
  name: { color: colors.text, fontSize: 30, lineHeight: 32, ...display },
  number: { color: colors.secondary, fontSize: 12, fontWeight: '700', letterSpacing: 1.5 },
  planPill: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', marginTop: 6, backgroundColor: colors.blue, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 10 },
  planGolden: { backgroundColor: '#F5B841' },
  planText: { color: 'white', fontSize: 10, fontWeight: '800', letterSpacing: 0.8 },
  bio: { color: colors.secondary, fontSize: 13, lineHeight: 18 },
  stats: { flexDirection: 'row', gap: 8 },
  statTile: { flex: 1, alignItems: 'center', gap: 4, paddingVertical: 12, borderRadius: 16, borderWidth: 1, backgroundColor: colors.surface },
  streakRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statValue: { color: colors.text, fontSize: 28, lineHeight: 30, ...display }, statLabel: { color: colors.secondary, fontSize: 9, fontWeight: '800', letterSpacing: 0.6 },
  actions: { flexDirection: 'row', gap: 8 },
  action: { flex: 1, flexDirection: 'row', gap: 6, borderRadius: 12, backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border, paddingVertical: 11, alignItems: 'center', justifyContent: 'center' },
  actionRed: { backgroundColor: colors.blue, borderColor: colors.blue },
  actionText: { color: colors.text, fontSize: 13, fontWeight: '800' },
  section: { color: colors.secondary, fontSize: 12, fontWeight: '800', letterSpacing: 1 },
  highlights: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  hl: { width: 68, alignItems: 'center', gap: 4 },
  hlCircle: { width: 64, height: 64, borderRadius: 32, borderWidth: 3, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, gap: 1 },
  hlTop: { color: colors.text, fontSize: 15, fontWeight: '800', paddingHorizontal: 4 }, hlLabel: { color: colors.secondary, fontSize: 10, maxWidth: 68, textAlign: 'center' },
  tabs: { flexDirection: 'row', gap: 6, padding: 4, borderRadius: 14, backgroundColor: colors.surfaceRaised },
  tab: { flex: 1, flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center', paddingVertical: 10, borderRadius: 11 }, tabOn: { backgroundColor: colors.blue },
  tabText: { color: colors.secondary, fontSize: 13, fontWeight: '800' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tile: { width: '31.8%', aspectRatio: 1, borderRadius: 14, borderWidth: 1, padding: 9, justifyContent: 'space-between' },
  tileDay: { color: colors.text, fontSize: 30, lineHeight: 32, ...display }, tileMonth: { color: colors.secondary, fontSize: 11, textTransform: 'uppercase', marginTop: -6, fontWeight: '700' },
  tileSub: { color: colors.secondary, fontSize: 10, fontWeight: '600' },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  badge: { width: '48.5%', borderRadius: 16, borderWidth: 1, borderColor: colors.amber, backgroundColor: colors.surface, padding: 12, gap: 6 },
  badgeIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  badgeOff: { borderColor: colors.border, opacity: 0.6 },
  badgeTitle: { color: colors.text, fontSize: 13, fontWeight: '800' }, badgeDetail: { color: colors.secondary, fontSize: 11 }, muted: { color: colors.secondary },
}));
