import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import { cardioBests, cardioTotalsByActivity, formatDuration } from '@athlete/domain';
import { Card } from '@/components/Card';
import { EmptyState } from '@/components/EmptyState';
import { Eyebrow } from '@/components/Typography';
import { ACTIVITIES, activityLabel, formatDistance, formatPace, type UnitSystem } from '@/cardio/cardioForm';
import { useTrainingRepository } from '@/data/MobileTrainingContext';
import type { CardioEntry } from '@/data/trainingTypes';
import { localDateOfDevice } from '@/lib/localDate';
import { colors } from '@/theme/colors';

const shortDate = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });

/** Cardio en Progreso: totales de los últimos 7 días por actividad y mejores marcas. */
export function CardioProgress() {
  const repository = useTrainingRepository();
  const [entries, setEntries] = useState<CardioEntry[] | null>(null);
  const [unitSystem, setUnitSystem] = useState<UnitSystem>('metric');
  useFocusEffect(useCallback(() => {
    let active = true;
    if (repository) Promise.all([repository.listCardio(), repository.getPreferences().catch(() => null)]).then(([items, prefs]) => {
      if (active) { setEntries(items); if (prefs) setUnitSystem(prefs.unitSystem); }
    }).catch(() => { if (active) setEntries([]); });
    return () => { active = false; };
  }, [repository]));

  if (!entries) return null;
  if (!entries.length) return <EmptyState icon="pulse-outline" title="Aún no registras cardio" detail="Corre, nada, pedalea o rema: aquí verás tus kilómetros de la semana y tus mejores marcas."/>;
  const from = localDateOfDevice(new Date(Date.now() - 6 * 86_400_000));
  const totals = cardioTotalsByActivity(entries, from);
  const bests = cardioBests(entries);
  const icon = (a: string) => (ACTIVITIES.find((x) => x.key === a)?.icon ?? 'pulse-outline') as never;
  return <>
    <Card>
      <Eyebrow>ÚLTIMOS 7 DÍAS</Eyebrow>
      {totals.length ? totals.map((t) => <View key={t.activity} style={s.row} accessibilityLabel={`${activityLabel(t.activity)}: ${t.sessions} sesiones`}>
        <View style={s.icon}><Ionicons name={icon(t.activity)} size={17} color={colors.green}/></View>
        <View style={s.flex}><Text style={s.name}>{activityLabel(t.activity)}</Text><Text style={s.sub}>{t.sessions} {t.sessions === 1 ? 'sesión' : 'sesiones'} · {formatDuration(t.durationSeconds)}</Text></View>
        {t.distanceMeters !== null ? <Text style={s.big}>{formatDistance(t.activity, t.distanceMeters, unitSystem)}</Text> : null}
      </View>) : <Text style={s.sub}>Sin cardio esta semana.</Text>}
    </Card>
    {bests.length ? <Card>
      <Eyebrow>MEJORES MARCAS</Eyebrow>
      {bests.map((b) => <View key={b.activity} style={s.best}>
        <Text style={s.name}>{activityLabel(b.activity)}</Text>
        {b.longest ? <Text style={s.sub}>Más larga: <Text style={s.value}>{formatDistance(b.activity, b.longest.distanceMeters, unitSystem)}</Text> · {shortDate(b.longest.localDate)}</Text> : null}
        {b.fastest ? <Text style={s.sub}>{b.activity === 'bike' ? 'Más rápida' : 'Mejor ritmo'}: <Text style={s.value}>{formatPace(b.activity, b.fastest.paceSeconds, unitSystem)}</Text> en {formatDistance(b.activity, b.fastest.distanceMeters, unitSystem)} · {shortDate(b.fastest.localDate)}</Text> : null}
      </View>)}
      <Text style={s.note}>El mejor ritmo cuenta desde 1 km (5 km en bici, 200 m nadando) para que un tramo corto no pase por marca.</Text>
    </Card> : null}
  </>;
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 11 }, flex: { flex: 1 },
  icon: { width: 34, height: 34, borderRadius: 11, backgroundColor: '#12291F', alignItems: 'center', justifyContent: 'center' },
  name: { color: colors.text, fontSize: 14, fontWeight: '800' }, sub: { color: colors.secondary, fontSize: 12, lineHeight: 18 },
  big: { color: colors.text, fontSize: 16, fontWeight: '800' }, value: { color: colors.text, fontWeight: '800' },
  best: { gap: 2, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 10 },
  note: { color: colors.muted, fontSize: 10, lineHeight: 15 },
});
