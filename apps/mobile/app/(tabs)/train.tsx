import { useCallback, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ActionButton } from '@/components/ActionButton';
import { Card } from '@/components/Card';
import { EmptyState } from '@/components/EmptyState';
import { ExercisePicker } from '@/components/ExercisePicker';
import { Eyebrow, Label, Title } from '@/components/Typography';
import { Screen, Row } from '@/components/Screen';
import { SectionHeading } from '@/components/SectionHeading';
import { useTrainingRepository } from '@/data/MobileTrainingContext';
import type { Exercise, Routine, TrainingOverview } from '@/data/trainingTypes';
import { routineFocus } from '@/routines/diagnosis';
import { HybridCard } from '@/program/HybridCard';
import { useProgram } from '@/program/useProgram';
import { colors } from '@/theme/colors';

export default function TrainScreen() {
  const router = useRouter();
  const repository = useTrainingRepository();
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [overview, setOverview] = useState<TrainingOverview | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [catalog, setCatalog] = useState<Map<string, Exercise>>(new Map());
  const hybrid = useProgram();
  useFocusEffect(useCallback(() => {
    let active = true;
    if (repository) Promise.all([repository.listRoutines(), repository.getOverview(), repository.searchExercises('').catch(() => [])]).then(([items, summary, exercises]) => {
      if (active) { setRoutines(items); setOverview(summary); setCatalog(new Map(exercises.map((e) => [e.id, e]))); setLoadError(false); }
    }).catch(() => { if (active) setLoadError(true); });
    return () => { active = false; };
  }, [repository]));

  return <Screen>
    <View><Eyebrow>PLANIFICA Y REGISTRA</Eyebrow><Title>Entrenar</Title></View>
    <HybridCard program={hybrid.program} status={hybrid.status} loaded={hybrid.loaded}/>
    <Card accent={colors.blue}>
      <Eyebrow>SESIÓN LOCAL</Eyebrow>
      <Text style={s.hero}>{overview?.latestWorkout?.state === 'active' ? 'Tienes una sesión en curso' : 'Empieza cuando quieras'}</Text>
      <Text style={s.detail}>Todo se guarda en tu teléfono al momento y se respalda en tu cuenta cuando hay internet.</Text>
      <ActionButton onPress={() => router.push(overview?.latestWorkout?.state === 'active' ? `/workout/${overview.latestWorkout.id}` : '/workout/new')}>
        {overview?.latestWorkout?.state === 'active' ? 'Continuar sesión' : 'Iniciar sesión libre'}
      </ActionButton>
    </Card>
    <Card accent={colors.green}>
      <Eyebrow>CARDIO Y RESISTENCIA</Eyebrow>
      <Text style={s.hero}>Corre, nada, pedalea o rema</Text>
      <Text style={s.detail}>Registra duración, distancia, esfuerzo y frecuencia cardiaca. Se suma a tu semana junto con el gimnasio.</Text>
      <ActionButton secondary onPress={() => router.push('/cardio/new')}>＋ Registrar actividad</ActionButton>
    </Card>
    <Row><SectionHeading title="Mis rutinas" action="Historial" onAction={() => router.push('/history')} /></Row>
    <ActionButton secondary onPress={() => router.push('/routines/new')}>＋ Crear rutina</ActionButton>
    {loadError ? <EmptyState icon="alert-circle-outline" title="No pudimos cargar tus rutinas" detail="Los registros locales no se eliminaron. Vuelve a cargar esta sección." action="Reintentar" onAction={() => repository?.listRoutines().then(setRoutines).catch(() => setLoadError(true))}/> : null}
    {routines.length === 0 && !loadError ? <EmptyState icon="clipboard-outline" title="Todavía no hay rutinas" detail="Elige ejercicios y define tus objetivos por serie. Puedes hacerlo sin conexión." action="Crear primera rutina" onAction={() => router.push('/routines/new')}/> : null}
    {routines.map((routine) => <Card key={routine.id}>
      <Row><View style={s.routineHeading}><View style={s.icon}><Ionicons name="barbell-outline" size={19} color={colors.blue}/></View><View style={{ flex: 1 }}><Label>{routine.name}</Label><Text style={s.detail}>{routine.exercises.length} ejercicios · editada {new Date(routine.updatedAt).toLocaleDateString('es-MX')}</Text></View></View></Row>
      <Text style={s.exerciseNames} numberOfLines={2}>{routine.exercises.map((exercise) => exercise.exerciseName).join(' · ')}</Text>
      {(() => {
        const focus = routineFocus(routine.exercises.flatMap((e) => { const ex = catalog.get(e.exerciseId); return ex ? [{ exercise: ex, sets: e.sets }] : []; }));
        return focus ? <Text style={s.focus}>Series por sesión: {focus}</Text> : null;
      })()}
      <ActionButton onPress={async () => { const id = await repository?.startWorkout(routine.id); if (id) router.push(`/workout/${id}`); }}>Iniciar rutina</ActionButton>
    </Card>)}
    <SectionHeading title="Catálogo de ejercicios" />
    <ExercisePicker onSelect={(exercise) => router.push(`/exercises/${exercise.id}`)} />
    <Pressable accessibilityRole="button" onPress={() => router.push('/history')} style={s.history}><Ionicons name="time-outline" size={18} color={colors.blue}/><Text style={s.historyText}>Consultar historial de sesiones</Text><Ionicons name="chevron-forward" size={16} color={colors.muted}/></Pressable>
  </Screen>;
}

const s=StyleSheet.create({ hero:{color:colors.text,fontSize:21,fontWeight:'800'},detail:{color:colors.secondary,fontSize:12,lineHeight:18,marginTop:4},routineHeading:{flexDirection:'row',alignItems:'center',gap:12,flex:1},icon:{width:42,height:42,borderRadius:14,backgroundColor:'#172849',alignItems:'center',justifyContent:'center'},exerciseNames:{color:colors.secondary,fontSize:11,lineHeight:17},focus:{color:'#9DBDFF',fontSize:11,fontWeight:'700'},history:{flexDirection:'row',alignItems:'center',gap:10,paddingVertical:14},historyText:{color:colors.text,fontSize:13,fontWeight:'700',flex:1}});
