import { StyleSheet, Text, View } from 'react-native';
import { Card } from '@/components/Card';
import { Eyebrow } from '@/components/Typography';
import type { WeeklyLoad } from '@/data/trainingTypes';
import { colors } from '@/theme/colors';

export const LOAD_COLORS = { strength: colors.blue, conditioning: '#F5B841', cardio: colors.green } as const;
const LABELS = { strength: 'Fuerza', conditioning: 'Funcional', cardio: 'Cardio' } as const;

/** Mensaje de la tendencia de carga (semana actual contra el promedio de las anteriores). */
export function loadMessage(load: WeeklyLoad): string {
  const current = load.weeks[load.weeks.length - 1];
  if (load.trend.status === 'spike') return `Esta semana llevas ${load.trend.ratio}× tu carga promedio. Cuida la recuperación: baja la intensidad o planea una semana de descarga.`;
  if (load.trend.status === 'ok') return 'Tu carga va dentro de lo normal para ti.';
  if (current && current.missingRpe > 0 && current.total === 0) return 'Anota el RPE al terminar cada sesión para calcular tu carga.';
  return 'Con 3 semanas registradas podremos comparar tu carga y avisarte de picos.';
}

/**
 * Carga semanal (RPE × minutos) de las últimas semanas, apilada por tipo: así se ve en una sola gráfica
 * la fuerza, lo funcional y el cardio de un atleta híbrido.
 */
export function LoadCard({ load }: { load: WeeklyLoad }) {
  const max = Math.max(1, ...load.weeks.map((w) => w.total));
  const current = load.weeks[load.weeks.length - 1]!;
  const missing = load.weeks.reduce((n, w) => n + w.missingRpe, 0);
  return <Card>
    <View style={s.top}><View><Eyebrow>CARGA DE ESTA SEMANA</Eyebrow><Text style={s.big}>{current.total.toLocaleString('es-MX')} <Text style={s.unit}>UA</Text></Text></View>
      <View style={s.legend}>{(Object.keys(LABELS) as Array<keyof typeof LABELS>).map((k) => <View key={k} style={s.legendRow}><View style={[s.dot, { backgroundColor: LOAD_COLORS[k] }]}/><Text style={s.legendText}>{LABELS[k]}</Text></View>)}</View>
    </View>
    <View style={s.chart} accessibilityLabel={`Carga de las últimas ${load.weeks.length} semanas`}>
      {load.weeks.map((w, i) => <View key={w.weekStart} style={s.col}>
        <View style={s.stack}>
          {(['cardio', 'conditioning', 'strength'] as const).map((k) => w.byKind[k] > 0
            ? <View key={k} style={{ height: Math.max(3, Math.round((w.byKind[k] / max) * 100)), backgroundColor: LOAD_COLORS[k] }}/> : null)}
        </View>
        <Text style={[s.week, i === load.weeks.length - 1 && s.weekNow]}>{i === load.weeks.length - 1 ? 'Esta' : new Date(`${w.weekStart}T12:00:00`).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })}</Text>
      </View>)}
    </View>
    <Text style={[s.msg, load.trend.status === 'spike' && s.spike]}>{loadMessage(load)}</Text>
    <Text style={s.note}>Carga = RPE de la sesión × minutos (método de Foster).{missing ? ` ${missing} ${missing === 1 ? 'sesión no tiene' : 'sesiones no tienen'} RPE y no suman.` : ''}</Text>
  </Card>;
}

const s = StyleSheet.create({
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  big: { color: colors.text, fontSize: 26, fontWeight: '800', marginTop: 4 }, unit: { color: colors.secondary, fontSize: 12, fontWeight: '600' },
  legend: { gap: 3 }, legendRow: { flexDirection: 'row', alignItems: 'center', gap: 6 }, dot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { color: colors.secondary, fontSize: 10, fontWeight: '700' },
  chart: { height: 130, flexDirection: 'row', alignItems: 'flex-end', gap: 12, paddingTop: 10 },
  col: { flex: 1, alignItems: 'center', gap: 6 }, stack: { width: '70%', borderRadius: 6, overflow: 'hidden', justifyContent: 'flex-end' },
  week: { color: colors.muted, fontSize: 9, fontWeight: '700' }, weekNow: { color: colors.text },
  msg: { color: colors.text, fontSize: 12, lineHeight: 18 }, spike: { color: '#F5B841', fontWeight: '800' },
  note: { color: colors.muted, fontSize: 10, lineHeight: 15 },
});
