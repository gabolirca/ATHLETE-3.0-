import { useCallback, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Card } from '@/components/Card';
import { EmptyState } from '@/components/EmptyState';
import { Eyebrow, Label, Title } from '@/components/Typography';
import { Screen, Row } from '@/components/Screen';
import { LocalSaveBadge } from '@/components/SyncBadge';
import { ACTIVITIES, describeCardio, type UnitSystem } from '@/cardio/cardioForm';
import { mergeHistory } from '@/data/history';
import { useTrainingRepository } from '@/data/MobileTrainingContext';
import type { HistoryItem } from '@/data/trainingTypes';
import { colors } from '@/theme/colors';

const when = (iso: string) => new Date(iso).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' });

export default function HistoryScreen() {
  const router = useRouter();
  const repository = useTrainingRepository();
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [unitSystem, setUnitSystem] = useState<UnitSystem>('metric');
  const [error, setError] = useState(false);
  const load = useCallback(() => {
    if (!repository) return;
    Promise.all([repository.listHistory(), repository.listCardio(), repository.getPreferences().catch(() => null)])
      .then(([workouts, cardio, prefs]) => { setItems(mergeHistory(workouts, cardio)); if (prefs) setUnitSystem(prefs.unitSystem); setError(false); })
      .catch(() => setError(true));
  }, [repository]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  return <Screen>
    <View><Eyebrow>FUERZA Y CARDIO · ESTE DISPOSITIVO</Eyebrow><Title>Historial</Title></View>
    {error ? <EmptyState icon="alert-circle-outline" title="No pudimos leer el historial" detail="Tus registros se conservan en el almacenamiento local." action="Reintentar" onAction={load}/> : null}
    {!items.length && !error ? <EmptyState icon="time-outline" title="Aún no tienes actividad" detail="Cuando completes un entrenamiento o registres cardio, aparecerá aquí." action="Iniciar entrenamiento" onAction={() => router.push('/workout/new')}/> : null}
    {items.map((item) => item.kind === 'strength'
      ? <Pressable key={`s-${item.workout.id}`} accessibilityRole="button" accessibilityLabel={`Ver sesión del ${new Date(item.startedAt).toLocaleDateString('es-MX')}`} onPress={() => router.push(`/history/${item.workout.id}`)}>
          <Card><Row><View style={s.heading}><View style={s.icon}><Ionicons name="barbell-outline" size={18} color={colors.blue}/></View><View><Label>Entrenamiento de fuerza</Label><Text style={s.detail}>{when(item.startedAt)}</Text></View></View><Ionicons name="chevron-forward" size={16} color={colors.muted}/></Row><Row><Text style={s.detail}>{item.workout.exerciseCount} ejercicios · {item.workout.setCount} series · {item.workout.durationMinutes ?? 0} min</Text><LocalSaveBadge status={item.workout.syncStatus}/></Row></Card>
        </Pressable>
      : <CardioRow key={`c-${item.cardio.id}`} item={item} unitSystem={unitSystem} onPress={() => router.push(`/cardio/${item.cardio.id}`)}/>)}
  </Screen>;
}

function CardioRow({ item, unitSystem, onPress }: { item: Extract<HistoryItem, { kind: 'cardio' }>; unitSystem: UnitSystem; onPress: () => void }) {
  const d = describeCardio(item.cardio, unitSystem);
  const icon = ACTIVITIES.find((a) => a.key === item.cardio.activity)?.icon ?? 'pulse-outline';
  return <Pressable accessibilityRole="button" accessibilityLabel={`Ver ${d.label} del ${new Date(item.startedAt).toLocaleDateString('es-MX')}`} onPress={onPress}>
    <Card><Row><View style={s.heading}><View style={[s.icon, s.cardioIcon]}><Ionicons name={icon as never} size={18} color={colors.green}/></View><View><Label>{d.label}</Label><Text style={s.detail}>{when(item.startedAt)}</Text></View></View><Ionicons name="chevron-forward" size={16} color={colors.muted}/></Row><Row><Text style={s.detail}>{[d.duration, d.distance, d.pace].filter(Boolean).join(' · ')}</Text><LocalSaveBadge status={item.cardio.syncStatus}/></Row></Card>
  </Pressable>;
}

const s=StyleSheet.create({heading:{flexDirection:'row',alignItems:'center',gap:11},icon:{width:40,height:40,borderRadius:13,backgroundColor:'#172849',alignItems:'center',justifyContent:'center'},cardioIcon:{backgroundColor:'#123326'},detail:{color:colors.secondary,fontSize:11,marginTop:4}});
