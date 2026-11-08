import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, G } from 'react-native-svg';
import { colors } from '@/theme/colors';

export type DonutSegment = { key: string; value: number; color: string };

/** Paleta para categorías en fondo oscuro; el último color se reserva para "Otros". */
export const CATEGORY_COLORS = ['#1769FF', '#55D6A2', '#F5B841', '#9B7BFF', '#3CC8E6'] as const;
export const OTHERS_COLOR = '#4A5363';

/**
 * Arcos de la dona: longitud y desplazamiento de cada segmento sobre la circunferencia.
 * Con más de un segmento deja una separación pequeña para que se distingan.
 */
export function donutArcs(segments: readonly DonutSegment[], circumference: number, gap = 3, outOf?: number) {
  const live = segments.filter((s) => s.value > 0);
  const total = outOf ?? live.reduce((n, s) => n + s.value, 0);
  if (!total) return [];
  const sep = live.length > 1 ? gap : 0;
  let start = 0;
  return live.map((s) => {
    const full = (s.value / total) * circumference;
    const arc = { key: s.key, color: s.color, length: Math.max(0.5, full - sep), offset: -start };
    start += full;
    return arc;
  });
}

/** Gráfica de dona con un texto al centro. Sin datos se dibuja solo el anillo vacío. */
export function Donut({ segments, size = 112, thickness = 13, center, caption, outOf }: {
  segments: readonly DonutSegment[]; size?: number; thickness?: number; center: string; caption?: string;
  /** Si se da, la dona es un medidor: los segmentos llenan `valor / outOf` del anillo. */
  outOf?: number;
}) {
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  const arcs = donutArcs(segments, c, 3, outOf);
  return <View style={{ width: size, height: size }} accessibilityRole="image" accessibilityLabel={`${center}${caption ? ` ${caption}` : ''}`}>
    <Svg width={size} height={size}>
      <Circle cx={size / 2} cy={size / 2} r={r} stroke={colors.graphite} strokeWidth={thickness} fill="none"/>
      <G rotation={-90} origin={`${size / 2}, ${size / 2}`}>
        {arcs.map((a) => <Circle key={a.key} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={a.color} strokeWidth={thickness}
          strokeDasharray={`${a.length} ${c}`} strokeDashoffset={a.offset} strokeLinecap={outOf ? 'round' : 'butt'}/>)}
      </G>
    </Svg>
    <View style={s.center} pointerEvents="none">
      <Text style={s.value}>{center}</Text>
      {caption ? <Text style={s.caption}>{caption}</Text> : null}
    </View>
  </View>;
}

const s = StyleSheet.create({
  center: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  value: { color: colors.text, fontSize: 22, fontWeight: '800', letterSpacing: -0.5 },
  caption: { color: colors.secondary, fontSize: 10, fontWeight: '700' },
});
