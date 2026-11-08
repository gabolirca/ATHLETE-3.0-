import { useCallback, useState } from 'react';
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
import type { TrainingOverview } from '@/data/trainingTypes';
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

  useFocusEffect(useCallback(() => {
    let active = true;
    if (repository) repository.getPreferences().then((p) => { if (active) setName(p.displayName); }).catch(() => undefined);
    if (repository) repository.getOverview().then((value) => { if (active) { setOverview(value); setLoadError(false); } }).catch(() => { if (active) setLoadError(true); });
    return () => { active = false; };
  }, [repository]));

  const date = new Intl.DateTimeFormat('es-MX', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());
  if (error || loadError) return <Screen><Title>Inicio</Title><EmptyState icon="cloud-offline-outline" title="No pudimos leer tus datos locales" detail="Tus sesiones siguen guardadas. Vuelve a intentar en un momento." action="Reintentar" onAction={() => repository?.getOverview().then(setOverview).catch(() => setLoadError(true))} /></Screen>;

  return <Screen>
    <Row><View style={s.flex}><Eyebrow>{date}</Eyebrow><Title>{greeting(new Date())}{name ? `, ${name.split(' ')[0]}` : ''}</Title></View>
      <Pressable accessibilityRole="button" accessibilityLabel="Abrir perfil" onPress={() => router.push('/profile')} style={s.avatar}>
        {initials(name) ? <Text style={s.initials}>{initials(name)}</Text> : <Ionicons name="person" size={18} color={colors.secondary}/>}
      </Pressable></Row>
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
    <SectionHeading title="Esta semana · este dispositivo" action="Ver historial" />
    <Card>
      <Row><View><Eyebrow>SESIONES COMPLETADAS</Eyebrow><Text style={s.bigNumber}>{overview?.sessionsThisWeek ?? '—'}</Text></View><View><Eyebrow>TIEMPO DE ACTIVIDAD</Eyebrow><Text style={s.bigNumber}>{overview ? `${overview.activityMinutesThisWeek} min` : '—'}</Text></View></Row>
      {overview && overview.sessionsThisWeek > 0
        ? <Text style={s.muted}>{overview.strengthSessionsThisWeek} de fuerza · {overview.cardioSessionsThisWeek} de cardio</Text>
        : <Text style={s.muted}>No hay actividad registrada esta semana.</Text>}
      {overview?.pendingSyncCount ? <LocalSaveBadge pendingCount={overview.pendingSyncCount}/> : null}
    </Card>
    <SectionHeading title="Entrenamiento programado" />
    <EmptyState icon="calendar-outline" title="Aún no tienes un plan" detail="Crea una rutina para organizar tu entrenamiento. Las sesiones que registres se guardarán localmente aunque no haya conexión." action="Crear rutina" onAction={() => router.push('/routines/new')} />
    <SectionHeading title="Actividad reciente" action="Historial" />
    {overview?.latestWorkout ? <Card><Row><View><Label>{overview.latestWorkout.state === 'active' ? 'Sesión en curso' : 'Entrenamiento completado'}</Label><Text style={s.muted}>{new Date(overview.latestWorkout.startedAt).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })}</Text></View><LocalSaveBadge status={overview.latestWorkout.syncStatus}/></Row><Text style={s.muted}>{overview.latestWorkout.exerciseCount} ejercicios · {overview.latestWorkout.setCount} series registradas</Text></Card> : <EmptyState icon="time-outline" title="Sin sesiones todavía" detail="Cuando termines tu primer entrenamiento aparecerá aquí." action="Ver historial" onAction={() => router.push('/history')} />}
  </Screen>;
}

const s = StyleSheet.create({ flex: { flex: 1 }, initials: { color: colors.text, fontSize: 15, fontWeight: '800' }, hint: { color: colors.muted, fontSize: 11, lineHeight: 16 }, avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.graphite, borderWidth: 2, borderColor: colors.blue, alignItems: 'center', justifyContent: 'center' }, pill: { backgroundColor: '#172849', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 }, pillText: { color: '#9DBDFF', fontWeight: '800', fontSize: 10, letterSpacing: 1 }, heroTitle: { color: colors.text, fontSize: 22, fontWeight: '800', letterSpacing: -0.5 }, muted: { color: colors.secondary, fontSize: 12, lineHeight: 18 }, bigNumber: { color: colors.text, fontSize: 25, fontWeight: '800', marginTop: 7 } });
