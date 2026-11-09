import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Card } from '@/components/Card';
import { ActionButton } from '@/components/ActionButton';
import { EmptyState } from '@/components/EmptyState';
import { Eyebrow, Label, Title } from '@/components/Typography';
import { Screen, Row } from '@/components/Screen';
import { SectionHeading } from '@/components/SectionHeading';
import { LocalSaveBadge } from '@/components/SyncBadge';
import { useLocalDataReady, useTrainingRepository } from '@/data/MobileTrainingContext';
import type { StreakSummary, TrainingOverview, WeeklyMuscleVolume } from '@/data/trainingTypes';
import { Donut } from '@/charts/Donut';
import { formatSets, lowMuscles, muscleSegments } from '@/progress/muscleVolume';
import { HybridCard } from '@/program/HybridCard';
import { useProgram } from '@/program/useProgram';
import { StreakCard } from '@/progress/StreakCard';
import { getOnboardingDone } from '@/settings/devicePrefs';
import { colors } from '@/theme/colors';

/** "Buenos días" / "Buenas tardes" / "Buenas noches" según la hora del teléfono. */
export function greeting(now: Date): string {
  const h = now.getHours();
  return h >= 5 && h < 12 ? 'Buenos días' : h >= 12 && h < 19 ? 'Buenas tardes' : 'Buenas noches';
}

/** Iniciales para el avatar (hasta 2). Vacío si no hay nombre. */
export function initials(name: string): string {
  return name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('');
}

export default function HomeScreen() {
  const router = useRouter();
  const repository = useTrainingRepository();
  const { ready, error } = useLocalDataReady();
  const [overview, setOverview] = useState<TrainingOverview | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [name, setName] = useState('');
  const [volume, setVolume] = useState<WeeklyMuscleVolume | null>(null);
  const hybrid = useProgram();
  const [streak, setStreak] = useState<StreakSummary | null>(null);

  // Primera vez en este teléfono: el asistente de bienvenida (una sola vez; después se repite desde el Perfil).
  useEffect(() => {
    if (!ready) return;
    void getOnboardingDone().then((done) => { if (!done) router.push('/onboarding'); });
  }, [ready, router]);

  useFocusEffect(useCallback(() => {
    let active = true;
    if (repository) repository.getPreferences().then((p) => { if (active) setName(p.displayName); }).catch(() => undefined);
    if (repository) repository.getStreak().then((v) => { if (active) setStreak(v); }).catch(() => undefined);
    if (repository) repository.getWeeklyMuscleVolume().then((v) => { if (active) setVolume(v); }).catch(() => undefined);
    if (repository) repository.getOverview().then((value) => { if (active) { setOverview(value); setLoadError(false); } }).catch(() => { if (active) setLoadError(true); });
    return () => { active = false; };
  }, [repository]));

  const segments = muscleSegments(volume);
  const low = lowMuscles(volume);
  const date = new Intl.DateTimeFormat('es-MX', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());
  if (error || loadError) return <Screen><Title>Inicio</Title><EmptyState icon="cloud-offline-outline" title="No pudimos leer tus datos locales" detail="Tus sesiones siguen guardadas. Vuelve a intentar en un momento." action="Reintentar" onAction={() => repository?.getOverview().then(setOverview).catch(() => setLoadError(true))} /></Screen>;

  return <Screen>
    <Row><View style={s.flex}><Eyebrow>{date}</Eyebrow><Title>{greeting(new Date())}{name ? `, ${name.split(' ')[0]}` : ''}</Title></View>
      <Pressable accessibilityRole="button" accessibilityLabel="Abrir perfil" onPress={() => router.push('/profile')} style={s.avatar}>
        {initials(name) ? <Text style={s.initials}>{initials(name)}</Text> : <Ionicons name="person" size={18} color={colors.secondary}/>}
      </Pressable></Row>
    {streak ? <StreakCard streak={streak}/> : null}
    {hybrid.program ? <HybridCard program={hybrid.program} status={hybrid.status} loaded={hybrid.loaded}/> : null}
    <Card accent={colors.blue}>
      <Row><Eyebrow>ENTRENAMIENTO DE HOY</Eyebrow><View style={s.pill}><Text style={s.pillText}>LOCAL</Text></View></Row>
      <Text style={s.heroTitle}>{overview?.latestWorkout?.state === 'active' ? 'Sesión en curso' : 'Tu próximo movimiento'}</Text>
      <Text style={s.muted}>{overview?.latestWorkout?.state === 'active' ? 'La sesión se conserva en este dispositivo.' : 'No hay sesiones programadas todavía.'}</Text>
      <ActionButton onPress={() => router.push(overview?.latestWorkout?.state === 'active' ? `/workout/${overview.latestWorkout.id}` : '/workout/new')}>
        {overview?.latestWorkout?.state === 'active' ? 'Continuar sesión' : 'Iniciar entrenamiento'}
      </ActionButton>
      <ActionButton secondary onPress={() => router.push('/cardio/new')}>Registrar cardio</ActionButton>
      <Text style={s.hint}>Tip: el botón ＋ de abajo registra fuerza, cardio, comida o peso desde cualquier pantalla.</Text>
    </Card>
    <SectionHeading title="Tu semana" action="Ver detalle" onAction={() => router.push('/progress')} />
    <Pressable accessibilityRole="button" accessibilityLabel="Ver detalle de tu semana en Progreso" onPress={() => router.push('/progress')}>
      <Card>
        <View style={s.week}>
          <Donut segments={segments} center={String(volume?.totalSets ?? 0)} caption={volume?.totalSets === 1 ? 'serie' : 'series'}/>
          <View style={s.legend}>
            <Eyebrow>SERIES POR MÚSCULO · 7 DÍAS</Eyebrow>
            {segments.length
              ? segments.map((m) => <View key={m.key} style={s.legendRow}><View style={[s.dot, { backgroundColor: m.color }]}/><Text style={s.legendName} numberOfLines={1}>{m.name}</Text><Text style={s.legendValue}>{formatSets(m.sets)}</Text></View>)
              : <Text style={s.muted}>Cuando registres series de fuerza verás aquí qué músculos trabajaste.</Text>}
          </View>
        </View>
        <View style={s.stats}>
          <View style={s.stat}><Text style={s.statValue}>{overview?.sessionsThisWeek ?? '—'}</Text><Text style={s.statLabel}>sesiones</Text></View>
          <View style={s.stat}><Text style={s.statValue}>{overview?.strengthSessionsThisWeek ?? '—'}</Text><Text style={s.statLabel}>fuerza</Text></View>
          <View style={s.stat}><Text style={s.statValue}>{overview?.cardioSessionsThisWeek ?? '—'}</Text><Text style={s.statLabel}>cardio</Text></View>
          <View style={s.stat}><Text style={s.statValue}>{overview ? overview.activityMinutesThisWeek : '—'}</Text><Text style={s.statLabel}>minutos</Text></View>
        </View>
        {volume && volume.totalSets > 0 && low.length ? <Text style={s.lowHint}>Por debajo de la referencia: {low.slice(0, 3).map((m) => m.name).join(', ')}{low.length > 3 ? ` y ${low.length - 3} más` : ''}</Text> : null}
        {overview?.pendingSyncCount ? <LocalSaveBadge pendingCount={overview.pendingSyncCount}/> : null}
      </Card>
    </Pressable>
    {hybrid.loaded && !hybrid.program ? <><SectionHeading title="Entrenamiento programado" /><HybridCard program={null} status={{}} loaded/></> : null}
    <SectionHeading title="Actividad reciente" action="Historial" onAction={() => router.push('/history')} />
    {overview?.latestWorkout ? <Card><Row><View><Label>{overview.latestWorkout.state === 'active' ? 'Sesión en curso' : 'Entrenamiento completado'}</Label><Text style={s.muted}>{new Date(overview.latestWorkout.startedAt).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })}</Text></View><LocalSaveBadge status={overview.latestWorkout.syncStatus}/></Row><Text style={s.muted}>{overview.latestWorkout.exerciseCount} ejercicios · {overview.latestWorkout.setCount} series registradas</Text></Card> : <EmptyState icon="time-outline" title="Sin sesiones todavía" detail="Cuando termines tu primer entrenamiento aparecerá aquí." action="Ver historial" onAction={() => router.push('/history')} />}
  </Screen>;
}

