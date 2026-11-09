import { forwardRef, type ComponentRef, type PropsWithChildren } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import type { CardioCardData, SessionCardData, WeekCardData, WodCardData } from './shareData';

/** Tamaño en pantalla; se exporta a 1080 × 1920 (historia de Instagram). */
export const CARD_W = 300;
export const CARD_H = 533;
/** Referencia a la vista nativa de la tarjeta (para convertirla en imagen). */
export type CardRef = ComponentRef<typeof View>;
const C = { bg: '#0B0E14', text: '#F4F6FA', sub: '#9AA3B2', line: '#252B36', amber: '#F5B841', green: '#55D6A2' };

const Frame = forwardRef<CardRef, PropsWithChildren<{ tag?: string; tagColor?: string; date?: string }>>(({ children, tag, tagColor, date }, ref) =>
  <View ref={ref} collapsable={false} style={s.card}>
    <View style={s.top}><Text style={s.brand}>ATHLETE</Text><Text style={[s.tag, tagColor ? { color: tagColor } : null]}>{tag ?? date ?? ''}</Text></View>
    {children}
  </View>);
Frame.displayName = 'Frame';

function Stat({ label, value }: { label: string; value: string }) {
  return <View style={s.stat}><Text style={s.statLabel}>{label}</Text><Text style={s.statValue}>{value}</Text></View>;
}

function Ring({ value, color }: { value: number; color: string }) {
  const r = 31; const c = 2 * Math.PI * r;
  return <View style={s.ring}>
    <Svg width={76} height={76}><Circle cx={38} cy={38} r={r} stroke={C.line} strokeWidth={8} fill="none"/>
      <Circle cx={38} cy={38} r={r} stroke={color} strokeWidth={8} fill="none" strokeDasharray={`${(value / 100) * c} ${c}`} strokeLinecap="round" rotation={-90} origin="38, 38"/></Svg>
    <Text style={s.ringText}>{value}</Text>
  </View>;
}

/** A · Resumen de sesión (fuerza). */
export const SessionCard = forwardRef<CardRef, { data: SessionCardData }>(({ data }, ref) => {
  const color = (data.score?.score ?? 0) >= 85 ? C.green : (data.score?.score ?? 0) >= 70 ? '#1769FF' : C.amber;
  const total = data.muscles.reduce((n, m) => n + m.sets, 0) || 1;
  return <Frame ref={ref} date={data.date}>
    <Text style={s.title}>{data.title}</Text>
    {data.score ? <View style={s.scoreRow}><Ring value={data.score.score} color={color}/><View><Text style={s.statLabel}>calificación</Text><Text style={[s.grade, { color }]}>{data.score.grade}</Text></View></View> : null}
    <View style={s.grid}>
      {data.durationMin ? <Stat label="duración" value={`${data.durationMin} min`}/> : null}
      {data.load ? <Stat label="carga" value={`${data.load} UA`}/> : null}
      <Stat label="series" value={String(data.sets)}/>
      {data.volumeKg ? <Stat label="volumen" value={data.volumeKg >= 1000 ? `${(data.volumeKg / 1000).toFixed(1)} t` : `${data.volumeKg} kg`}/> : null}
    </View>
    {data.record ? <View style={s.record}><Text style={s.recordText}>🏆 Récord: {data.record}</Text></View> : null}
    <View style={s.flex}/>
    {data.muscles.length ? <>
      <View style={s.bar}>{data.muscles.map((m) => <View key={m.name} style={{ flex: m.sets / total, backgroundColor: m.color, borderRadius: 3 }}/>)}</View>
      <Text style={s.small}>{data.muscles.map((m) => m.name.toLowerCase()).join(' · ')}</Text>
    </> : null}
  </Frame>;
});
SessionCard.displayName = 'SessionCard';

/** B · Resultado del WOD (funcional). */
export const WodCard = forwardRef<CardRef, { data: WodCardData }>(({ data }, ref) =>
  <Frame ref={ref} tag="MODO HÍBRIDO" tagColor={C.amber}>
    <Text style={s.sub}>{data.title} · {data.blockLabel}</Text>
    <Text style={s.huge}>{data.big}</Text>
    <Text style={s.unit}>{data.unit}</Text>
    {data.delta ? <View style={s.delta}><Text style={s.deltaText}>↗ {data.delta}</Text></View> : null}
    <View style={s.recipe}>{data.recipe.map((line) => <Text key={line} style={s.recipeLine}>{line}</Text>)}</View>
    <View style={s.flex}/>
    <View style={s.row}>
      {data.rpe ? <Stat label="RPE" value={String(data.rpe)}/> : null}
      {data.durationMin ? <Stat label="tiempo" value={`${data.durationMin} min`}/> : null}
      {data.load ? <Stat label="carga" value={String(data.load)}/> : null}
    </View>
    <Text style={s.small}>{data.date}</Text>
  </Frame>);
