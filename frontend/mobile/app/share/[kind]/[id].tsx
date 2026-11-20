import { useCallback, useRef, useState } from 'react';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View, type ImageSourcePropType } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import * as ImagePicker from 'expo-image-picker';
import { ActionButton } from '@/components/ActionButton';
import { Chip } from '@/components/Chip';
import { EmptyState } from '@/components/EmptyState';
import { Eyebrow, Title } from '@/components/Typography';
import { Screen } from '@/components/Screen';
import { useTrainingRepository } from '@/data/MobileTrainingContext';
import { BRAND } from '@/brand/assets';
import { CardioCard, PhotoCard, SessionCard, StickerCard, WeekCard, WodCard, CARD_H, CARD_W, type CardRef } from '@/share/cards';
import { cardioCard, cardioOverlay, featuredBlock, sessionCard, sessionOverlay, weekCard, wodCard, type CardioCardData, type OverlayData, type SessionCardData, type WeekCardData, type WodCardData } from '@/share/shareData';
import { effectiveDistance, weekStartOf } from '@athlete/domain';
import { localDateOfDevice } from '@/lib/localDate';
import { colors, themed } from '@/theme/colors';

type Variant =
  | { key: 'photo'; label: string; data: OverlayData }
  | { key: 'sticker'; label: string; data: OverlayData }
  | { key: 'session'; label: string; data: SessionCardData }
  | { key: 'cardio'; label: string; data: CardioCardData }
  | { key: 'wod'; label: string; data: WodCardData }
  | { key: 'week'; label: string; data: WeekCardData };

/**
 * Compartir (historia 9:16), estilo Strava: "Con tu foto" (tu foto o la portada de ATHLETE con los datos encima),
 * "Sticker" (fondo transparente para pegarlo en Instagram) y "Resumen" (la tarjeta oscura).
 */
