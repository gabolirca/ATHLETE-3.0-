import { StyleSheet, Text, View } from 'react-native';
import type { MuscleVolumeItem, WeeklyMuscleVolume } from '@/data/trainingTypes';
import { CATEGORY_COLORS, OTHERS_COLOR, type DonutSegment } from '@/charts/Donut';
import { colors } from '@/theme/colors';

/** Músculos con series para la dona: los 5 con más series y el resto agrupado en "Otros". */
export function muscleSegments(volume: WeeklyMuscleVolume | null, top = 5): Array<DonutSegment & { name: string; sets: number }> {
  const withSets = (volume?.items ?? []).filter((m) => m.sets > 0);
  const main = withSets.slice(0, top).map((m, i) => ({ key: m.muscle, name: m.name, sets: m.sets, value: m.sets, color: CATEGORY_COLORS[i % CATEGORY_COLORS.length]! }));
  const rest = withSets.slice(top).reduce((n, m) => n + m.sets, 0);
  return rest > 0 ? [...main, { key: 'others', name: 'Otros', sets: rest, value: rest, color: OTHERS_COLOR }] : main;
}

/** "3", "1.5" — las series secundarias cuentan medio. */
export function formatSets(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

const STATUS = {
  low: { label: 'Bajo', color: '#F5B841' },
  ok: { label: 'En rango', color: colors.green },
  high: { label: 'Alto', color: colors.red },
  untracked: { label: '', color: colors.secondary },
} as const;

/** Músculos con rango que quedaron por debajo, para el aviso de Inicio ("Te falta: Pierna…"). */
export function lowMuscles(volume: WeeklyMuscleVolume | null): MuscleVolumeItem[] {
  return (volume?.items ?? []).filter((m) => m.status === 'low');
}

/** Barra por músculo: la franja clara es el rango de referencia y la barra son tus series de la semana. */
export function MuscleVolumeRow({ item, scaleMax }: { item: MuscleVolumeItem; scaleMax: number }) {
  const pct = (n: number) => `${Math.min(100, (n / scaleMax) * 100)}%` as const;
  const status = STATUS[item.status];
  return <View style={s.row} accessibilityLabel={`${item.name}: ${formatSets(item.sets)} series${item.range ? `, referencia ${item.range[0]} a ${item.range[1]}, ${status.label}` : ''}`}>
    <View style={s.head}>
      <Text style={s.name}>{item.name}</Text>
      <Text style={s.sets}>{formatSets(item.sets)}{item.range ? <Text style={s.range}> / {item.range[0]}–{item.range[1]}</Text> : null}</Text>
      {status.label ? <Text style={[s.status, { color: status.color }]}>{status.label}</Text> : null}
    </View>
    <View style={s.track}>
      {item.range ? <View style={[s.band, { left: pct(item.range[0]), width: pct(item.range[1] - item.range[0]) }]}/> : null}
      <View style={[s.bar, { width: pct(item.sets), backgroundColor: status.color }]}/>
    </View>
  </View>;
}

export function VolumeExplainer() {
  return <Text style={s.note}>Series efectivas de los últimos 7 días (sin calentamiento). El músculo principal del ejercicio suma 1 serie y el secundario 0.5. La franja es una referencia general para ganar músculo (no es una prescripción): por debajo el estímulo suele quedarse corto y por encima cuesta recuperarse.</Text>;
}

const s = StyleSheet.create({
  row: { gap: 6 },
  head: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  name: { flex: 1, color: colors.text, fontSize: 13, fontWeight: '700' },
  sets: { color: colors.text, fontSize: 13, fontWeight: '800' },
  range: { color: colors.muted, fontSize: 11, fontWeight: '600' },
  status: { width: 58, textAlign: 'right', fontSize: 11, fontWeight: '800' },
  track: { height: 8, borderRadius: 4, backgroundColor: colors.graphite, overflow: 'hidden' },
  band: { position: 'absolute', top: 0, bottom: 0, backgroundColor: '#2F3A4C' },
  bar: { height: 8, borderRadius: 4, opacity: 0.95 },
  note: { color: colors.secondary, fontSize: 10, lineHeight: 15 },
});
