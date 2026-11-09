import { StyleSheet, Text, View } from 'react-native';
import { programCycle } from '@athlete/domain';
import { Card } from '@/components/Card';
import { Eyebrow } from '@/components/Typography';
import type { BenchmarkItem, Program, ProgramWeekCount, WeeklyLoad } from '@/data/trainingTypes';
import { HYBRID_COLOR } from '@/program/HybridCard';
import { clock } from '@/workout/blocks';
import { colors } from '@/theme/colors';

const shortDate = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });

/** "6+4", "24:10", "5 rondas". */
export function benchmarkValue(format: string, p: { roundsCompleted: number | null; extraReps: number | null; durationSeconds: number | null }): string {
  if (format === 'for_time') return p.durationSeconds ? clock(p.durationSeconds) : '—';
  if (p.roundsCompleted === null) return '—';
  return format === 'amrap' && p.extraReps ? `${p.roundsCompleted}+${p.extraReps}` : `${p.roundsCompleted} ${p.roundsCompleted === 1 ? 'ronda' : 'rondas'}`;
}

/** Semana del programa y si toca descarga (semana 6 del ciclo o pico de carga). */
export function CycleCard({ program, load, today }: { program: Program; load: WeeklyLoad | null; today: string }) {
  const c = programCycle(program.startedOn ?? today, today);
  const spike = load?.trend.status === 'spike';
  const deload = c.deloadWeek || spike;
  return <Card accent={deload ? '#F5B841' : HYBRID_COLOR}>
    <Eyebrow>{program.name.toUpperCase()}</Eyebrow>
    <Text style={s.big}>Semana {c.cycleWeek} <Text style={s.unit}>de {c.cycleLength}</Text></Text>
    <View style={s.cycle}>{Array.from({ length: c.cycleLength }, (_, i) => <View key={i} style={[s.seg, i < c.cycleWeek && s.segOn, i === c.cycleLength - 1 && s.segDeload]}/>)}</View>
    <Text style={[s.msg, deload && s.warn]}>{deload
      ? `${spike && !c.deloadWeek ? 'Tu carga se disparó esta semana. ' : ''}Toca semana de descarga: haz más o menos 60 % de las series, mantén el RPE en 6 o menos y duerme bien. Así llegas fresco al siguiente ciclo.`
      : c.cycleWeek === c.cycleLength - 1 ? 'Semana fuerte: la próxima es de descarga.' : 'Sube poco a poco: si completas tus reps con el RPE controlado, aumenta la carga.'}</Text>
    {c.week > c.cycleLength ? <Text style={s.note}>Llevas {c.week} semanas con este programa.</Text> : null}
  </Card>;
}

/** Sesiones hechas contra planeadas por semana. */
export function AdherenceCard({ weeks }: { weeks: ProgramWeekCount[] }) {
  const current = weeks[weeks.length - 1];
  const finished = weeks.slice(0, -1).filter((w) => w.done > 0 || w.planned > 0);
  const avg = finished.length ? Math.round((finished.reduce((n, w) => n + Math.min(1, w.done / Math.max(1, w.planned)), 0) / finished.length) * 100) : null;
  return <Card>
    <Eyebrow>CUMPLIMIENTO DEL PROGRAMA</Eyebrow>
    <View style={s.bars}>{weeks.map((w, i) => {
      const pct = Math.min(1, w.done / Math.max(1, w.planned));
      return <View key={w.weekStart} style={s.barCol}>
        <Text style={s.barNum}>{w.done}</Text>
        <View style={s.barTrack}><View style={[s.barFill, { height: `${Math.max(4, pct * 100)}%`, backgroundColor: pct >= 0.8 ? colors.green : HYBRID_COLOR }]}/></View>
        <Text style={[s.barLabel, i === weeks.length - 1 && s.now]}>{i === weeks.length - 1 ? 'Esta' : shortDate(w.weekStart)}</Text>
      </View>;
    })}</View>
    <Text style={s.msg}>{current ? `Esta semana: ${current.done} de ${current.planned}.` : ''}{avg !== null ? ` Promedio de semanas anteriores: ${avg} %.` : ''} Verde = 80 % o más (cuenta para tu racha de semanas).</Text>
  </Card>;
}

/** Tus WOD a lo largo del tiempo: último resultado, tendencia y mejor marca. */
export function BenchmarksCard({ items }: { items: BenchmarkItem[] }) {
  return <Card>
    <Eyebrow>TUS WOD</Eyebrow>
    {items.slice(0, 6).map((b) => {
      const last = b.points[b.points.length - 1]!;
      const arrow = b.trend === 'up' ? '↗' : b.trend === 'down' ? '↘' : b.trend === 'same' ? '→' : '';
      const scores = b.points.map((p) => (b.format === 'for_time' ? -(p.durationSeconds ?? 0) : (p.roundsCompleted ?? 0) * 100 + (p.extraReps ?? 0)));
      const min = Math.min(...scores), max = Math.max(...scores);
      return <View key={b.key} style={s.bench}>
        <View style={s.flex}><Text style={s.benchName}>{b.name.replace(/^[A-Z] · /, '')}</Text><Text style={s.note}>{b.dayName ?? ''}{b.dayName ? ' · ' : ''}{b.points.length} {b.points.length === 1 ? 'vez' : 'veces'}</Text></View>
        <View style={s.spark}>{scores.slice(-8).map((v, i) => <View key={i} style={[s.sparkBar, { height: 6 + (max === min ? 10 : ((v - min) / (max - min)) * 18) }]}/>)}</View>
        <Text style={[s.benchValue, b.trend === 'up' && { color: colors.green }, b.trend === 'down' && { color: colors.red }]}>{benchmarkValue(b.format, last)} {arrow}</Text>
      </View>;
    })}
    <Text style={s.note}>↗ mejor que la vez anterior · ↘ peor. En "por tiempo", menos es mejor.</Text>
  </Card>;
}

const s = StyleSheet.create({
  big: { color: colors.text, fontSize: 26, fontWeight: '800' }, unit: { color: colors.secondary, fontSize: 15, fontWeight: '700' },
  cycle: { flexDirection: 'row', gap: 5 }, seg: { flex: 1, height: 8, borderRadius: 4, backgroundColor: colors.graphite },
  segOn: { backgroundColor: HYBRID_COLOR }, segDeload: { borderWidth: 1, borderColor: colors.green },
  msg: { color: colors.secondary, fontSize: 12, lineHeight: 18 }, warn: { color: '#F5B841', fontWeight: '700' }, note: { color: colors.muted, fontSize: 11 },
  bars: { flexDirection: 'row', gap: 8, height: 110, alignItems: 'flex-end' }, barCol: { flex: 1, alignItems: 'center', gap: 4, height: '100%' },
  barNum: { color: colors.text, fontSize: 11, fontWeight: '800' }, barTrack: { flex: 1, width: '70%', justifyContent: 'flex-end', backgroundColor: colors.surfaceRaised, borderRadius: 5, overflow: 'hidden' },
  barFill: { width: '100%', borderRadius: 5 }, barLabel: { color: colors.muted, fontSize: 9, fontWeight: '700' }, now: { color: colors.text },
  bench: { flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 9 }, flex: { flex: 1 },
  benchName: { color: colors.text, fontSize: 14, fontWeight: '800' }, benchValue: { color: colors.text, fontSize: 16, fontWeight: '800', minWidth: 64, textAlign: 'right' },
  spark: { flexDirection: 'row', alignItems: 'flex-end', gap: 2, height: 26 }, sparkBar: { width: 5, borderRadius: 2, backgroundColor: HYBRID_COLOR },
});
