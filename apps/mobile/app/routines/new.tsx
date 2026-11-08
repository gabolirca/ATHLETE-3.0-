import { useState } from 'react';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ActionButton } from '@/components/ActionButton';
import { AppInput } from '@/components/AppInput';
import { Card } from '@/components/Card';
import { Chip } from '@/components/Chip';
import { ExercisePicker } from '@/components/ExercisePicker';
import { Eyebrow, Label, Title } from '@/components/Typography';
import { Screen } from '@/components/Screen';
import { useLocalDataReady, useTrainingRepository } from '@/data/MobileTrainingContext';
import { RoutineInputSchema } from '@/data/trainingSchemas';
import type { Exercise } from '@/data/trainingTypes';
import { colors } from '@/theme/colors';
import { RoutineDiagnosisCard } from '@/routines/diagnosis';

type PlannedExercise = Exercise & { sets: string; reps: string; restSeconds: string; version: number };

/** Atajos de series × repeticiones y descanso: armar una rutina con toques, no tecleando. */
export const SET_PRESETS: ReadonlyArray<{ label: string; sets: string; reps: string }> = [
  { label: '3×8', sets: '3', reps: '8' }, { label: '4×6', sets: '4', reps: '6' }, { label: '5×5', sets: '5', reps: '5' },
  { label: '3×10', sets: '3', reps: '10' }, { label: '3×12', sets: '3', reps: '12' }, { label: '3×15', sets: '3', reps: '15' },
];
export const REST_PRESETS = ['60', '90', '120', '180'];

/** Descanso sugerido al agregar: más largo en compuestos pesados. */
const defaultRest = (e: Exercise) => (e.mechanics === 'compound' ? '120' : '90');

