import { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { PROGRAM_TEMPLATES } from '@athlete/domain';
import { ActionButton } from '@/components/ActionButton';
import { AppInput } from '@/components/AppInput';
import { Card } from '@/components/Card';
import { Eyebrow, Title } from '@/components/Typography';
import { Screen } from '@/components/Screen';
import { useTrainingRepository } from '@/data/MobileTrainingContext';
import { EMPTY_ANSWERS, GOALS, goalLabel, parseBody, recommendProgram, sportsFor, type Access, type OnboardingAnswers } from '@/onboarding/recommend';
import { HYBRID_COLOR } from '@/program/HybridCard';
import { setOnboardingDone } from '@/settings/devicePrefs';
import { colors } from '@/theme/colors';

const STEPS = 5;
const LEVELS = [{ value: 'beginner', label: 'Principiante', detail: 'Menos de 1 año entrenando' }, { value: 'intermediate', label: 'Intermedio', detail: '1 a 3 años' }, { value: 'advanced', label: 'Avanzado', detail: 'Más de 3 años' }] as const;
const ACCESS: ReadonlyArray<{ value: Access; label: string; icon: string }> = [{ value: 'gym', label: 'Gym completo', icon: 'barbell-outline' }, { value: 'pool', label: 'Alberca', icon: 'water-outline' }, { value: 'run', label: 'Pista o calle para correr', icon: 'walk-outline' }];

function Option({ label, detail, icon, selected, onPress }: { label: string; detail?: string; icon?: string; selected: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ selected }} accessibilityLabel={label} onPress={onPress} style={[s.option, selected && s.optionOn]}>
    {icon ? <Ionicons name={icon as never} size={22} color={selected ? HYBRID_COLOR : colors.secondary}/> : null}
    <View style={s.flex}><Text style={[s.optionLabel, selected && s.optionLabelOn]}>{label}</Text>{detail ? <Text style={s.optionDetail}>{detail}</Text> : null}</View>
    {selected ? <Ionicons name="checkmark-circle" size={20} color={HYBRID_COLOR}/> : null}
  </Pressable>;
}

/**
 * Asistente de bienvenida (5 pasos, todo se puede saltar): nombre, meta, punto de partida, datos del cuerpo y la
 * recomendación de programa. Lo que contesta queda en el Perfil, desde donde se puede repetir.
 */
