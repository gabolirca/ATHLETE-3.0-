import { useCallback, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { ActionButton } from '@/components/ActionButton';
import { Card } from '@/components/Card';
import { EmptyState } from '@/components/EmptyState';
import { Eyebrow, Title } from '@/components/Typography';
import { Screen, Row } from '@/components/Screen';
import { LocalSaveBadge } from '@/components/SyncBadge';
import { STROKES, describeCardio, type UnitSystem } from '@/cardio/cardioForm';
import { useTrainingRepository } from '@/data/MobileTrainingContext';
import type { CardioEntry } from '@/data/trainingTypes';
import { colors } from '@/theme/colors';

function Metric({ label, value }: { label: string; value: string }) {
  return <View style={s.metric}><Eyebrow>{label}</Eyebrow><Text style={s.number}>{value}</Text></View>;
}

export default function CardioDetailScreen() {
  const { cardioId } = useLocalSearchParams<{ cardioId: string }>();
  const router = useRouter();
  const repository = useTrainingRepository();
  const [entry, setEntry] = useState<CardioEntry | null | undefined>(undefined);
  const [unitSystem, setUnitSystem] = useState<UnitSystem>('metric');
  const [error, setError] = useState(false);

  const load = useCallback(() => {
    if (!repository) return;
    Promise.all([repository.getCardio(cardioId), repository.getPreferences().catch(() => null)])
      .then(([value, prefs]) => { setEntry(value); if (prefs) setUnitSystem(prefs.unitSystem); setError(false); })
      .catch(() => setError(true));
  }, [repository, cardioId]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function remove() {
    if (!repository) return;
    await repository.tombstoneCardio(cardioId);
    router.replace('/history');
  }

  if (error) return <Screen><Title>Actividad</Title><EmptyState icon="alert-circle-outline" title="No pudimos abrir esta actividad" detail="El registro local permanece guardado." action="Reintentar" onAction={load}/></Screen>;
  if (entry === undefined) return <Screen><Title>Actividad</Title></Screen>;
  if (entry === null) return <Screen><Title>Actividad</Title><EmptyState title="Actividad no disponible" detail="Puede que ya no exista en este dispositivo." action="Volver al historial" onAction={() => router.replace('/history')}/></Screen>;

  const d = describeCardio(entry, unitSystem);
  const stroke = entry.swim?.stroke ? STROKES.find((x) => x.key === entry.swim?.stroke)?.label : null;
  return <Screen>
    <View><Eyebrow>{new Date(entry.startedAt).toLocaleString('es-MX', { dateStyle: 'long', timeStyle: 'short' })}</Eyebrow><Title>{d.label}</Title></View>
    <LocalSaveBadge status={entry.syncStatus}/>
    <Card accent={colors.blue}>
      <Row><Metric label="DURACIÓN" value={d.duration}/>{d.distance ? <Metric label="DISTANCIA" value={d.distance}/> : null}</Row>
      {d.pace ? <Row><Metric label={entry.activity === 'bike' ? 'VELOCIDAD' : 'RITMO'} value={d.pace}/></Row> : null}
    </Card>
    {(entry.rpe !== null || entry.avgHeartRateBpm !== null || entry.maxHeartRateBpm !== null || entry.rounds !== null) ? <Card>
      <Row>
        {entry.rpe !== null ? <Metric label="RPE" value={`${entry.rpe}/10`}/> : null}
        {entry.rounds !== null ? <Metric label="RONDAS" value={String(entry.rounds)}/> : null}
      </Row>
      {(entry.avgHeartRateBpm !== null || entry.maxHeartRateBpm !== null) ? <Row>
        <Metric label="FC MEDIA" value={entry.avgHeartRateBpm === null ? '—' : `${entry.avgHeartRateBpm} lpm`}/>
        <Metric label="FC MÁXIMA" value={entry.maxHeartRateBpm === null ? '—' : `${entry.maxHeartRateBpm} lpm`}/>
      </Row> : null}
    </Card> : null}
    {entry.swim ? <Card>
      <Eyebrow>NATACIÓN</Eyebrow>
      <Text style={s.note}>{entry.swim.poolType === 'open_water' ? 'Aguas abiertas' : `Alberca de ${entry.swim.poolLengthMeters ?? '—'} m · ${entry.swim.laps ?? '—'} largos`}{stroke ? ` · ${stroke}` : ''}</Text>
    </Card> : null}
    {entry.notes ? <Card><Eyebrow>NOTAS</Eyebrow><Text style={s.note}>{entry.notes}</Text></Card> : null}
    <ActionButton secondary onPress={() => router.push({ pathname: '/cardio/new', params: { edit: entry.id } })}>Editar actividad</ActionButton>
    <Pressable accessibilityRole="button" onPress={() => Alert.alert('Eliminar actividad', 'Se ocultará de este dispositivo y se guardará una tombstone para la próxima sincronización.', [{ text: 'Cancelar', style: 'cancel' }, { text: 'Eliminar', style: 'destructive', onPress: () => void remove() }])}><Text style={s.delete}>Eliminar actividad de este dispositivo</Text></Pressable>
  </Screen>;
}

const s = StyleSheet.create({
  metric: { flex: 1 },
  number: { color: colors.text, fontSize: 21, fontWeight: '800', marginTop: 5 },
  note: { color: colors.secondary, fontSize: 12, lineHeight: 18, marginTop: 4 },
  delete: { color: colors.red, fontSize: 12, fontWeight: '700', textAlign: 'center', padding: 15 },
});
