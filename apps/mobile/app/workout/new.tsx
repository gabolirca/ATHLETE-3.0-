import { useCallback, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { ActionButton } from '@/components/ActionButton';
import { Card } from '@/components/Card';
import { EmptyState } from '@/components/EmptyState';
import { Eyebrow, Label, Title } from '@/components/Typography';
import { Screen, Row } from '@/components/Screen';
import { useTrainingRepository } from '@/data/MobileTrainingContext';
import type { Routine } from '@/data/trainingTypes';
import { colors } from '@/theme/colors';

export default function StartWorkoutScreen() {
  const router = useRouter();
  const repository = useTrainingRepository();
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [error, setError] = useState(false);
  const [starting, setStarting] = useState(false);
  useFocusEffect(useCallback(() => {
    let active = true;
    repository?.listRoutines().then((value) => { if (active) setRoutines(value); }).catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [repository]));
  async function start(routineId?: string) {
    if (!repository) return;
    setStarting(true);
    try { const id = await repository.startWorkout(routineId); router.replace(`/workout/${id}`); }
    catch { setError(true); setStarting(false); }
  }
  return <Screen>
    <View><Eyebrow>REGISTRO LOCAL · SIN CONEXIÓN DISPONIBLE</Eyebrow><Title>Iniciar sesión</Title></View>
    <Card accent={colors.blue}><Label>Sesión libre</Label><Text style={s.detail}>Elige ejercicios al comenzar y registra tus series, peso, repeticiones y el esfuerzo de cada serie.</Text><ActionButton onPress={() => start()} loading={starting}>Comenzar sesión libre</ActionButton></Card>
    <Eyebrow>O USA UNA RUTINA</Eyebrow>
    {error ? <Text accessibilityRole="alert" style={s.error}>No pudimos crear la sesión. Tus datos locales se mantienen.</Text> : null}
    {routines.length ? routines.map((routine) => <Card key={routine.id}><Row><View><Label>{routine.name}</Label><Text style={s.detail}>{routine.exercises.length} ejercicios</Text></View><Text style={s.count}>{routine.exercises.length}</Text></Row><ActionButton secondary loading={starting} onPress={() => start(routine.id)}>Iniciar esta rutina</ActionButton></Card>) : <EmptyState icon="clipboard-outline" title="Sin rutinas guardadas" detail="Puedes empezar una sesión libre o crear una rutina en Entrenar." />}
  </Screen>;
}
const s=StyleSheet.create({detail:{color:colors.secondary,fontSize:12,lineHeight:18},count:{color:colors.blue,fontWeight:'800',fontSize:20},error:{color:colors.red,fontSize:12}});