export default function OnboardingScreen() {
  const router = useRouter();
  const repository = useTrainingRepository();
  const [step, setStep] = useState(0);
  const [a, setA] = useState<OnboardingAnswers>(EMPTY_ANSWERS);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof OnboardingAnswers>(k: K, v: OnboardingAnswers[K]) => { setA((x) => ({ ...x, [k]: v })); setError(''); };
  useEffect(() => { repository?.getAthleteProfile().then((p) => { if (p.displayName) setA((x) => ({ ...x, name: x.name || p.displayName })); }).catch(() => undefined); }, [repository]);

  const rec = recommendProgram(a);
  const template = rec.slug ? PROGRAM_TEMPLATES.find((t) => t.slug === rec.slug) ?? null : null;

  async function skip() { await setOnboardingDone(); router.back(); }

  /** Guarda el perfil y sigue con lo que eligió. */
  async function finish(next: 'program' | 'routines' | 'home' | 'train') {
    if (!repository) return;
    const body = parseBody(a);
    if (!body.ok) { setError(body.error); setStep(3); return; }
    setBusy(true); setError('');
    try {
      await repository.saveOnboarding({ displayName: a.name, goal: a.goal ? goalLabel(a.goal) : null, level: a.level, sports: sportsFor(a), heightCm: body.heightCm, weightKg: body.weightKg, trainingDays: a.days });
      await setOnboardingDone();
      let target: string | null = null;
      if (next === 'program' && template) target = `/program/${await repository.adoptProgramTemplate(template.slug)}`;
      if (next === 'routines') target = '/routines/new';
      if (next === 'train') target = '/train';
      router.back();
      if (target) router.push(target as never);
      if (a.estimateNutrition && body.heightCm && body.weightKg) {
        router.push({ pathname: '/nutrition/estimate', params: { height: String(body.heightCm), weight: String(body.weightKg), goal: a.goal === 'health' ? 'lose' : a.goal === 'strength' ? 'gain' : 'maintain' } });
      }
    } catch (cause) {
      setError(cause instanceof Error && cause.message === 'CATALOG_OUTDATED' ? 'A tu teléfono le faltan ejercicios del catálogo. Conéctate a internet y vuelve a intentar.' : 'No pudimos guardar. Intenta de nuevo.');
    } finally { setBusy(false); }
  }

  const canNext = step === 1 ? a.goal !== null : step === 2 ? a.level !== null && a.days !== null : true;
  return <Screen>
    <View style={s.top}>
      <View style={s.dots}>{Array.from({ length: STEPS }, (_, i) => <View key={i} style={[s.dot, i <= step && s.dotOn]}/>)}</View>
      <Pressable accessibilityRole="button" onPress={() => void skip()} hitSlop={10}><Text style={s.skip}>Saltar</Text></Pressable>
    </View>

    {step === 0 ? <>
      <View><Eyebrow>BIENVENIDO A ATHLETE</Eyebrow><Title>Armemos tu entrenamiento</Title></View>
      <Text style={s.lead}>5 preguntas rápidas para recomendarte un programa. Todo lo puedes cambiar después en tu Perfil.</Text>
      <AppInput label="¿Cómo te llamas?" defaultValue={a.name} onChangeText={(t) => set('name', t)} placeholder="Tu nombre" maxLength={60} autoCapitalize="words"/>
    </> : null}

    {step === 1 ? <>
      <View><Eyebrow>PASO 2 DE 5</Eyebrow><Title>¿Cuál es tu meta principal?</Title></View>
      {GOALS.map((g) => <Option key={g.value} label={g.label} detail={g.detail} icon={g.icon} selected={a.goal === g.value} onPress={() => set('goal', g.value)}/>)}
    </> : null}

    {step === 2 ? <>
      <View><Eyebrow>PASO 3 DE 5</Eyebrow><Title>Tu punto de partida</Title></View>
      <Text style={s.label}>NIVEL</Text>
      {LEVELS.map((l) => <Option key={l.value} label={l.label} detail={l.detail} selected={a.level === l.value} onPress={() => set('level', l.value)}/>)}
      <Text style={s.label}>¿CUÁNTOS DÍAS POR SEMANA PUEDES ENTRENAR?</Text>
      <View style={s.row}>{([3, 4, 5, 6] as const).map((d) => <Pressable key={d} accessibilityRole="button" accessibilityLabel={`${d} días`} accessibilityState={{ selected: a.days === d }} onPress={() => set('days', d)} style={[s.day, a.days === d && s.dayOn]}><Text style={[s.dayText, a.days === d && s.dayTextOn]}>{d}</Text></Pressable>)}</View>
      <Text style={s.label}>¿QUÉ TIENES A LA MANO?</Text>
      {ACCESS.map((x) => <Option key={x.value} label={x.label} icon={x.icon} selected={a.access.includes(x.value)}
        onPress={() => set('access', a.access.includes(x.value) ? a.access.filter((y) => y !== x.value) : [...a.access, x.value])}/>)}
    </> : null}

    {step === 3 ? <>
      <View><Eyebrow>PASO 4 DE 5 · OPCIONAL</Eyebrow><Title>Tus datos</Title></View>
      <Text style={s.lead}>Sirven para calcular una meta provisional de calorías y proteína. Puedes dejarlos vacíos.</Text>
      <View style={s.row}>
        <View style={s.flex}><AppInput label="Estatura (cm)" defaultValue={a.heightCm} onChangeText={(t) => set('heightCm', t)} keyboardType="decimal-pad" placeholder="175"/></View>
        <View style={s.flex}><AppInput label="Peso (kg)" defaultValue={a.weightKg} onChangeText={(t) => set('weightKg', t)} keyboardType="decimal-pad" placeholder="78"/></View>
      </View>
      <View style={s.switchRow}><Text style={s.switchText}>Calcular mi meta de comida al terminar</Text><Switch value={a.estimateNutrition} onValueChange={(v) => set('estimateNutrition', v)}/></View>
    </> : null}

    {step === 4 ? <>
      <View><Eyebrow>PASO 5 DE 5</Eyebrow><Title>Tu recomendación</Title></View>
      {template ? <Card accent={HYBRID_COLOR}>
        <Eyebrow>PROGRAMA SUGERIDO</Eyebrow>
        <Text style={s.program}>{template.name}</Text>
        <Text style={s.lead}>{template.summary}</Text>
        <Text style={s.reason}>{rec.reason}</Text>
        <ActionButton loading={busy} onPress={() => void finish('program')}>Empezar este programa</ActionButton>
        <ActionButton secondary onPress={() => void finish('train')}>Ver otros programas</ActionButton>
      </Card> : <Card accent={colors.blue}>
        <Eyebrow>FUERZA</Eyebrow>
        <Text style={s.program}>Tus propias rutinas</Text>
        <Text style={s.reason}>{rec.reason}</Text>
        <ActionButton loading={busy} onPress={() => void finish('routines')}>Crear mi primera rutina</ActionButton>
        <ActionButton secondary onPress={() => void finish('train')}>Ver programas híbridos</ActionButton>
      </Card>}
      <Pressable accessibilityRole="button" onPress={() => void finish('home')}><Text style={s.link}>Solo quiero registrar mis entrenamientos</Text></Pressable>
    </> : null}

    {error ? <Text accessibilityRole="alert" style={s.error}>{error}</Text> : null}
    {step < 4 ? <View style={s.nav}>
      {step > 0 ? <View style={s.flex}><ActionButton secondary onPress={() => setStep(step - 1)}>Atrás</ActionButton></View> : null}
      <View style={s.flex}><ActionButton disabled={!canNext} onPress={() => {
        if (step === 3) { const b = parseBody(a); if (!b.ok) { setError(b.error); return; } }
        setStep(step + 1);
      }}>{step === 3 && !a.heightCm && !a.weightKg ? 'Omitir' : 'Siguiente'}</ActionButton></View>
    </View> : <ActionButton secondary onPress={() => setStep(3)}>Atrás</ActionButton>}
  </Screen>;
}

