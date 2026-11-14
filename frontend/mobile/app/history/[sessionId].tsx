import { useCallback, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { CoachComments } from '@/coach/CoachComments';
import { ActionButton } from '@/components/ActionButton';
import { Card } from '@/components/Card';
import { EmptyState } from '@/components/EmptyState';
import { Eyebrow, Label, Title } from '@/components/Typography';
import { Screen, Row } from '@/components/Screen';
import { LocalSaveBadge } from '@/components/SyncBadge';
import { useTrainingRepository } from '@/data/MobileTrainingContext';
import type { WorkoutDetail } from '@/data/trainingTypes';
import { colors } from '@/theme/colors';
import { ScoreCard } from '@/workout/ScoreCard';
import { workoutScore } from '@/workout/coach';
import { blockResultText, clock } from '@/workout/blocks';
import { formatBlock } from '@/program/format';

export function effortDescription(value: number | null): string {
  if (value === null) return '';
  if (value < 0 || value > 10 || !Number.isInteger(value * 2)) return ` · valor guardado fuera del rango permitido (${value})`;
  if (value === 0) return ' · ninguna repetición más';
  if (value === 0.5) return ' · 0.5 media repetición más';
  return ` · ${value} ${value === 1 ? 'repetición más' : 'repeticiones más'}`;
}

export default function HistoryDetailScreen() {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  const router = useRouter();
  const repository = useTrainingRepository();
  const [detail, setDetail] = useState<WorkoutDetail | null>(null);
  const [error, setError] = useState(false);
  const load = useCallback(() => { repository?.getWorkout(sessionId).then(setDetail).catch(() => setError(true)); }, [repository, sessionId]);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  async function remove() {
    if (!repository) return;
    await repository.tombstoneWorkout(sessionId);
    router.replace('/history');
  }
  if (error) return <Screen><Title>Historial</Title><EmptyState icon="alert-circle-outline" title="No pudimos abrir esta sesión" detail="El registro local permanece guardado." action="Volver al historial" onAction={() => router.replace('/history')}/></Screen>;
  if (!detail) return <Screen><Title>Historial</Title><EmptyState title="Sesión no disponible" detail="Puede que ya no exista en este dispositivo." action="Volver al historial" onAction={() => router.replace('/history')}/></Screen>;
  const score = detail.workout.state === 'completed' ? workoutScore(detail) : null;
  return <Screen>
    <View><Eyebrow>{new Date(detail.workout.startedAt).toLocaleString('es-MX', { dateStyle: 'long', timeStyle: 'short' })}</Eyebrow><Title>Entrenamiento</Title></View>
    <LocalSaveBadge status={detail.workout.syncStatus}/>
    <CoachComments targetType="session" targetId={detail.workout.id}/>
    {score ? <ScoreCard score={score}/> : null}
    {detail.workout.state === 'completed' ? <ActionButton onPress={() => router.push(`/share/session/${detail.workout.id}`)}>Compartir</ActionButton> : null}
    {detail.sessionRpe || detail.blocks?.some((b) => b.result) ? <Card>
      {detail.sessionRpe ? <Row><View><Eyebrow>RPE DE LA SESIÓN</Eyebrow><Text style={s.number}>{detail.sessionRpe}<Text style={s.unit}> / 10</Text></Text></View>
        {detail.workout.durationMinutes ? <View><Eyebrow>CARGA</Eyebrow><Text style={s.number}>{Math.round(detail.sessionRpe * detail.workout.durationMinutes)} <Text style={s.unit}>UA</Text></Text></View> : null}</Row> : null}
      {detail.blocks?.filter((b) => b.result).map((b) => <View key={b.id} style={s.setRow}><Text style={s.note}>{b.name} · {formatBlock(b)}</Text><Text style={s.value}>{blockResultText(b)}</Text></View>)}
    </Card> : null}
    <Card><Row><View><Eyebrow>DURACIÓN</Eyebrow><Text style={s.number}>{detail.workout.durationMinutes ?? 0} min</Text></View><View><Eyebrow>RESUMEN</Eyebrow><Text style={s.number}>{detail.workout.exerciseCount} <Text style={s.unit}>ejercicios</Text></Text></View></Row><Text style={s.note}>{detail.workout.setCount} series registradas · datos locales</Text></Card>
    {detail.exercises.map((exercise) => <Card key={exercise.id}><Eyebrow>{exercise.sets.length} SERIES</Eyebrow><Label>{exercise.exerciseName}</Label>{exercise.sets.map((set) => <View key={set.id} style={s.setRow}><Text style={s.note}>Serie {set.setIndex + 1}{set.isWarmup ? ' · Calentamiento' : ''}</Text><Text style={s.value}>{set.durationSeconds || set.distanceMeters
        ? [set.distanceMeters ? `${set.distanceMeters} m` : null, set.durationSeconds ? clock(set.durationSeconds) : null].filter(Boolean).join(' · ')
        : `${set.weightKg === null ? '—' : `${set.weightKg} kg`} × ${set.reps ?? '—'} reps${effortDescription(set.rir)}`}</Text></View>)}</Card>)}
    <Pressable accessibilityRole="button" onPress={() => Alert.alert('Eliminar sesión', 'Se ocultará de este dispositivo y se guardará una tombstone para la próxima sincronización.', [{ text: 'Cancelar', style: 'cancel' }, { text: 'Eliminar', style: 'destructive', onPress: () => void remove() }])}><Text style={s.delete}>Eliminar sesión de este dispositivo</Text></Pressable>
  </Screen>;
}
const s=StyleSheet.create({number:{color:colors.text,fontSize:21,fontWeight:'800',marginTop:5},unit:{color:colors.secondary,fontSize:10,fontWeight:'500'},note:{color:colors.secondary,fontSize:11,lineHeight:16},setRow:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',borderTopWidth:1,borderTopColor:colors.border,paddingTop:9,marginTop:2},value:{color:colors.text,fontSize:11,fontWeight:'700'},delete:{color:colors.red,fontSize:12,fontWeight:'700',textAlign:'center',padding:15}});
