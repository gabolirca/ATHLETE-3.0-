import { useCallback, useRef, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { IconTile, TILE } from '@/components/IconTile';
import { useAvatar } from '@/profile/avatar';
import { useOptionalAccount } from '@/account/AccountProvider';
import { Image, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import Constants from 'expo-constants';
import { AccountCard } from '@/account/AccountCard';
import { AppInput } from '@/components/AppInput';
import { Title } from '@/components/Typography';
import { Screen } from '@/components/Screen';
import { useTrainingRepository } from '@/data/MobileTrainingContext';
import { LocalAthletePreferencesSchema } from '@/data/trainingSchemas';
import type { LocalAthletePreferences } from '@/data/trainingTypes';
import { NutritionSettingsCard } from '@/nutrition/NutritionSettingsCard';
import { useStrictRest } from '@/settings/devicePrefs';
import { colors, setThemeMode, themeMode, themed, type ThemeMode } from '@/theme/colors';
import { displayBold } from '@/theme/fonts';

const LEVEL: Record<string, string> = { beginner: 'Principiante', intermediate: 'Intermedio', advanced: 'Avanzado' };
type Athlete = Awaited<ReturnType<NonNullable<ReturnType<typeof useTrainingRepository>>['getAthleteProfile']>>;

/** Opciones de dos o tres valores, como un interruptor de iOS: se ve cuál está elegida y se cambia con un toque. */
function Segmented<T extends string>({ label, value, options, onChange, icons }: { label: string; value: T; options: ReadonlyArray<[T, string]>; onChange: (v: T) => void; icons?: Partial<Record<T, string>> }) {
  return <View style={s.segment} accessibilityLabel={label}>
    {options.map(([v, title]) => <Pressable key={v} accessibilityRole="button" accessibilityLabel={`${label}: ${title}`} accessibilityState={{ selected: value === v }}
      onPress={() => { if (v !== value) onChange(v); }} style={[s.segmentItem, value === v && s.segmentOn]}>
      {icons?.[v] ? <MaterialCommunityIcons name={icons[v] as never} size={18} color={value === v ? 'white' : colors.secondary}/> : null}
      <Text style={[s.segmentText, value === v && s.segmentTextOn]}>{title}</Text>
    </Pressable>)}
  </View>;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <View style={s.section}><Text style={s.heading}>{title}</Text><View style={s.card}>{children}</View></View>;
}

/**
 * Ajustes, solo lo que se usa: tu perfil, cómo entrenas (descanso, unidades), apariencia, nutrición y tu cuenta.
 * Todo se guarda al momento (sin botón "Guardar"). Lo de pruebas (borrar el teléfono) ya no está aquí.
 */
export default function SettingsScreen() {
  const router = useRouter();
  const repository = useTrainingRepository();
  const [athlete, setAthlete] = useState<Athlete | null>(null);
  const [prefs, setPrefs] = useState<LocalAthletePreferences | null>(null);
  const [strictRest, setStrictRest] = useStrictRest();
  const [theme, setTheme] = useState<ThemeMode>(themeMode);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const nameDraft = useRef('');
  const avatar = useAvatar();
  const account = useOptionalAccount();
  const signedIn = account?.auth?.status === 'signed_in' ? account.auth : null;

  useFocusEffect(useCallback(() => {
    repository?.getPreferences().then((p) => { setPrefs(p); nameDraft.current = p.displayName; }).catch(() => setStatus({ ok: false, text: 'No pudimos leer tus ajustes.' }));
    repository?.getAthleteProfile().then(setAthlete).catch(() => setAthlete(null));
  }, [repository]));

  async function save(patch: Partial<LocalAthletePreferences>) {
    if (!repository || !prefs) return;
    const next = { ...prefs, ...patch };
    const parsed = LocalAthletePreferencesSchema.safeParse(next);
    if (!parsed.success) { setStatus({ ok: false, text: parsed.error.issues[0]?.message ?? 'Revisa el dato.' }); return; }
    setPrefs(next);
    try { await repository.savePreferences(parsed.data); setStatus({ ok: true, text: 'Guardado' }); }
    catch { setStatus({ ok: false, text: 'No se pudo guardar. Intenta de nuevo.' }); }
  }

  const summary = [athlete?.goals[0], athlete?.experienceLevel ? LEVEL[athlete.experienceLevel] : null, athlete?.heightCm ? `${athlete.heightCm} cm` : null].filter(Boolean).join(' · ');
  const version = Constants.expoConfig?.version ?? '';

  return <Screen>
    <Pressable accessibilityRole="button" accessibilityLabel="Regresar" hitSlop={12} onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}><Text style={s.back}>‹ Regresar</Text></Pressable>
    <Title>Ajustes</Title>

    <Pressable accessibilityRole="button" accessibilityLabel="Ver mi perfil" onPress={() => router.push('/profile')} style={s.me}>
      <View style={s.meAvatar}>{avatar ? <Image source={{ uri: avatar }} style={s.meImg}/> : <MaterialCommunityIcons name="account" size={30} color={colors.secondary}/>}</View>
      <View style={s.flex}>
        <Text style={s.meName} numberOfLines={1}>{prefs?.displayName || 'Tu nombre'}</Text>
        <Text style={s.rowDetail} numberOfLines={1}>{signedIn?.user.email ?? 'Sin cuenta: tus datos viven en este teléfono'}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.secondary}/>
    </Pressable>

    <Section title="TU PERFIL">
      {prefs ? <AppInput label="Tu nombre" defaultValue={prefs.displayName} onChangeText={(v) => { nameDraft.current = v; }}
        onBlur={() => { if (nameDraft.current.trim() !== prefs.displayName) void save({ displayName: nameDraft.current.trim() }); }}
        autoCorrect={false} placeholder="¿Cómo te llamamos?" maxLength={60} returnKeyType="done"/> : null}
      <Pressable accessibilityRole="button" onPress={() => router.push('/onboarding')} style={s.row}>
        <IconTile icon="flag-checkered" color={TILE.red}/>
        <View style={s.flex}><Text style={s.rowTitle}>Mi meta</Text><Text style={s.rowDetail}>{summary || 'Contesta 4 preguntas para empezar'}</Text></View>
        <Ionicons name="chevron-forward" size={18} color={colors.secondary}/>
      </Pressable>
    </Section>

    <Section title="ENTRENAMIENTO">
      <View style={s.row}>
        <IconTile icon="timer-sand" color={TILE.purple}/>
        <View style={s.flex}><Text style={s.rowTitle}>Descanso obligatorio</Text><Text style={s.rowDetail}>El descanso ocupa la pantalla y no se salta (emergencia: mantén 3 s).</Text></View>
        <Switch accessibilityLabel="Descanso obligatorio" value={strictRest} onValueChange={setStrictRest} trackColor={{ true: colors.blue, false: colors.graphite }}/>
      </View>
      <View style={s.rowCol}><View style={s.titleRow}><IconTile icon="weight-kilogram" color={TILE.blue}/><Text style={s.rowTitle}>Unidades</Text></View>
        {prefs ? <Segmented label="Unidades" value={prefs.unitSystem} options={[['metric', 'Kilos y km'], ['imperial', 'Libras y millas']]} onChange={(v) => void save({ unitSystem: v })}/> : null}
      </View>
    </Section>

    <Section title="APARIENCIA">
      <Segmented label="Tema" value={theme} options={[['dark', 'Oscuro'], ['light', 'Claro']]} icons={{ dark: 'weather-night', light: 'white-balance-sunny' }} onChange={(mode) => {
        setTheme(mode);
        void setThemeMode(mode).catch(() => setStatus({ ok: false, text: 'No se pudo guardar el tema; se aplicó solo por ahora.' }));
      }}/>
    </Section>

    <NutritionSettingsCard/>
    <AccountCard/>

    {status ? <Text accessibilityRole={status.ok ? undefined : 'alert'} style={[s.status, { color: status.ok ? colors.green : colors.red }]}>{status.ok ? '✓ ' : ''}{status.text}</Text> : null}

    <View style={s.footer}>
      <Image source={require('../assets/brand/by-lirca.png')} resizeMode="contain" style={s.lirca} accessibilityLabel="Hecho por LIRCA"/>
      <Text style={s.version}>ATHLETE {version}</Text>
    </View>
  </Screen>;
}