export default function NewRoutineScreen() {
  const router = useRouter();
  const repository = useTrainingRepository();
  const { ready, error: dataError } = useLocalDataReady();
  const [name, setName] = useState('');
  const [selected, setSelected] = useState<PlannedExercise[]>([]);
  const [showPicker, setShowPicker] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [timesPerWeek, setTimesPerWeek] = useState(1);

  function toggleExercise(exercise: Exercise) {
    setSelected((current) => current.some((item) => item.id === exercise.id)
      ? current.filter((item) => item.id !== exercise.id)
      : [...current, { ...exercise, sets: '3', reps: '8', restSeconds: defaultRest(exercise), version: 0 }]);
    setError('');
  }
  function update(id: string, patch: Partial<Pick<PlannedExercise, 'sets' | 'reps' | 'restSeconds'>>, fromPreset = false) {
    for (const v of Object.values(patch)) if (v !== undefined && !/^\d*$/.test(v)) return;
    setSelected((current) => current.map((item) => item.id === id ? { ...item, ...patch, version: fromPreset ? item.version + 1 : item.version } : item));
  }
  function move(id: string, delta: -1 | 1) {
    setSelected((current) => {
      const i = current.findIndex((item) => item.id === id);
      const j = i + delta;
      if (i < 0 || j < 0 || j >= current.length) return current;
      const next = [...current];
      [next[i], next[j]] = [next[j]!, next[i]!];
      return next;
    });
  }
  async function save() {
    if (!repository) return;
    const parsed = RoutineInputSchema.safeParse({ name, exercises: selected.map((item) => ({ exerciseId: item.id, sets: Number(item.sets), reps: Number(item.reps), restSeconds: Number(item.restSeconds) })) });
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? 'Revisa los datos de la rutina.'); return; }
    setSaving(true); setError('');
    try {
      await repository.createRoutine(parsed.data);
      router.replace('/train');
    } catch (cause) {
      setError(cause instanceof Error && cause.message.startsWith('EXERCISE') ? 'Uno de los ejercicios ya no está disponible.' : 'No pudimos guardar la rutina en este dispositivo. Intenta de nuevo.');
    } finally { setSaving(false); }
  }

  if (dataError) return <Screen><Title>Nueva rutina</Title><Text style={s.error}>No se pudo preparar el almacenamiento local.</Text></Screen>;
  const num = { keyboardType: 'number-pad' as const, autoCorrect: false, spellCheck: false };
  return <Screen>
    <View><Eyebrow>FUNCIONA SIN CONEXIÓN</Eyebrow><Title>Nueva rutina</Title></View>
    <Card><AppInput label="Nombre de la rutina" defaultValue="" onChangeText={(value) => { setName(value); setError(''); }} placeholder="Ej. Torso A" maxLength={60} autoCapitalize="sentences" /></Card>

    {selected.length > 0 ? <View style={s.selected}>
      <Eyebrow>TUS EJERCICIOS ({selected.length})</Eyebrow>
      {selected.map((item, index) => <Card key={item.id}>
        <View style={s.titleRow}>
          <Text style={s.order}>{index + 1}</Text>
          <View style={s.flex}><Label>{item.name}</Label></View>
          <Pressable accessibilityRole="button" accessibilityLabel={`Subir ${item.name}`} disabled={index === 0} onPress={() => move(item.id, -1)} style={index === 0 ? s.off : undefined}><Ionicons name="chevron-up" size={20} color={colors.secondary}/></Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={`Bajar ${item.name}`} disabled={index === selected.length - 1} onPress={() => move(item.id, 1)} style={index === selected.length - 1 ? s.off : undefined}><Ionicons name="chevron-down" size={20} color={colors.secondary}/></Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={`Quitar ${item.name}`} onPress={() => toggleExercise(item)}><Ionicons name="close-circle-outline" size={21} color={colors.secondary}/></Pressable>
        </View>
        <View style={s.chips}>{SET_PRESETS.map((p) => <Chip key={p.label} label={p.label} selected={item.sets === p.sets && item.reps === p.reps} onPress={() => update(item.id, { sets: p.sets, reps: p.reps }, true)}/>)}</View>
        <View style={s.chips}>{REST_PRESETS.map((r) => <Chip key={r} label={`${r} s`} icon="timer-outline" selected={item.restSeconds === r} onPress={() => update(item.id, { restSeconds: r }, true)}/>)}</View>
        <View style={s.configRow}>
          <View style={s.flex}><AppInput key={`s-${item.version}`} label="Series" defaultValue={item.sets} onChangeText={(value) => update(item.id, { sets: value })} maxLength={2} {...num}/></View>
          <View style={s.flex}><AppInput key={`r-${item.version}`} label="Reps" defaultValue={item.reps} onChangeText={(value) => update(item.id, { reps: value })} maxLength={3} {...num}/></View>
          <View style={s.flex}><AppInput key={`d-${item.version}`} label="Descanso (s)" defaultValue={item.restSeconds} onChangeText={(value) => update(item.id, { restSeconds: value })} maxLength={3} {...num}/></View>
        </View>
      </Card>)}
    </View> : null}

    {selected.length > 0 ? <RoutineDiagnosisCard items={selected.map((item) => ({ exercise: item, sets: Number(item.sets) || 0 }))} timesPerWeek={timesPerWeek} onTimesChange={setTimesPerWeek}/> : null}
    {error ? <Text accessibilityRole="alert" style={s.error}>{error}</Text> : null}
    {selected.length > 0 ? <ActionButton onPress={save} loading={saving} disabled={!ready}>Guardar rutina</ActionButton> : null}

    <Pressable accessibilityRole="button" onPress={() => setShowPicker((v) => !v)} style={s.pickerHead}>
      <Eyebrow>{selected.length ? 'AGREGAR MÁS EJERCICIOS' : 'ELIGE EJERCICIOS'}</Eyebrow>
      <Ionicons name={showPicker ? 'chevron-up' : 'chevron-down'} size={18} color={colors.secondary}/>
    </Pressable>
    {showPicker ? <ExercisePicker selectedIds={selected.map((item) => item.id)} multi onSelect={toggleExercise} /> : null}
  </Screen>;
}

const s = StyleSheet.create({
  selected: { gap: 10 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  order: { color: colors.blue, fontSize: 15, fontWeight: '800', width: 18 },
  flex: { flex: 1 },
  off: { opacity: 0.3 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  configRow: { flexDirection: 'row', gap: 9 },
  pickerHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4 },
  error: { color: colors.red, fontSize: 12, lineHeight: 18 },
});
