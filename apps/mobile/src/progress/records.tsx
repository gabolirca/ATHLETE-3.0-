import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import { Card } from '@/components/Card';
import { Eyebrow, Label } from '@/components/Typography';
import type { ExerciseRecord, SessionRecord } from '@/data/trainingTypes';
import { dayLabel, localDateOfDevice } from '@/lib/localDate';
import { colors } from '@/theme/colors';

/** Kilos para mostrar: el 1RM estimado se redondea a 0.5 kg (el disco más chico habitual); los reales tal cual. */
export function formatKg(kg: number, estimate = false): string {
  const v = estimate ? Math.round(kg * 2) / 2 : Math.round(kg * 100) / 100;
  return String(v);
}

export function RecordCard({ record }: { record: ExerciseRecord }) {
  const today = localDateOfDevice(new Date());
  const date = record.measuredAt.slice(0, 10);
  return <Card>
    <Label>{record.exerciseName}</Label>
    <View style={s.row}>
      <View style={s.box}>
        <Eyebrow>RÉCORD (PR)</Eyebrow>
        <Text style={s.value}>{formatKg(record.weightKg)} <Text style={s.unit}>kg</Text></Text>
        <Text style={s.note}>{record.reps === null ? 'Reps no registradas' : `× ${record.reps} ${record.reps === 1 ? 'rep' : 'reps'}`} · {dayLabel(date, today)}</Text>
      </View>
      <View style={s.box}>
        <Eyebrow>1RM ESTIMADO</Eyebrow>
        {record.e1rm ? <>
          <Text style={[s.value, s.estimate]}>{formatKg(record.e1rm.valueKg, true)} <Text style={s.unit}>kg</Text></Text>
          <Text style={s.note}>de {formatKg(record.e1rm.weightKg)} kg × {record.e1rm.reps}</Text>
        </> : <Text style={s.note}>Necesita una serie de 1 a 12 reps con peso.</Text>}
      </View>
    </View>
  </Card>;
}

export function RecordsExplainer() {
  return <Text style={s.note}>
    PR: lo más pesado que has levantado. 1RM estimado: lo que podrías levantar una sola vez, calculado con tus series (fórmula de Epley). Es una estimación, no una medición.
  </Text>;
}

/** Aviso dentro del entrenamiento cuando una serie rompe un récord. */
export function NewRecordBadge({ records }: { records: SessionRecord[] }) {
  if (!records.length) return null;
  const weight = records.find((r) => r.kind === 'max_weight');
  const e1rm = records.find((r) => r.kind === 'best_e1rm');
  const parts = [
    weight ? `PR de peso: ${formatKg(weight.value)} kg${weight.reps ? ` × ${weight.reps}` : ''}` : null,
    e1rm ? `1RM estimado: ${formatKg(e1rm.value, true)} kg` : null,
  ].filter(Boolean);
  return <View accessibilityRole="alert" style={s.badge}>
    <Ionicons name="trophy" size={16} color="#F5B841"/>
    <View style={s.flex}><Text style={s.badgeTitle}>¡Nuevo récord!</Text><Text style={s.badgeText}>{parts.join(' · ')}</Text></View>
  </View>;
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', gap: 10 },
  box: { flex: 1, backgroundColor: colors.surfaceRaised, borderRadius: 12, padding: 12, gap: 4 },
  value: { color: colors.text, fontSize: 22, fontWeight: '800' },
  estimate: { color: '#9DBDFF' },
  unit: { color: colors.secondary, fontSize: 12, fontWeight: '600' },
  note: { color: colors.secondary, fontSize: 11, lineHeight: 16 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: '#F5B841', backgroundColor: '#2A2210' },
  badgeTitle: { color: '#F5B841', fontSize: 13, fontWeight: '800' },
  badgeText: { color: colors.text, fontSize: 12 },
  flex: { flex: 1 },
});
