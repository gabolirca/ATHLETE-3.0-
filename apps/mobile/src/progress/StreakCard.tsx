import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import { Card } from '@/components/Card';
import type { StreakSummary } from '@/data/trainingTypes';
import { colors } from '@/theme/colors';

export const STREAK_COLOR = '#FF7A3D';

/** Mensaje de la racha: lo que toca hoy. */
export function streakMessage(s: StreakSummary): string {
  const d = s.days;
  if (d.todayDone) return d.current > 1 ? '¡Hoy ya entrenaste! Racha asegurada.' : '¡Hoy ya entrenaste! Así empieza una racha.';
  if (d.atRisk) return s.programName ? 'Hoy te toca entrenar: hazlo para no perder tu racha.' : 'Entrena hoy para no perder tu racha.';
  if (d.current > 0) return s.programName ? 'Hoy es descanso en tu programa: la racha sigue.' : 'Hoy puedes descansar: la racha sigue.';
  if (d.daysSinceLast !== null && d.daysSinceLast >= 2) return `Llevas ${d.daysSinceLast} días sin entrenar. Hoy es buen día para volver.`;
  return 'Entrena hoy y empieza tu racha.';
}

/**
 * Racha tipo Duolingo pero pensada para entrenar: los días de descanso del programa no la rompen.
 * (El ícono es provisional: va el logo con la "A" animada.)
 */
export function StreakCard({ streak }: { streak: StreakSummary }) {
  const d = streak.days;
  const lit = d.current > 0;
  return <Card accent={lit ? STREAK_COLOR : undefined}>
    <View style={s.row}>
      <View style={[s.badge, lit && s.badgeOn]}><Ionicons name={lit ? 'flame' : 'flame-outline'} size={30} color={lit ? STREAK_COLOR : colors.muted}/></View>
      <View style={s.flex}>
        <Text style={s.big} accessibilityLabel={`Racha de ${d.current} días`}>{d.current} <Text style={s.unit}>{d.current === 1 ? 'día' : 'días'}</Text></Text>
        <Text style={s.label}>de racha{d.best > d.current ? ` · tu mejor: ${d.best}` : d.current > 0 && d.best === d.current ? ' · ¡tu mejor racha!' : ''}</Text>
      </View>
      {streak.weeks && streak.weeks.current > 0 ? <View style={s.weeks}><Text style={s.weeksNum}>{streak.weeks.current}</Text><Text style={s.weeksLabel}>{streak.weeks.current === 1 ? 'semana' : 'semanas'}{'\n'}cumplidas</Text></View> : null}
    </View>
    <Text style={[s.msg, d.atRisk && s.risk]}>{streakMessage(streak)}</Text>
  </Card>;
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 14 }, flex: { flex: 1 },
  badge: { width: 56, height: 56, borderRadius: 18, backgroundColor: colors.surfaceRaised, alignItems: 'center', justifyContent: 'center' },
  badgeOn: { backgroundColor: '#2E1A10' },
  big: { color: colors.text, fontSize: 30, fontWeight: '800' }, unit: { fontSize: 15, color: colors.secondary, fontWeight: '700' },
  label: { color: colors.secondary, fontSize: 12 },
  weeks: { alignItems: 'center' }, weeksNum: { color: colors.green, fontSize: 22, fontWeight: '800' }, weeksLabel: { color: colors.secondary, fontSize: 10, textAlign: 'center' },
  msg: { color: colors.text, fontSize: 13, lineHeight: 19 }, risk: { color: STREAK_COLOR, fontWeight: '800' },
});
