import { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { ActionButton } from '@/components/ActionButton';
import { AppInput } from '@/components/AppInput';
import { Card } from '@/components/Card';
import { ExercisePicker } from '@/components/ExercisePicker';
import { Eyebrow, Label, Title } from '@/components/Typography';
import { Screen } from '@/components/Screen';
import { useLocalDataReady, useTrainingRepository } from '@/data/MobileTrainingContext';
import { RoutineInputSchema } from '@/data/trainingSchemas';
import type { Exercise } from '@/data/trainingTypes';
import { colors } from '@/theme/colors';

type PlannedExercise = Exercise & { sets: string; reps: string; restSeconds: string };
export default function NewRoutineScreen() {
  const router = useRouter();
  const repository = useTrainingRepository();
  const { ready, error: dataError } = useLocalDataReady();
  const [name, setName] = useState('');
  const [selected, setSelected] = useState<PlannedExercise[]>([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  function toggleExercise(exercise: Exercise) {
    setSelected((current) => current.some((item) => item.id === exercise.id)
      ? current.filter((item) => item.id !== exercise.id)
      : [...current, { ...exercise, sets: '3', reps: '8', restSeconds: '90' }]);
  }
  function updateExercise(id: string, key: 'sets' | 'reps' | 'restSeconds', value: string) {
    if (!/^\d*$/.test(value)) return;
    setSelected((current) => current.map((item) => item.id === id ? { ...item, [key]: value } : item));
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
  return <Screen>
    <View><Eyebrow>SE GUARDARÁ EN ESTE DISPOSITIVO</Eyebrow><Title>Nueva rutina</Title></View>
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Card><AppInput label="Nombre de la rutina" value={name} onChangeText={(value) => { setName(value); setError(''); }} placeholder="Ej. Torso A" maxLength={60} autoCapitalize="sentences" />
        <Text style={s.note}>Se guarda localmente y puede usarse sin conexión.</Text></Card>
    </KeyboardAvoidingView>
    <View><Eyebrow>ELIGE EJERCICIOS</Eyebrow><Text style={s.note}>Catálogo local inicial de muestra.</Text></View>
    <ExercisePicker selectedIds={selected.map((item) => item.id)} multi onSelect={toggleExercise} />
    {selected.length > 0 ? <View style={s.selected}><Eyebrow>CONFIGURA SERIES</Eyebrow>{selected.map((item) => <Card key={item.id}>
      <View style={s.titleRow}><Label>{item.name}</Label><Pressable accessibilityRole="button" accessibilityLabel={`Quitar ${item.name}`} onPress={() => toggleExercise(item)}><Ionicons name="close-circle-outline" size={21} color={colors.secondary}/></Pressable></View>
      <View style={s.configRow}><AppInput label="Series" value={item.sets} onChangeText={(value) => updateExercise(item.id, 'sets', value)} keyboardType="number-pad" maxLength={2}/><AppInput label="Reps objetivo" value={item.reps} onChangeText={(value) => updateExercise(item.id, 'reps', value)} keyboardType="number-pad" maxLength={3}/><AppInput label="Descanso (s)" value={item.restSeconds} onChangeText={(value) => updateExercise(item.id, 'restSeconds', value)} keyboardType="number-pad" maxLength={3}/></View>
    </Card>)}</View> : null}
    {error ? <Text accessibilityRole="alert" style={s.error}>{error}</Text> : null}
    <ActionButton onPress={save} loading={saving} disabled={!ready}>Guardar rutina</ActionButton>
  </Screen>;
}

const s=StyleSheet.create({note:{color:colors.secondary,fontSize:11,lineHeight:16,marginTop:5},selected:{gap:10},titleRow:{flexDirection:'row',alignItems:'center',justifyContent:'space-between'},configRow:{flexDirection:'row',gap:9},error:{color:colors.red,fontSize:12,lineHeight:18}});