const s = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  dots: { flexDirection: 'row', gap: 6 }, dot: { width: 22, height: 6, borderRadius: 3, backgroundColor: colors.graphite }, dotOn: { backgroundColor: HYBRID_COLOR },
  skip: { color: colors.secondary, fontSize: 14, fontWeight: '700' },
  lead: { color: colors.secondary, fontSize: 14, lineHeight: 21 },
  label: { color: colors.secondary, fontSize: 11, fontWeight: '800', letterSpacing: 0.6, marginTop: 4 },
  option: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: colors.border, borderRadius: 16, padding: 14, backgroundColor: colors.surface },
  optionOn: { borderColor: HYBRID_COLOR, backgroundColor: '#2A2410' },
  optionLabel: { color: colors.text, fontSize: 15, fontWeight: '800' }, optionLabelOn: { color: HYBRID_COLOR }, optionDetail: { color: colors.secondary, fontSize: 12 },
  flex: { flex: 1 }, row: { flexDirection: 'row', gap: 9 },
  day: { flex: 1, height: 52, borderRadius: 14, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  dayOn: { borderColor: HYBRID_COLOR, backgroundColor: '#2A2410' }, dayText: { color: colors.secondary, fontSize: 20, fontWeight: '800' }, dayTextOn: { color: HYBRID_COLOR },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, switchText: { color: colors.text, fontSize: 14, flex: 1 },
  program: { color: colors.text, fontSize: 22, fontWeight: '800' }, reason: { color: colors.text, fontSize: 13, lineHeight: 19 },
  link: { color: '#9DBDFF', fontSize: 14, fontWeight: '700', textAlign: 'center', paddingVertical: 10 },
  error: { color: colors.red, fontSize: 12 }, nav: { flexDirection: 'row', gap: 10 },
});
