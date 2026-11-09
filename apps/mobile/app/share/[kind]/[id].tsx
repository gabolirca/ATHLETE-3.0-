import { useCallback, useRef, useState } from 'react';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import { ActionButton } from '@/components/ActionButton';
import { Chip } from '@/components/Chip';
import { EmptyState } from '@/components/EmptyState';
import { Eyebrow, Title } from '@/components/Typography';
import { Screen } from '@/components/Screen';
import { useTrainingRepository } from '@/data/MobileTrainingContext';
import { localDateOfDevice } from '@/lib/localDate';
import { weekStartOf, effectiveDistance } from '@athlete/domain';
import { CardioCard, SessionCard, WeekCard, WodCard, CARD_H, type CardRef } from '@/share/cards';
import { cardioCard, featuredBlock, sessionCard, weekCard, wodCard, type CardioCardData, type SessionCardData, type WeekCardData, type WodCardData } from '@/share/shareData';
import { colors } from '@/theme/colors';

type Variant = { key: 'wod'; label: string; data: WodCardData } | { key: 'session'; label: string; data: SessionCardData } | { key: 'cardio'; label: string; data: CardioCardData } | { key: 'week'; label: string; data: WeekCardData };

/**
 * Tarjeta para compartir (historia 9:16). `kind`: session (entrenamiento), cardio (actividad) o week (semana del programa).
 * La app elige la mejor: WOD si hubo AMRAP/por tiempo, resumen si fue fuerza; se puede cambiar entre las disponibles.
 */
export default function ShareScreen() {
  const { kind, id } = useLocalSearchParams<{ kind: string; id: string }>();
  const router = useRouter();
  const repository = useTrainingRepository();
  const ref = useRef<CardRef>(null);
  const [variants, setVariants] = useState<Variant[] | null>(null);
  const [selected, setSelected] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useFocusEffect(useCallback(() => {
    let active = true;
    (async () => {
      if (!repository) return;
      const out: Variant[] = [];
      if (kind === 'session') {
        const detail = await repository.getWorkout(id);
        if (detail) {
          const catalog = new Map((await repository.searchExercises('', { modality: 'all' })).map((e) => [e.id, e]));
          const block = featuredBlock(detail);
          if (block) out.push({ key: 'wod', label: 'Resultado del WOD', data: wodCard(detail, block, await repository.previousBlockResult(id, block.id).catch(() => null)) });
          out.push({ key: 'session', label: 'Resumen de la sesión', data: sessionCard(detail, catalog) });
        }
      } else if (kind === 'cardio') {
        const [entry, prefs] = await Promise.all([repository.getCardio(id), repository.getPreferences().catch(() => null)]);
        if (entry) out.push({ key: 'cardio', label: 'Actividad', data: cardioCard(entry, prefs?.unitSystem ?? 'metric') });
      }
      if (kind === 'week' || kind === 'session' || kind === 'cardio') {
        const programs = await repository.listPrograms().catch(() => []);
        const program = kind === 'week' ? programs.find((p) => p.id === id) : programs[0];
        if (program) {
          const from = weekStartOf(localDateOfDevice(new Date()));
          const [status, cardio, volume, load] = await Promise.all([
            repository.programWeekStatus(program.id), repository.listCardio(), repository.getWeeklyMuscleVolume().catch(() => null), repository.getWeeklyLoad(1).catch(() => null),
          ]);
          const week = cardio.filter((c) => c.localDate >= from);
          const meters = (a: string) => week.filter((c) => c.activity === a).reduce((n, c) => n + (effectiveDistance({ activity: c.activity, distanceMeters: c.distanceMeters, swim: c.swim }) ?? 0), 0);
          out.push({ key: 'week', label: 'Mi semana híbrida', data: weekCard(program, status, { swimMeters: Math.round(meters('swim')), runMeters: Math.round(meters('run')), strengthSets: volume?.totalSets ?? 0, load: load?.weeks.at(-1)?.total ?? 0 }) });
        }
      }
      if (active) { setVariants(out); setSelected(0); }
    })().catch(() => { if (active) setVariants([]); });
    return () => { active = false; };
  }, [repository, kind, id]));

  async function share() {
    if (!ref.current) return;
    setBusy(true); setError('');
    try {
      const uri = await captureRef(ref as never, { format: 'png', quality: 1, width: 1080, height: 1920, result: 'tmpfile' });
      if (!(await Sharing.isAvailableAsync())) { setError('Compartir no está disponible en este dispositivo.'); return; }
      await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: 'Compartir entrenamiento', UTI: 'public.png' });
    } catch { setError('No se pudo crear la imagen. Intenta de nuevo.'); }
    finally { setBusy(false); }
  }

  if (variants === null) return <Screen><Title>Compartir</Title></Screen>;
  if (!variants.length) return <Screen><Title>Compartir</Title><EmptyState title="Nada que compartir" detail="No encontramos este entrenamiento." action="Volver" onAction={() => router.back()}/></Screen>;
  const v = variants[Math.min(selected, variants.length - 1)]!;
  return <Screen>
    <View><Eyebrow>HISTORIA DE INSTAGRAM · 9:16</Eyebrow><Title>Compartir</Title></View>
    {variants.length > 1 ? <View style={s.chips}>{variants.map((x, i) => <Chip key={x.key} label={x.label} selected={i === selected} onPress={() => setSelected(i)}/>)}</View> : null}
    <View style={s.preview}>
      {v.key === 'wod' ? <WodCard ref={ref} data={v.data}/> : v.key === 'session' ? <SessionCard ref={ref} data={v.data}/> : v.key === 'cardio' ? <CardioCard ref={ref} data={v.data}/> : <WeekCard ref={ref} data={v.data}/>}
    </View>
    {error ? <Text accessibilityRole="alert" style={s.error}>{error}</Text> : null}
    <ActionButton loading={busy} onPress={() => void share()}>Compartir imagen</ActionButton>
    <Text style={s.note}>Se crea una imagen de 1080 × 1920 con tu tarjeta. Elige Instagram, WhatsApp o guárdala en tus fotos.</Text>
  </Screen>;
}

const s = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  preview: { alignItems: 'center', minHeight: CARD_H, width: '100%' },
  error: { color: colors.red, fontSize: 12 }, note: { color: colors.secondary, fontSize: 11, lineHeight: 16, textAlign: 'center' },
});
