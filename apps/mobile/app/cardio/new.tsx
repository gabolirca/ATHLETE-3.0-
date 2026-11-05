import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { ActionButton } from '@/components/ActionButton';
import { AppInput } from '@/components/AppInput';
import { Card } from '@/components/Card';
import { Eyebrow, Title } from '@/components/Typography';
import { Screen } from '@/components/Screen';
import { ACTIVITIES, EMPTY_FORM, STROKES, describeCardio, fieldsFor, parseCardioForm, type CardioFormErrors, type CardioFormValues, type UnitSystem } from '@/cardio/cardioForm';
import { useTrainingRepository } from '@/data/MobileTrainingContext';
import { colors } from '@/theme/colors';

function Chip({ label, selected, onPress, icon }: { label: string; selected: boolean; onPress: () => void; icon?: string }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ selected }} accessibilityLabel={label} onPress={onPress} style={[s.chip, selected && s.chipOn]}>
    {icon ? <Ionicons name={icon as never} size={15} color={selected ? 'white' : colors.secondary}/> : null}
    <Text style={[s.chipText, selected && s.chipTextOn]}>{label}</Text>
  </Pressable>;
}

export default function NewCardioScreen() {
  const router = useRouter();
  const repository = useTrainingRepository();
  const [values, setValues] = useState<CardioFormValues>(EMPTY_FORM);
  const [errors, setErrors] = useState<CardioFormErrors>({});
  const [unitSystem, setUnitSystem] = useState<UnitSystem>('metric');
  const [saving, setSaving] = useState(false);

  useEffect(() => { repository?.getPreferences().then((p) => setUnitSystem(p.unitSystem)).catch(() => undefined); }, [repository]);

  const set = <K extends keyof CardioFormValues>(key: K, value: CardioFormValues[K]) => setValues((v) => ({ ...v, [key]: value }));
  const fields = fieldsFor(values.activity);
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

  // Vista previa en vivo: solo si lo escrito ya es válido; nunca muestra un ritmo inventado.
  const preview = useMemo(() => {
    const parsed = parseCardioForm(values, { now: new Date(), unitSystem, timeZone });
    return parsed.ok ? describeCardio(parsed.draft, unitSystem) : null;
  }, [values, unitSystem, timeZone]);

  async function save() {
    if (!repository || saving) return;
    const parsed = parseCardioForm(values, { now: new Date(), unitSystem, timeZone });
    if (!parsed.ok) { setErrors(parsed.errors); return; }
    setErrors({});
    setSaving(true);
    try {
      const id = await repository.logCardio(parsed.draft);
      router.replace(`/cardio/${id}`);
    } catch (cause) {
      setErrors({ form: cause instanceof Error ? cause.message : 'No se pudo guardar la actividad.' });
    } finally {
      setSaving(false);
    }
  }

  const distanceLabel = values.activity === 'swim' ? 'Distancia (m, opcional)' : `Distancia (${unitSystem === 'imperial' ? 'mi' : 'km'}, opcional)`;

  return <Screen>
    <View><Eyebrow>CARDIO Y RESISTENCIA</Eyebrow><Title>Registrar actividad</Title></View>

    <Card>
      <Eyebrow>ACTIVIDAD</Eyebrow>
      <View style={s.chips}>{ACTIVITIES.map((a) => <Chip key={a.key} label={a.label} icon={a.icon} selected={values.activity === a.key} onPress={() => set('activity', a.key)}/>)}</View>
    </Card>

    <Card>
      <Eyebrow>CUÁNDO</Eyebrow>
      <View style={s.chips}>
        <Chip label="Hoy" selected={values.day === 'today'} onPress={() => set('day', 'today')}/>
        <Chip label="Ayer" selected={values.day === 'yesterday'} onPress={() => set('day', 'yesterday')}/>
      </View>
      <AppInput label={values.day === 'today' ? 'Hora de inicio (HH:MM, vacío = terminé ahora)' : 'Hora de inicio (HH:MM)'} value={values.startTime} onChangeText={(t) => set('startTime', t)} placeholder="07:30" keyboardType="numbers-and-punctuation" error={errors.startTime}/>
    </Card>

    <Card>
      <Eyebrow>DURACIÓN</Eyebrow>
      <View style={s.row3}>
        <View style={s.flex}><AppInput label="Horas" value={values.hours} onChangeText={(t) => set('hours', t)} keyboardType="number-pad" placeholder="0"/></View>
        <View style={s.flex}><AppInput label="Minutos" value={values.minutes} onChangeText={(t) => set('minutes', t)} keyboardType="number-pad" placeholder="30"/></View>
        <View style={s.flex}><AppInput label="Segundos" value={values.seconds} onChangeText={(t) => set('seconds', t)} keyboardType="number-pad" placeholder="0"/></View>
      </View>
      {errors.minutes ? <Text accessibilityRole="alert" style={s.error}>{errors.minutes}</Text> : null}
      {fields.distance ? <AppInput label={distanceLabel} value={values.distance} onChangeText={(t) => set('distance', t)} keyboardType="decimal-pad" placeholder={values.activity === 'swim' ? '1500' : '5.0'} error={errors.distance}/> : null}
      {fields.rounds ? <AppInput label="Rondas (opcional)" value={values.rounds} onChangeText={(t) => set('rounds', t)} keyboardType="number-pad" error={errors.rounds}/> : null}
    </Card>

    {fields.swim ? <Card>
      <Eyebrow>NATACIÓN</Eyebrow>
      <View style={s.switchRow}><Text style={s.text}>Aguas abiertas</Text><Switch value={values.openWater} onValueChange={(v) => set('openWater', v)}/></View>
      {!values.openWater ? <View style={s.row3}>
        <View style={s.flex}><AppInput label="Largo de alberca (m)" value={values.poolLength} onChangeText={(t) => set('poolLength', t)} keyboardType="decimal-pad" error={errors.poolLength}/></View>
        <View style={s.flex}><AppInput label="Largos" value={values.laps} onChangeText={(t) => set('laps', t)} keyboardType="number-pad" error={errors.laps}/></View>
      </View> : null}
      <View style={s.chips}>{STROKES.map((st) => <Chip key={st.key} label={st.label} selected={values.stroke === st.key} onPress={() => set('stroke', values.stroke === st.key ? null : st.key)}/>)}</View>
    </Card> : null}

    <Card>
      <Eyebrow>ESFUERZO PERCIBIDO (RPE, OPCIONAL)</Eyebrow>
      <Text style={s.hint}>1 = muy fácil · 10 = esfuerzo máximo</Text>
      <View style={s.chips}>{[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => <Chip key={n} label={String(n)} selected={values.rpe === n} onPress={() => set('rpe', values.rpe === n ? null : n)}/>)}</View>
      <View style={s.row3}>
        <View style={s.flex}><AppInput label="FC media (opcional)" value={values.avgHeartRate} onChangeText={(t) => set('avgHeartRate', t)} keyboardType="number-pad" error={errors.avgHeartRate}/></View>
        <View style={s.flex}><AppInput label="FC máxima (opcional)" value={values.maxHeartRate} onChangeText={(t) => set('maxHeartRate', t)} keyboardType="number-pad" error={errors.maxHeartRate}/></View>
      </View>
      <AppInput label="Notas (opcional)" value={values.notes} onChangeText={(t) => set('notes', t)} multiline error={errors.notes}/>
    </Card>

    {preview ? <Card accent={colors.blue}>
      <Eyebrow>RESUMEN</Eyebrow>
      <Text style={s.preview}>{preview.label} · {preview.duration}{preview.distance ? ` · ${preview.distance}` : ''}</Text>
      {preview.pace ? <Text style={s.hint}>Ritmo: {preview.pace}</Text> : null}
    </Card> : null}

    {errors.form ? <Text accessibilityRole="alert" style={s.error}>{errors.form}</Text> : null}
    <ActionButton onPress={() => void save()} loading={saving} disabled={!repository}>Guardar actividad</ActionButton>
  </Screen>;
}

const s = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 11, backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border },
  chipOn: { backgroundColor: colors.blue, borderColor: colors.blue },
  chipText: { color: colors.secondary, fontSize: 12, fontWeight: '700' },
  chipTextOn: { color: 'white' },
  row3: { flexDirection: 'row', gap: 10 },
  flex: { flex: 1 },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  text: { color: colors.text, fontSize: 13, fontWeight: '600' },
  hint: { color: colors.secondary, fontSize: 11, lineHeight: 16 },
  preview: { color: colors.text, fontSize: 17, fontWeight: '800', marginTop: 4 },
  error: { color: colors.red, fontSize: 11 },
});