const s = StyleSheet.create({ flex: { flex: 1 },
  week: { flexDirection: 'row', alignItems: 'center', gap: 16 }, legend: { flex: 1, gap: 6 },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 7 }, dot: { width: 9, height: 9, borderRadius: 5 },
  legendName: { flex: 1, color: colors.text, fontSize: 12, fontWeight: '600' }, legendValue: { color: colors.secondary, fontSize: 12, fontWeight: '800' },
  stats: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 12 }, stat: { flex: 1, alignItems: 'center' },
  statValue: { color: colors.text, fontSize: 18, fontWeight: '800' }, statLabel: { color: colors.secondary, fontSize: 10, fontWeight: '600' },
  lowHint: { color: '#F5B841', fontSize: 11, lineHeight: 16 }, initials: { color: colors.text, fontSize: 15, fontWeight: '800' }, hint: { color: colors.muted, fontSize: 11, lineHeight: 16 }, avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.graphite, borderWidth: 2, borderColor: colors.blue, alignItems: 'center', justifyContent: 'center' }, pill: { backgroundColor: '#172849', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 }, pillText: { color: '#9DBDFF', fontWeight: '800', fontSize: 10, letterSpacing: 1 }, heroTitle: { color: colors.text, fontSize: 22, fontWeight: '800', letterSpacing: -0.5 }, muted: { color: colors.secondary, fontSize: 12, lineHeight: 18 }, bigNumber: { color: colors.text, fontSize: 25, fontWeight: '800', marginTop: 7 } });
