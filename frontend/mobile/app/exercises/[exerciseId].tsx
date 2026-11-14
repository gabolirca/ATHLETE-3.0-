import { useEffect, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { ActionButton } from '@/components/ActionButton';
import { Card } from '@/components/Card';
import { EmptyState } from '@/components/EmptyState';
import { Eyebrow, Label, Title } from '@/components/Typography';
import { Screen } from '@/components/Screen';
import { useTrainingRepository } from '@/data/MobileTrainingContext';
import type { Exercise } from '@/data/trainingTypes';
import { colors } from '@/theme/colors';

export default function ExerciseDetailScreen() {
  const { exerciseId } = useLocalSearchParams<{ exerciseId: string }>();
  const router = useRouter();
  const repository = useTrainingRepository();
  const [exercise, setExercise] = useState<Exercise | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => { let active = true; repository?.searchExercises().then((items) => { if (active) setExercise(items.find((item) => item.id === exerciseId) ?? null); }).catch(() => { if (active) setError(true); }); return () => { active = false; }; }, [exerciseId, repository]);
  async function start() { if (!repository || !exercise) return; const id = await repository.startWorkout(); await repository.addExercise(id, exercise.id); router.replace(`/workout/${id}`); }
  if (error) return <Screen><Title>Ejercicio</Title><EmptyState icon="alert-circle-outline" title="No pudimos leer el catálogo" detail="Revisa el almacenamiento local e inténtalo otra vez."/></Screen>;
  if (!exercise) return <Screen><Title>Ejercicio</Title><EmptyState title="Ejercicio no disponible" detail="Puede que haya cambiado el catálogo local."/></Screen>;
  return <Screen><View><Eyebrow>CATÁLOGO LOCAL DE MUESTRA</Eyebrow><Title>{exercise.name}</Title></View><Card><View style={s.row}><Label>Grupo muscular</Label><Text style={s.value}>{exercise.muscleGroup}</Text></View><View style={s.row}><Label>Equipo</Label><Text style={s.value}>{exercise.equipment ?? 'Sin equipo'}</Text></View><Text style={s.note}>Este ejercicio viene de un catálogo inicial local. Se reemplazará o complementará al integrar el catálogo oficial del backend.</Text></Card><ActionButton onPress={start}>Iniciar sesión con este ejercicio</ActionButton></Screen>;
}
const s=StyleSheet.create({row:{flexDirection:'row',justifyContent:'space-between',gap:10},value:{color:colors.text,fontSize:13,fontWeight:'700'},note:{color:colors.secondary,fontSize:11,lineHeight:17}});