export default function ShareScreen() {
  const { kind, id } = useLocalSearchParams<{ kind: string; id: string }>();
  const router = useRouter();
  const repository = useTrainingRepository();
  const ref = useRef<CardRef>(null);
  const [variants, setVariants] = useState<Variant[] | null>(null);
  const [selected, setSelected] = useState(0);
  const [photo, setPhoto] = useState<ImageSourcePropType | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const place = 'ATHLETE';
  const handle: string | null = null;

  useFocusEffect(useCallback(() => {
    let active = true;
    (async () => {
      if (!repository) return;
      const out: Variant[] = [];
      if (kind === 'session') {
        const detail = await repository.getWorkout(id);
        if (detail) {
          const catalog = new Map((await repository.searchExercises('', { modality: 'all' })).map((e) => [e.id, e]));
          const data = sessionCard(detail, catalog);
          out.push({ key: 'photo', label: 'Con tu foto', data: sessionOverlay(data) }, { key: 'sticker', label: 'Sticker', data: sessionOverlay(data) });
          const block = featuredBlock(detail);
          if (block) out.push({ key: 'wod', label: 'Resultado del WOD', data: wodCard(detail, block, await repository.previousBlockResult(id, block.id).catch(() => null)) });
          out.push({ key: 'session', label: 'Resumen', data });
        }
      } else if (kind === 'cardio') {
        const [entry, prefs] = await Promise.all([repository.getCardio(id), repository.getPreferences().catch(() => null)]);
        if (entry) {
          const data = cardioCard(entry, prefs?.unitSystem ?? 'metric');
          out.push({ key: 'photo', label: 'Con tu foto', data: cardioOverlay(data) }, { key: 'sticker', label: 'Sticker', data: cardioOverlay(data) }, { key: 'cardio', label: 'Resumen', data });
        }
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

  async function pick(source: 'camera' | 'library') {
    setError('');
    try {
      const perm = source === 'camera' ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) { setError(source === 'camera' ? 'Activa el permiso de cámara en Ajustes.' : 'Activa el permiso de fotos en Ajustes.'); return; }
      const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], allowsEditing: true, aspect: [9, 16], quality: 0.9, exif: false };
      const r = source === 'camera' ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
      if (!r.canceled && r.assets?.[0]) setPhoto({ uri: r.assets[0].uri });
    } catch { setError('No se pudo abrir la foto. Intenta de nuevo.'); }
  }

  async function share(sticker: boolean) {
    if (!ref.current) return;
    setBusy(true); setError('');
    try {
      const uri = await captureRef(ref as never, sticker ? { format: 'png', quality: 1, width: 1080, result: 'tmpfile' } : { format: 'png', quality: 1, width: 1080, height: 1920, result: 'tmpfile' });
      if (!(await Sharing.isAvailableAsync())) { setError('Compartir no está disponible en este dispositivo.'); return; }
      await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: 'Compartir entrenamiento', UTI: 'public.png' });
    } catch { setError('No se pudo crear la imagen. Intenta de nuevo.'); }
    finally { setBusy(false); }
  }

  if (variants === null) return <Screen><Title>Compartir</Title></Screen>;
  if (!variants.length) return <Screen><Title>Compartir</Title><EmptyState title="Nada que compartir" detail="No encontramos este entrenamiento." action="Volver" onAction={() => router.back()}/></Screen>;
  const v = variants[Math.min(selected, variants.length - 1)]!;
  const shownPhoto = photo ?? BRAND.cover;
  return <Screen>
    <View><Eyebrow>HISTORIA DE INSTAGRAM · 9:16</Eyebrow><Title>Compartir</Title></View>
    <View style={s.chips}>{variants.map((x, i) => <Chip key={x.key} label={x.label} selected={i === selected} onPress={() => setSelected(i)}/>)}</View>
    <View style={s.preview}>
      {v.key === 'photo' ? <PhotoCard ref={ref} data={v.data} photo={shownPhoto} place={place}/>
        : v.key === 'sticker' ? <View style={s.stickerStage}><StickerCard ref={ref} data={v.data} place={place}/></View>
        : v.key === 'session' ? <SessionCard ref={ref} data={v.data}/>
        : v.key === 'wod' ? <WodCard ref={ref} data={v.data}/>
        : v.key === 'week' ? <WeekCard ref={ref} data={v.data}/> : <CardioCard ref={ref} data={v.data}/>}
    </View>
    {v.key === 'photo' ? <View style={s.pickRow}>
      <PickButton icon="camera" label="Tomar foto" onPress={() => void pick('camera')}/>
      <PickButton icon="images" label="Elegir foto" onPress={() => void pick('library')}/>
      {photo ? <PickButton icon="refresh" label="Portada ATHLETE" onPress={() => setPhoto(null)}/> : null}
    </View> : null}
    {error ? <Text accessibilityRole="alert" style={s.error}>{error}</Text> : null}
    <ActionButton loading={busy} onPress={() => void share(v.key === 'sticker')}>{v.key === 'sticker' ? 'Compartir sticker' : 'Compartir imagen'}</ActionButton>
    <Text style={s.note}>{v.key === 'sticker'
      ? 'PNG con fondo transparente. Guárdalo y en tu historia de Instagram agrégalo con el sticker de foto, encima de cualquier imagen.'
      : `Se crea una imagen de 1080 × 1920. Elige Instagram, WhatsApp o guárdala en tus fotos.${handle ? ` Etiqueta a @${handle} 💪` : ''}`}</Text>
  </Screen>;
}

function PickButton({ icon, label, onPress }: { icon: 'camera' | 'images' | 'refresh'; label: string; onPress: () => void }) {
  return <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [s.pick, pressed && { opacity: 0.7 }]}>
    <Ionicons name={icon} size={16} color={colors.text}/><Text style={s.pickText}>{label}</Text>
  </Pressable>;
}

const s = themed(() => StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  preview: { alignItems: 'center', minHeight: CARD_H, width: '100%' },
  stickerStage: { width: CARD_W, minHeight: CARD_H, borderRadius: 18, backgroundColor: '#5B6470', justifyContent: 'center' },
  pickRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' },
  pick: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 999, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, paddingHorizontal: 14, paddingVertical: 9 },
  pickText: { color: colors.text, fontSize: 13, fontWeight: '700' },
  error: { color: colors.red, fontSize: 12 }, note: { color: colors.secondary, fontSize: 11, lineHeight: 16, textAlign: 'center' },
}));
