import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { toGoal, weightTrend } from '@athlete/domain';
import { AppInput } from '@/components/AppInput';
import { Card } from '@/components/Card';
import { Eyebrow } from '@/components/Typography';
import type { BodyMeasurement } from '@/data/trainingTypes';
import { localDateOfDevice } from '@/lib/localDate';
import { colors } from '@/theme/colors';

export type BodyKind = { id: BodyMeasurement['type']; title: string; unit: string };
const fmt = (n: number) => String(Math.round(n * 10) / 10);

/**
 * Meta y avance de una medida. En peso se usa el promedio de 7 días (el peso diario sube y baja por agua),
 * con el cambio contra la semana anterior.
 */
export function BodyGoalCard({ kind, measurements, goal, onSaveGoal }: {
  kind: BodyKind; measurements: readonly BodyMeasurement[]; goal: number | null; onSaveGoal: (value: number | null) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const mine = measurements.filter((m) => m.type === kind.id);
  const isWeight = kind.id === 'weight_kg';
  const trend = isWeight ? weightTrend(mine.map((m) => ({ localDate: localDateOfDevice(new Date(m.measuredAt)), kg: m.value })), localDateOfDevice(new Date())) : null;
  const latest = mine[0]?.value ?? null;
  const current = trend?.avg7 ?? latest;
  const progress = toGoal(current, goal);

  async function save(value: number | null) {
    if (value !== null && (!Number.isFinite(value) || value < 20 || value > (isWeight ? 400 : 300))) { setError(`La meta debe estar entre 20 y ${isWeight ? 400 : 300} ${kind.unit}.`); return; }
    setError('');
    try { await onSaveGoal(value); setEditing(false); } catch { setError('No se pudo guardar la meta.'); }
  }

  return <Card accent={goal !== null ? colors.green : undefined}>
    <Eyebrow>{kind.title.toUpperCase()}</Eyebrow>
    {current === null ? <Text style={s.muted}>Aún no hay registros de {kind.title.toLowerCase()}.</Text> : <View style={s.row}>
      <View style={s.flex}>
        <Text style={s.big}>{fmt(current)} <Text style={s.unit}>{kind.unit}</Text></Text>
        <Text style={s.muted}>{trend?.avg7 !== null && trend ? `Promedio de 7 días (${trend.count7} ${trend.count7 === 1 ? 'pesaje' : 'pesajes'})` : 'Último registro'}</Text>
      </View>
      {trend?.weeklyChange !== null && trend ? <View style={s.change}>
        <Text style={[s.changeNum, { color: trend.weeklyChange === 0 ? colors.secondary : colors.text }]}>{trend.weeklyChange > 0 ? '+' : ''}{fmt(trend.weeklyChange)} kg</Text>
        <Text style={s.muted}>vs semana pasada</Text>
      </View> : null}
    </View>}
    {goal !== null && !editing ? <Text style={s.goal}>{`Meta: ${fmt(goal)} ${kind.unit}`}{progress ? progress.direction === 'done' ? ' · ¡meta alcanzada!' : ` · te faltan ${fmt(progress.remaining)} ${kind.unit} por ${progress.direction === 'down' ? 'bajar' : 'subir'}` : ''}</Text> : null}
    {editing ? <View style={s.edit}>
      <AppInput label={`Meta (${kind.unit})`} defaultValue={goal === null ? '' : fmt(goal)} onChangeText={setDraft} keyboardType="decimal-pad" autoCorrect={false} spellCheck={false}/>
      <View style={s.actions}>
        <Pressable accessibilityRole="button" onPress={() => void save(draft.trim() === '' ? goal : Number(draft.trim().replace(',', '.')))} style={s.btnOn}><Text style={s.btnOnText}>Guardar meta</Text></Pressable>
        {goal !== null ? <Pressable accessibilityRole="button" onPress={() => void save(null)} style={s.btn}><Text style={s.btnText}>Quitar meta</Text></Pressable> : null}
        <Pressable accessibilityRole="button" onPress={() => { setEditing(false); setError(''); }} style={s.btn}><Text style={s.btnText}>Cancelar</Text></Pressable>
      </View>
    </View> : <Pressable accessibilityRole="button" accessibilityLabel={goal === null ? `Poner meta de ${kind.title.toLowerCase()}` : `Cambiar meta de ${kind.title.toLowerCase()}`} onPress={() => { setDraft(''); setEditing(true); }}>
      <Text style={s.link}>{goal === null ? '＋ Poner meta' : 'Cambiar meta'}</Text></Pressable>}
    {error ? <Text accessibilityRole="alert" style={s.error}>{error}</Text> : null}
  </Card>;
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 }, flex: { flex: 1 },
  big: { color: colors.text, fontSize: 28, fontWeight: '800' }, unit: { fontSize: 14, color: colors.secondary, fontWeight: '700' },
  muted: { color: colors.secondary, fontSize: 11, lineHeight: 16 },
  change: { alignItems: 'flex-end' }, changeNum: { fontSize: 16, fontWeight: '800' },
  goal: { color: colors.green, fontSize: 13, fontWeight: '800' },
  link: { color: colors.accentText, fontSize: 12, fontWeight: '800', paddingVertical: 4 },
  edit: { gap: 8 }, actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  btnOn: { borderRadius: 10, backgroundColor: colors.blue, paddingHorizontal: 12, paddingVertical: 8 }, btnOnText: { color: 'white', fontSize: 12, fontWeight: '800' },
  btn: { borderRadius: 10, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, paddingVertical: 8 }, btnText: { color: colors.text, fontSize: 12, fontWeight: '700' },
  error: { color: colors.red, fontSize: 11 },
});