const s = themed(() => StyleSheet.create({
  back: { color: colors.accentText, fontSize: 15, fontWeight: '700' },
  flex: { flex: 1, gap: 2 },
  section: { gap: 8 },
  heading: { color: colors.secondary, fontSize: 13, fontWeight: '700', letterSpacing: 1 },
  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 18, paddingHorizontal: 16, paddingVertical: 8, gap: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingVertical: 6 },
  rowCol: { gap: 10, paddingVertical: 8 },
  rowTitle: { color: colors.text, fontSize: 18, lineHeight: 21, ...displayBold },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  me: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14, borderRadius: 20, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  meAvatar: { width: 62, height: 62, borderRadius: 31, borderWidth: 2, borderColor: colors.blue, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceRaised },
  meImg: { width: 58, height: 58, borderRadius: 29 },
  meName: { color: colors.text, fontSize: 24, lineHeight: 26, ...displayBold },
  mePlan: { color: colors.amber, fontSize: 11, fontWeight: '800', letterSpacing: 0.8, marginTop: 2 },
  rowDetail: { color: colors.secondary, fontSize: 12, lineHeight: 17 },
  segment: { flexDirection: 'row', gap: 4, padding: 4, borderRadius: 14, backgroundColor: colors.surfaceRaised, marginVertical: 6 },
  segmentItem: { flex: 1, minHeight: 44, borderRadius: 11, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6 },
  segmentOn: { backgroundColor: colors.blue },
  segmentText: { color: colors.secondary, fontSize: 14, fontWeight: '700' }, segmentTextOn: { color: 'white' },
  status: { fontSize: 13, fontWeight: '700', textAlign: 'center' },
  footer: { alignItems: 'center', gap: 6, paddingVertical: 10 },
  lirca: { height: 18, width: 90 }, version: { color: colors.muted, fontSize: 11 },
}));
