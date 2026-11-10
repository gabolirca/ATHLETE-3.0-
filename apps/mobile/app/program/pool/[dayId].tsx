import { useCallback, useEffect, useMemo, useState } from 'react';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { ActionButton } from '@/components/ActionButton';
import { Card } from '@/components/Card';
import { EmptyState } from '@/components/EmptyState';
import { RestTimerBar, useRestTimer } from '@/components/RestTimer';
import { Eyebrow, Title } from '@/components/Typography';
import { Screen } from '@/components/Screen';
import { useTrainingRepository } from '@/data/MobileTrainingContext';
import type { ProgramDay } from '@/data/trainingTypes';
import { HYBRID_COLOR } from '@/program/HybridCard';
import { daySummary, modalityInfo } from '@/program/format';
import { poolDraft, poolItems, poolTotals, type PoolProgress } from '@/program/pool';
import { clock } from '@/workout/blocks';
import { colors } from '@/theme/colors';

const storeKey = (dayId: string) => `athlete3.pool.${dayId.replace(/[^A-Za-z0-9._-]/g, '')}`;
/** Una sesión guardada a medias sirve hasta 8 h después (si cierras la app en la alberca, no se pierde). */
const MAX_AGE_MS = 8 * 3600_000;

/**
 * Modo alberca: palomea cada serie conforme la terminas. Cada casilla guarda su parcial (tiempo desde la anterior),
 * arranca el descanso del plan y al final se guarda como actividad de cardio ligada al día del programa.
 */
