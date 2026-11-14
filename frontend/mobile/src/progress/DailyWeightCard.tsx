import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { toGoal, weightTrend } from '@athlete/domain';
import { AppInput } from '@/components/AppInput';
import { Card } from '@/components/Card';
import { Eyebrow } from '@/components/Typography';
import type { TrainingRepository } from '@/data/TrainingRepository';
import type { BodyMeasurement } from '@/data/trainingTypes';
import { localDateOfDevice } from '@/lib/localDate';
import { colors } from '@/theme/colors';

const fmt = (n: number) => String(Math.round(n * 10) / 10);

/**
 * Pesaje diario en Inicio: si hoy no te has pesado, un campo para hacerlo en un toque; si ya, tu peso de hoy,
 * el promedio de 7 días (lo que cuenta para el plan) y cuánto falta para tu meta.
 */
export function DailyWeightCard({ repository }: { repository: TrainingRepository }) {
  const router = useRouter();
  const [weights, setWeights] = useState<BodyMeasurement[] | null>(null);
  const [goal, setGoal] = useState<number | null>(null);
  const [value, setValue] = useState('');
  const [inputKey, setInputKey] = useState(0);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const [all, goals] = await Promise.all([repository.listBodyMeasurements(), repository.getBodyGoals().catch(() => null)]);
    setWeights(all.filter((m) => m.type === 'weight_kg')); setGoal(goals?.weight_kg ?? null);
  }, [repository]);
  useFocusEffect(useCallback(() => { void load().catch(() => setWeights([])); }, [load]));

  async function save() {
    const kg = Number(value.trim().replace(',', '.'));
    if (!Number.isFinite(kg) || kg < 20 || kg > 400) { setError('Escribe tu peso en kg (entre 20 y 400).'); return; }
    setSaving(true); setError('');
    try { await repository.addBodyMeasurement({ type: 'weight_kg', value: kg, measuredAt: new Date().toISOString() }); setValue(''); setInputKey((k) => k + 1); await load(); }
    catch { setError('No se pudo guardar. Intenta de nuevo.'); }
    finally { setSaving(false); }
  }

  if (weights === null) return null;
  const today = localDateOfDevice(new Date());
  const points = weights.map((m) => ({ localDate: localDateOfDevice(new Date(m.measuredAt)), kg: m.value }));
  const todays = points.filter((p) => p.localDate === today)[0] ?? null;
  const trend = weightTrend(points, today);
  const progress = toGoal(trend.avg7, goal);

  return <Card>
    <View style={s.head}><Eyebrow>PESO DE HOY</Eyebrow>
      <Pressable accessibilityRole="button" onPress={() => router.push('/progress')}><Text style={s.link}>Medidas y metas ›</Text></Pressable></View>
    {todays ? <View style={s.row}>
      <Text style={s.big}>{fmt(todays.kg)} <Text style={s.unit}>kg</Text></Text>
      <Text style={s.ok}>✓ Registrado hoy</Text>
    </View> : <View style={s.row}>
      <View style={s.flex}><AppInput key={`peso-${inputKey}`} label="Tu peso (kg)" defaultValue="" onChangeText={setValue} keyboardType="decimal-pad" placeholder={trend.latest ? fmt(trend.latest.kg) : 'Ej. 78.5'} autoCorrect={false} spellCheck={false}/></View>
      <Pressable accessibilityRole="button" accessibilityLabel="Guardar peso de hoy" disabled={saving} onPress={() => void save()} style={[s.save, saving && s.dim]}><Text style={s.saveText}>Guardar</Text></Pressable>
    </View>}
    {trend.avg7 !== null ? <Text style={s.muted}>
      Promedio 7 días: {fmt(trend.avg7)} kg{trend.weeklyChange !== null ? ` (${trend.weeklyChange > 0 ? '+' : ''}${fmt(trend.weeklyChange)} vs semana pasada)` : ''}
      {progress ? progress.direction === 'done' ? ' · ¡meta alcanzada!' : ` · faltan ${fmt(progress.remaining)} kg para tu meta` : ''}
    </Text> : <Text style={s.muted}>Pésate a diario, de preferencia en ayunas: el plan usa tu promedio de 7 días, no un solo día.</Text>}
    {error ? <Text accessibilityRole="alert" style={s.error}>{error}</Text> : null}
  </Card>;
}

const s = StyleSheet.create({
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  link: { color: colors.secondary, fontSize: 12, fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: 10 }, flex: { flex: 1 },
  big: { color: colors.text, fontSize: 28, fontWeight: '800' }, unit: { fontSize: 14, color: colors.secondary },
  ok: { color: colors.green, fontSize: 12, fontWeight: '800', marginBottom: 6 },
  save: { backgroundColor: colors.blue, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 13, marginBottom: 2 }, dim: { opacity: 0.5 },
  saveText: { color: 'white', fontSize: 14, fontWeight: '800' },
  muted: { color: colors.secondary, fontSize: 12, lineHeight: 17 },
  error: { color: colors.red, fontSize: 11 },
});