WodCard.displayName = 'WodCard';

/** Cardio (natación, carrera…): metros o km gigantes y el ritmo. */
export const CardioCard = forwardRef<CardRef, { data: CardioCardData }>(({ data }, ref) =>
  <Frame ref={ref} date={data.date}>
    <Text style={s.title}>{data.title}</Text>
    <Text style={[s.huge, { color: data.color }]}>{data.big}</Text>
    <Text style={s.unit}>{data.unit}</Text>
    <View style={s.flex}/>
    <View style={s.grid}>{data.stats.map(([l, v]) => <Stat key={l} label={l} value={v}/>)}</View>
  </Frame>);
CardioCard.displayName = 'CardioCard';

/** C · Mi semana híbrida: las barras de colores por día son nuestro "mapa". */
export const WeekCard = forwardRef<CardRef, { data: WeekCardData }>(({ data }, ref) =>
  <Frame ref={ref} tag={`${data.done} de ${data.planned}`} tagColor={data.done >= data.planned ? C.green : C.sub}>
    <Text style={s.title}>Mi semana híbrida</Text>
    <View style={s.week}>
      {data.days.map((d, i) => <View key={i} style={s.dayCol}>
        <Text style={s.small}>{d.label}</Text>
        {d.bars.length ? d.bars.map((b, j) => <View key={j} style={{ height: b.height, borderRadius: 4, backgroundColor: b.color, opacity: b.done ? 1 : 0.25 }}/>)
          : <View style={{ height: 6, borderRadius: 3, backgroundColor: C.line }}/>}
      </View>)}
    </View>
    <View style={s.grid}>{data.stats.map(([l, v]) => <Stat key={l} label={l} value={v}/>)}</View>
    <View style={s.flex}/>
    {data.done >= data.planned ? <Text style={s.streak}>🔥 Semana completa</Text> : null}
    <Text style={s.small}>{data.programName}</Text>
  </Frame>);
WeekCard.displayName = 'WeekCard';

const s = StyleSheet.create({
  card: { width: CARD_W, height: CARD_H, backgroundColor: C.bg, borderRadius: 18, padding: 18, gap: 12 },
  top: { flexDirection: 'row', justifyContent: 'space-between' }, brand: { color: C.sub, fontSize: 11, letterSpacing: 2.5, fontWeight: '800' },
  tag: { color: C.sub, fontSize: 11, fontWeight: '700' },
  title: { color: C.text, fontSize: 21, fontWeight: '800', lineHeight: 25 }, sub: { color: C.sub, fontSize: 13 },
  scoreRow: { flexDirection: 'row', alignItems: 'center', gap: 12 }, ring: { width: 76, height: 76, alignItems: 'center', justifyContent: 'center' },
  ringText: { position: 'absolute', color: C.text, fontSize: 22, fontWeight: '800' }, grade: { fontSize: 18, fontWeight: '800' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 10 }, row: { flexDirection: 'row', gap: 18 },
  stat: { width: '50%' }, statLabel: { color: C.sub, fontSize: 11 }, statValue: { color: C.text, fontSize: 18, fontWeight: '800' },
  record: { backgroundColor: '#2A2410', borderRadius: 10, padding: 9 }, recordText: { color: C.amber, fontSize: 12, fontWeight: '700' },
  flex: { flex: 1 }, bar: { flexDirection: 'row', gap: 4, height: 8 }, small: { color: C.sub, fontSize: 11 },
  huge: { color: C.amber, fontSize: 64, fontWeight: '800', lineHeight: 68 }, unit: { color: C.text, fontSize: 14, marginTop: -8 },
  delta: { alignSelf: 'flex-start', backgroundColor: '#12291F', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 }, deltaText: { color: C.green, fontSize: 12, fontWeight: '800' },
  recipe: { borderTopWidth: 1, borderTopColor: C.line, paddingTop: 8, gap: 2 }, recipeLine: { color: '#C9CFDA', fontSize: 13, lineHeight: 19 },
  week: { flexDirection: 'row', gap: 6, alignItems: 'flex-start', minHeight: 120 }, dayCol: { flex: 1, gap: 3, alignItems: 'stretch' },
  streak: { color: C.green, fontSize: 13, fontWeight: '800' },
});