export default function PoolModeScreen() {
  const { dayId } = useLocalSearchParams<{ dayId: string }>();
  const router = useRouter();
  const repository = useTrainingRepository();
  const timer = useRestTimer();
  const [day, setDay] = useState<ProgramDay | null | undefined>(undefined);
  const [progress, setProgress] = useState<PoolProgress | null>(null);
  const [rpe, setRpe] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [, tick] = useState(0);

  useFocusEffect(useCallback(() => {
    let active = true;
    repository?.listPrograms().then((list) => { if (active) setDay(list.flatMap((p) => p.days).find((d) => d.id === dayId) ?? null); }).catch(() => { if (active) setDay(null); });
    SecureStore.getItemAsync(storeKey(dayId)).then((raw) => {
      const saved = raw ? JSON.parse(raw) as PoolProgress : null;
      if (active && saved && Date.now() - saved.startedAt < MAX_AGE_MS) setProgress(saved);
    }).catch(() => undefined);
    return () => { active = false; };
  }, [repository, dayId]));
  useEffect(() => { if (!progress) return; const id = setInterval(() => tick((n) => n + 1), 1000); return () => clearInterval(id); }, [progress]);
  const persist = (next: PoolProgress | null) => {
    setProgress(next);
    if (next) void SecureStore.setItemAsync(storeKey(dayId), JSON.stringify(next)).catch(() => undefined);
    else void SecureStore.deleteItemAsync(storeKey(dayId)).catch(() => undefined);
  };
  const items = useMemo(() => (day ? poolItems(day) : []), [day]);

  if (day === undefined) return <Screen><Title>Modo alberca</Title></Screen>;
  if (!day) return <Screen><Title>Modo alberca</Title><EmptyState title="Sesión no disponible" detail="Puede que el programa se haya quitado." action="Ir a Entrenar" onAction={() => router.replace('/train')}/></Screen>;
  const info = modalityInfo(day.modality);
  const isSwim = day.modality === 'swim';

  function toggle(key: string, restSeconds: number | null, label: string) {
    if (!progress) return;
    const done = { ...progress.done };
    if (done[key]) { delete done[key]; persist({ ...progress, done }); return; }
    const now = Date.now();
    const last = Math.max(progress.startedAt, ...Object.values(done).map((d) => d.at));
    done[key] = { at: now, seconds: Math.round((now - last) / 1000) };
    persist({ ...progress, done });
    const next = items[items.findIndex((i) => i.key === key) + 1];
    if (restSeconds) timer.start(restSeconds, next ? `Siguiente: ${next.label}` : 'Última serie');
    else if (!next) timer.stop();
    void label;
  }

  async function finish() {
    if (!repository || !progress || !day) return;
    setSaving(true); setError('');
    try {
      const id = await repository.logCardio(poolDraft(day, items, progress, Date.now(), rpe, Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'));
      persist(null);
      router.replace(`/cardio/${id}`);
    } catch { setError('No se pudo guardar. Tu avance sigue aquí; intenta de nuevo.'); }
    finally { setSaving(false); }
  }

  const totals = progress ? poolTotals(items, progress) : null;
  let currentBlock = '';
  return <View style={s.root}><Screen>
    <View><Eyebrow>{`${isSwim ? 'MODO ALBERCA' : 'MODO CARRERA'} · ${info.label.toUpperCase()}`}</Eyebrow><Title>{day.name}</Title></View>
    {!progress ? <Card accent={HYBRID_COLOR}>
      <Text style={s.summary}>{daySummary(day)}</Text>
      <Text style={s.muted}>Palomea cada serie al terminarla: guardamos tu parcial, arranca el descanso y al final se registra la sesión con tus metros y tiempo.</Text>
      <ActionButton onPress={() => persist({ startedAt: Date.now(), done: {} })}>Empezar</ActionButton>
      <Pressable accessibilityRole="button" onPress={() => router.replace({ pathname: '/cardio/new', params: { dayId: day.id } })}><Text style={s.link}>Prefiero registrar solo el total</Text></Pressable>
    </Card> : <Card accent={HYBRID_COLOR}>
      <View style={s.row}>
        <View><Eyebrow>TIEMPO</Eyebrow><Text style={s.clock} accessibilityLabel="Tiempo de la sesión">{clock((Date.now() - progress.startedAt) / 1000)}</Text></View>
        <View style={s.right}><Eyebrow>METROS</Eyebrow><Text style={s.meters}>{totals!.doneMeters.toLocaleString('es-MX')}<Text style={s.unit}> / {totals!.plannedMeters.toLocaleString('es-MX')}</Text></Text></View>
      </View>
      <View style={s.track}><View style={[s.fill, { width: `${Math.round((totals!.doneCount / Math.max(1, totals!.total)) * 100)}%` }]}/></View>
    </Card>}
    {items.map((item) => {
      const header = item.blockName !== currentBlock ? (currentBlock = item.blockName) : null;
      const done = progress?.done[item.key];
      return <View key={item.key} style={s.gap}>
        {header ? <Text style={s.block}>{header}</Text> : null}
        <Pressable disabled={!progress} accessibilityRole="checkbox" accessibilityState={{ checked: Boolean(done), disabled: !progress }} accessibilityLabel={item.label}
          onPress={() => toggle(item.key, item.restSeconds, item.label)} style={[s.item, done && s.itemDone, !progress && s.itemOff]}>
          <Ionicons name={done ? 'checkmark-circle' : 'ellipse-outline'} size={28} color={done ? colors.green : colors.secondary}/>
          <Text style={[s.itemText, done && s.itemTextDone]}>{item.label}</Text>
          {done?.seconds ? <Text style={s.split}>{clock(done.seconds)}</Text> : null}
        </Pressable>
      </View>;
    })}
    {progress ? <Card>
      <Eyebrow>¿QUÉ TAN DURA FUE? (RPE)</Eyebrow>
      <View style={s.rpeRow}>{[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => <Pressable key={n} accessibilityRole="button" accessibilityLabel={`RPE ${n}`} accessibilityState={{ selected: rpe === n }} onPress={() => setRpe(rpe === n ? null : n)} style={[s.rpe, rpe === n && s.rpeOn]}><Text style={[s.rpeText, rpe === n && s.rpeTextOn]}>{n}</Text></Pressable>)}</View>
      {error ? <Text accessibilityRole="alert" style={s.error}>{error}</Text> : null}
      <ActionButton loading={saving} onPress={() => void finish()}>{`Terminar y guardar · ${totals!.doneMeters.toLocaleString('es-MX')} m`}</ActionButton>
      <Pressable accessibilityRole="button" onPress={() => persist(null)}><Text style={s.link}>Descartar y empezar de nuevo</Text></Pressable>
    </Card> : null}
    {timer.active ? <View style={{ height: 84 }}/> : null}
  </Screen><RestTimerBar timer={timer}/></View>;
}

const s = StyleSheet.create({
  root: { flex: 1 }, gap: { gap: 6 },
  summary: { color: colors.text, fontSize: 16, fontWeight: '800' }, muted: { color: colors.secondary, fontSize: 12, lineHeight: 18 },
  link: { color: colors.accentText, fontSize: 13, fontWeight: '700', textAlign: 'center', paddingVertical: 8 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }, right: { alignItems: 'flex-end' },
  clock: { color: colors.text, fontSize: 40, fontWeight: '800', fontVariant: ['tabular-nums'] },
  meters: { color: colors.text, fontSize: 28, fontWeight: '800' }, unit: { color: colors.secondary, fontSize: 14, fontWeight: '600' },
  track: { height: 10, borderRadius: 5, backgroundColor: colors.surfaceRaised, overflow: 'hidden' }, fill: { height: 10, borderRadius: 5, backgroundColor: HYBRID_COLOR },
  block: { color: HYBRID_COLOR, fontSize: 12, fontWeight: '800', letterSpacing: 0.5, marginTop: 6 },
  item: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: colors.border, borderRadius: 16, paddingHorizontal: 14, backgroundColor: colors.surface },
  itemDone: { borderColor: colors.green, backgroundColor: colors.greenSoft }, itemOff: { opacity: 0.6 },
  itemText: { flex: 1, color: colors.text, fontSize: 16, fontWeight: '700' }, itemTextDone: { color: colors.green },
  split: { color: colors.text, fontSize: 15, fontWeight: '800', fontVariant: ['tabular-nums'] },
  rpeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  rpe: { width: 40, height: 40, borderRadius: 11, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceRaised },
  rpeOn: { borderColor: HYBRID_COLOR, backgroundColor: colors.amberSoft }, rpeText: { color: colors.secondary, fontSize: 15, fontWeight: '800' }, rpeTextOn: { color: HYBRID_COLOR },
  error: { color: colors.red, fontSize: 12 },
});
