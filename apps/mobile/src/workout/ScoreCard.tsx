import { StyleSheet, Text, View } from 'react-native';
import type { SessionScore } from '@athlete/domain';
import { Card } from '@/components/Card';
import { Eyebrow } from '@/components/Typography';
import { Donut } from '@/charts/Donut';
import { colors } from '@/theme/colors';

const gradeColor = (score: number) => (score >= 85 ? colors.green : score >= 70 ? colors.blue : score >= 50 ? '#F5B841' : colors.secondary);

/** Calificación de la sesión con el desglose de cada parte (por qué salió así). */
export function ScoreCard({ score, title = 'CALIFICACIÓN DE LA SESIÓN' }: { score: SessionScore; title?: string }) {
  const color = gradeColor(score.score);
  return <Card accent={color}>
    <View style={s.top}>
      <Donut size={92} thickness={10} outOf={100} segments={[{ key: 'score', value: score.score, color }]} center={String(score.score)} caption="de 100"/>
      <View style={s.flex}>
        <Eyebrow>{title}</Eyebrow>
        <Text style={[s.grade, { color }]}>{score.grade}</Text>
      </View>
    </View>
    {score.components.map((c) => <View key={c.key} style={s.row} accessibilityLabel={`${c.label}: ${c.points} de ${c.max}. ${c.detail}`}>
      <View style={s.rowHead}><Text style={s.label}>{c.label}</Text><Text style={s.points}>{c.points}<Text style={s.max}> / {c.max}</Text></Text></View>
      <View style={s.track}><View style={[s.fill, { width: `${(c.points / c.max) * 100}%`, backgroundColor: color }]}/></View>
      <Text style={s.detail}>{c.detail}</Text>
    </View>)}
    <Text style={s.note}>Solo cuentan las partes que aplican: sin rutina no hay cumplimiento, sin "reps en reserva" no hay esfuerzo y sin una sesión anterior no hay progreso.</Text>
  </Card>;
}

const s = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', gap: 16 }, flex: { flex: 1, gap: 4 },
  grade: { fontSize: 24, fontWeight: '800', letterSpacing: -0.5 },
  row: { gap: 5 }, rowHead: { flexDirection: 'row', justifyContent: 'space-between' },
  label: { color: colors.text, fontSize: 13, fontWeight: '700' }, points: { color: colors.text, fontSize: 13, fontWeight: '800' }, max: { color: colors.muted, fontSize: 11 },
  track: { height: 6, borderRadius: 3, backgroundColor: colors.graphite, overflow: 'hidden' }, fill: { height: 6, borderRadius: 3 },
  detail: { color: colors.secondary, fontSize: 11 }, note: { color: colors.muted, fontSize: 10, lineHeight: 15 },
});
