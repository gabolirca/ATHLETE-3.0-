import { useCallback, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Card } from '@/components/Card';
import { EmptyState } from '@/components/EmptyState';
import { Eyebrow, Label, Title } from '@/components/Typography';
import { Screen, Row } from '@/components/Screen';
import { LocalSaveBadge } from '@/components/SyncBadge';
import { useTrainingRepository } from '@/data/MobileTrainingContext';
import type { Workout } from '@/data/trainingTypes';
import { colors } from '@/theme/colors';

export default function HistoryScreen() {
  const router = useRouter();
  const repository = useTrainingRepository();
  const [history, setHistory] = useState<Workout[]>([]);
  const [error, setError] = useState(false);
  const load = useCallback(() => { repository?.listHistory().then(setHistory).then(() => setError(false)).catch(() => setError(true)); }, [repository]);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  return <Screen>
    <View><Eyebrow>REGISTROS DEL DISPOSITIVO</Eyebrow><Title>Historial</Title></View>
    {error ? <EmptyState icon="alert-circle-outline" title="No pudimos leer el historial" detail="Las sesiones se conservan en el almacenamiento local." action="Reintentar" onAction={load}/> : null}
    {!history.length && !error ? <EmptyState icon="time-outline" title="Aún no tienes entrenamientos" detail="Cuando completes una sesión, aparecerá aquí para que consultes sus ejercicios y series." action="Iniciar entrenamiento" onAction={() => router.push('/workout/new')}/> : null}
    {history.map((workout) => <Pressable key={workout.id} accessibilityRole="button" accessibilityLabel={`Ver sesión del ${new Date(workout.startedAt).toLocaleDateString('es-MX')}`} onPress={() => router.push(`/history/${workout.id}`)}>
      <Card><Row><View style={s.heading}><View style={s.icon}><Ionicons name="barbell-outline" size={18} color={colors.blue}/></View><View><Label>Entrenamiento</Label><Text style={s.detail}>{new Date(workout.startedAt).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })}</Text></View></View><Ionicons name="chevron-forward" size={16} color={colors.muted}/></Row><Row><Text style={s.detail}>{workout.exerciseCount} ejercicios · {workout.setCount} series · {workout.durationMinutes ?? 0} min</Text><LocalSaveBadge status={workout.syncStatus}/></Row></Card>
    </Pressable>)}
  </Screen>;
}
const s=StyleSheet.create({heading:{flexDirection:'row',alignItems:'center',gap:11},icon:{width:40,height:40,borderRadius:13,backgroundColor:'#172849',alignItems:'center',justifyContent:'center'},detail:{color:colors.secondary,fontSize:11,marginTop:4}});
