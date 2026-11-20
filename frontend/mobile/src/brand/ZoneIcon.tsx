import { MaterialCommunityIcons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import { colors, themed } from '@/theme/colors';
import { ZONES, toneColor, toneSoft, type Tone, type Zone } from './vibe';

/** Mosaico con el ícono de lo que vas a entrenar. */
export function ZoneTile({ zone, size = 60 }: { zone: Zone; size?: number }) {
  const z = ZONES[zone];
  return <View style={[s.tile, { width: size, height: size, borderRadius: size * 0.28, backgroundColor: toneSoft(z.tone), borderColor: toneColor(z.tone) }]}>
    <MaterialCommunityIcons name={z.icon} size={size * 0.56} color={toneColor(z.tone)}/>
  </View>;
}

/** Etiqueta de músculo con su punto de color. */
export function MuscleTag({ label, tone }: { label: string; tone: Tone }) {
  return <View style={s.tag}><View style={[s.dot, { backgroundColor: toneColor(tone) }]}/><Text style={s.tagText}>{label.toUpperCase()}</Text></View>;
}

/** Dato rápido con ícono (tiempo, ejercicios, series…). */
export function StatChip({ icon, value, label, tone }: { icon: string; value: string; label: string; tone: Tone }) {
  return <View style={s.chip}>
    <MaterialCommunityIcons name={icon as never} size={18} color={toneColor(tone)}/>
    <View><Text style={s.chipValue}>{value}</Text><Text style={s.chipLabel}>{label}</Text></View>
  </View>;
}

const s = themed(() => StyleSheet.create({
  tile: { alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  tag: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border },
  dot: { width: 7, height: 7, borderRadius: 4 },
  tagText: { color: colors.text, fontSize: 11, fontWeight: '700', letterSpacing: 0.4 },
  chip: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, paddingVertical: 9, borderRadius: 12, backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border },
  chipValue: { color: colors.text, fontSize: 15, fontWeight: '800' },
  chipLabel: { color: colors.secondary, fontSize: 9, fontWeight: '700', letterSpacing: 0.6 },
}));
