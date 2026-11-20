import { useCallback, useState, type ReactNode } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { BrandHeader } from '@/brand/BrandHeader';
import { EmptyState } from '@/components/EmptyState';
import { ExercisePicker } from '@/components/ExercisePicker';
import { Title } from '@/components/Typography';
import { Screen } from '@/components/Screen';
import { useTrainingRepository } from '@/data/MobileTrainingContext';
import type { Exercise, Routine, TrainingOverview } from '@/data/trainingTypes';
import { HybridCard } from '@/program/HybridCard';
import { useProgram } from '@/program/useProgram';
import { routineFocus } from '@/routines/diagnosis';
import { useAppRefresh } from '@/brand/useAppRefresh';
import { colors, themed } from '@/theme/colors';
import { displayBold } from '@/theme/fonts';

function RowCard({ title, detail, tag, onPress, label, icon, children }: { title: string; detail: string; tag?: string; onPress: () => void; label?: string; icon?: string; children?: ReactNode }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label ?? title} onPress={onPress} style={({ pressed }) => [s.row, pressed && s.pressed]}>
    {icon ? <View style={s.iconBubble}><MaterialCommunityIcons name={icon as never} size={22} color={colors.blue}/></View> : null}
    <View style={s.flex}><Text style={s.rowTitle}>{title}</Text><Text style={s.rowDetail}>{detail}</Text>{children}</View>
    {tag ? <Text style={s.tag}>{tag}</Text> : null}
    <Ionicons name="chevron-forward" size={18} color={colors.secondary}/>
  </Pressable>;
}

/**
 * Entrenar: arriba tu programa (lo de hoy, la semana y las plantillas híbridas). Debajo tus rutinas propias, la sesión
 * libre, el cardio y el catálogo. Todo en uno o dos toques.
 */
export default function TrainScreen() {
  const router = useRouter();
  const repository = useTrainingRepository();
  const hybrid = useProgram();
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [overview, setOverview] = useState<TrainingOverview | null>(null);
  const [catalog, setCatalog] = useState<Map<string, Exercise>>(new Map());
  const [loadError, setLoadError] = useState(false);
  const [showCatalog, setShowCatalog] = useState(false);
  const load = useCallback((isActive: () => boolean = () => true) => {
    if (!repository) return Promise.resolve();
    return Promise.all([repository.listRoutines(), repository.getOverview(), repository.searchExercises('').catch(() => [])]).then(([items, summary, exercises]) => {
      if (isActive()) { setRoutines(items); setOverview(summary); setCatalog(new Map(exercises.map((e) => [e.id, e]))); setLoadError(false); }
    }).catch(() => { if (isActive()) setLoadError(true); });
  }, [repository]);
  useFocusEffect(useCallback(() => {
    let active = true;
    void load(() => active);
    return () => { active = false; };
  }, [load]));
  const refresh = useAppRefresh(useCallback(() => Promise.all([load(), hybrid.refresh()]), [load, hybrid]));
  const activeId = overview?.latestWorkout?.state === 'active' ? overview.latestWorkout.id : null;

  async function openRoutine(routine: Routine) {
    const id = await repository?.startWorkout(routine.id);
    if (id) router.push(`/workout/${id}`);
  }

  return <Screen refreshing={refresh.refreshing} onRefresh={refresh.onRefresh}>
    <BrandHeader/>
    <Title>Entrenar</Title>
    {activeId ? <RowCard icon="play-circle" title="Sesión en curso" detail="Toca para continuar donde ibas" tag="AHORA" onPress={() => router.push(`/workout/${activeId}`)}/> : null}

    <View style={s.section}>
      <Text style={s.heading}>MI PROGRAMA</Text>
      <HybridCard program={hybrid.program} status={hybrid.status} loaded={hybrid.loaded}/>
    </View>

    <View style={s.section}>
      <Text style={s.heading}>MIS RUTINAS</Text>
      {loadError ? <EmptyState icon="alert-circle-outline" title="No pudimos cargar tus rutinas" detail="Tus registros siguen guardados. Vuelve a intentar." action="Reintentar" onAction={() => void load()}/> : null}
      {routines.map((r) => {
        const focus = routineFocus(r.exercises.flatMap((e) => { const ex = catalog.get(e.exerciseId); return ex ? [{ exercise: ex, sets: e.sets }] : []; }));
        return <RowCard key={r.id} icon="clipboard-text-outline" title={r.name} detail={`${r.exercises.length} ejercicios${focus ? ` · ${focus}` : ''}`} label={`Empezar ${r.name}`} onPress={() => void openRoutine(r)}/>;
      })}
      <RowCard icon="plus-circle-outline" title="Crear rutina" detail="Elige ejercicios, series y descansos" onPress={() => router.push('/routines/new')}/>
      <RowCard icon="lightning-bolt" title="Sesión libre" detail="Sin rutina: agrega ejercicios sobre la marcha" onPress={() => router.push('/workout/new')}/>
    </View>

    <View style={s.links}>
      <Pressable accessibilityRole="button" onPress={() => router.push('/cardio/new')} style={s.link}><Ionicons name="pulse-outline" size={18} color={colors.accentText}/><Text style={s.linkText}>Registrar cardio</Text></Pressable>
      <Pressable accessibilityRole="button" onPress={() => router.push('/history')} style={s.link}><Ionicons name="time-outline" size={18} color={colors.accentText}/><Text style={s.linkText}>Historial</Text></Pressable>
    </View>

    <Pressable accessibilityRole="button" accessibilityState={{ expanded: showCatalog }} onPress={() => setShowCatalog((v) => !v)} style={s.catalogToggle}>
      <MaterialCommunityIcons name="book-open-variant" size={18} color={colors.accentText}/>
      <Text style={s.linkText}>Catálogo de ejercicios</Text>
      <Ionicons name={showCatalog ? 'chevron-up' : 'chevron-down'} size={16} color={colors.secondary}/>
    </Pressable>
    {showCatalog ? <ExercisePicker onSelect={(exercise) => router.push(`/exercises/${exercise.id}`)}/> : null}
  </Screen>;
}

const s = themed(() => StyleSheet.create({
  flex: { flex: 1 }, section: { gap: 10 }, pressed: { opacity: 0.8 },
  iconBubble: { width: 44, height: 44, borderRadius: 13, backgroundColor: colors.surfaceRaised, alignItems: 'center', justifyContent: 'center' },
  heading: { color: colors.secondary, fontSize: 13, fontWeight: '700', letterSpacing: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 68, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 10 },
  rowTitle: { color: colors.text, fontSize: 23, lineHeight: 26, ...displayBold }, rowDetail: { color: colors.secondary, fontSize: 13 },
  tag: { color: colors.green, fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
  links: { flexDirection: 'row', gap: 10 },
  link: { flex: 1, minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, borderColor: colors.border, borderRadius: 14, backgroundColor: colors.surface },
  linkText: { color: colors.text, fontSize: 14, fontWeight: '700' },
  catalogToggle: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
}));
