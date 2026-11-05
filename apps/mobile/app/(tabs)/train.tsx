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
import type { Routine, TrainingOverview } from '@/data/trainingTypes';
import { colors } from '@/theme/colors';

export default function TrainScreen() {
  const router = useRouter();
  const repository = useTrainingRepository();
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [overview, setOverview] = useState<TrainingOverview | null>(null);
  const [loadError, setLoadError] = useState(false);
  useFocusEffect(useCallback(() => {
    let active = true;
    if (repository) Promise.all([repository.listRoutines(), repository.getOverview()]).then(([items, summary]) => {
      if (active) { setRoutines(items); setOverview(summary); setLoadError(false); }
    }).catch(() => { if (active) setLoadError(true); });
    return () => { active = false; };
  }, [repository]));

  return <Screen>
    <View><Eyebrow>PLANIFICA Y REGISTRA</Eyebrow><Title>Entrenar</Title></View>
    <Card accent={colors.blue}>
      <Eyebrow>SESIÓN LOCAL</Eyebrow>
      <Text style={s.hero}>{overview?.latestWorkout?.state === 'active' ? 'Tienes una sesión en curso' : 'Empieza cuando quieras'}</Text>
      <Text style={s.detail}>Los ejercicios, series y cambios se guardan en el dispositivo. La sincronización remota todavía no está conectada.</Text>
      <ActionButton onPress={() => router.push(overview?.latestWorkout?.state === 'active' ? `/workout/${overview.latestWorkout.id}` : '/workout/new')}>
        {overview?.latestWorkout?.state === 'active' ? 'Continuar sesión' : 'Iniciar sesión libre'}
      </ActionButton>
    </Card>
    <Row><SectionHeading title="Mis rutinas" action="Historial" /></Row>
    <ActionButton secondary onPress={() => router.push('/routines/new')}>＋ Crear rutina</ActionButton>
    {loadError ? <EmptyState icon="alert-circle-outline" title="No pudimos cargar tus rutinas" detail="Los registros locales no se eliminaron. Vuelve a cargar esta sección." action="Reintentar" onAction={() => repository?.listRoutines().then(setRoutines).catch(() => setLoadError(true))}/> : null}
    {routines.length === 0 && !loadError ? <EmptyState icon="clipboard-outline" title="Todavía no hay rutinas" detail="Elige ejercicios y define tus objetivos por serie. Puedes hacerlo sin conexión." action="Crear primera rutina" onAction={() => router.push('/routines/new')}/> : null}
    {routines.map((routine) => <Card key={routine.id}>
      <Row><View style={s.routineHeading}><View style={s.icon}><Ionicons name="barbell-outline" size={19} color={colors.blue}/></View><View style={{ flex: 1 }}><Label>{routine.name}</Label><Text style={s.detail}>{routine.exercises.length} ejercicios · editada {new Date(routine.updatedAt).toLocaleDateString('es-MX')}</Text></View></View></Row>
      <Text style={s.exerciseNames} numberOfLines={2}>{routine.exercises.map((exercise) => exercise.exerciseName).join(' · ')}</Text>
      <ActionButton onPress={async () => { const id = await repository?.startWorkout(routine.id); if (id) router.push(`/workout/${id}`); }}>Iniciar rutina</ActionButton>
    </Card>)}
    <SectionHeading title="Catálogo de ejercicios" action="Muestra local" />
    <ExercisePicker onSelect={(exercise) => router.push(`/exercises/${exercise.id}`)} />
    <Pressable accessibilityRole="button" onPress={() => router.push('/history')} style={s.history}><Ionicons name="time-outline" size={18} color={colors.blue}/><Text style={s.historyText}>Consultar historial de sesiones</Text><Ionicons name="chevron-forward" size={16} color={colors.muted}/></Pressable>
  </Screen>;
}

const s=StyleSheet.create({ hero:{color:colors.text,fontSize:21,fontWeight:'800'},detail:{color:colors.secondary,fontSize:12,lineHeight:18,marginTop:4},routineHeading:{flexDirection:'row',alignItems:'center',gap:12,flex:1},icon:{width:42,height:42,borderRadius:14,backgroundColor:'#172849',alignItems:'center',justifyContent:'center'},exerciseNames:{color:colors.secondary,fontSize:11,lineHeight:17},history:{flexDirection:'row',alignItems:'center',gap:10,paddingVertical:14},historyText:{color:colors.text,fontSize:13,fontWeight:'700',flex:1}});
