import { useCallback, useState } from 'react';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { ActionButton } from '@/components/ActionButton';
import { Card } from '@/components/Card';
import { EmptyState } from '@/components/EmptyState';
import { ExercisePicker } from '@/components/ExercisePicker';
import { SetEditor } from '@/components/SetEditor';
import { Eyebrow, Label, Title } from '@/components/Typography';
import { Screen, Row } from '@/components/Screen';
import { LocalSaveBadge } from '@/components/SyncBadge';
import { useTrainingRepository } from '@/data/MobileTrainingContext';
import type { WorkoutDetail } from '@/data/trainingTypes';
import { colors } from '@/theme/colors';

export default function WorkoutScreen() {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  const router = useRouter();
  const repository = useTrainingRepository();
  const [detail, setDetail] = useState<WorkoutDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [finishError, setFinishError] = useState('');
  const [actionError, setActionError] = useState('');
  const [finishing, setFinishing] = useState(false);

  const refresh = useCallback(async (showLoading = true) => {
    if (!repository) return;
    if (showLoading) setLoading(true);
    try { setDetail(await repository.getWorkout(sessionId)); setLoadError(false); }
    catch { setLoadError(true); }
    finally { if (showLoading) setLoading(false); }
  }, [repository, sessionId]);
  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));

  async function finish() {
    if (!repository) return;
    setFinishing(true); setFinishError('');
    try { await repository.finishWorkout(sessionId); router.replace('/history'); }
    catch (error) { setFinishError(error instanceof Error && error.message === 'WORKOUT_REQUIRES_RECORDED_SET' ? 'Registra al menos una serie con peso o repeticiones antes de finalizar.' : 'No pudimos finalizar la sesión. La información sigue guardada localmente.'); }
    finally { setFinishing(false); }
  }

  if (loading) return <Screen><ActivityIndicator color={colors.blue}/><Text style={s.detail}>Cargando sesión guardada…</Text></Screen>;
  if (loadError) return <Screen><Title>Sesión</Title><EmptyState icon="alert-circle-outline" title="No pudimos cargar la sesión" detail="La base local no se modificó. Intenta volver a abrirla." action="Reintentar" onAction={() => void refresh()}/></Screen>;
  if (!detail) return <Screen><Title>Sesión</Title><EmptyState title="Sesión no disponible" detail="Puede que se haya eliminado de este dispositivo." action="Ir a Entrenar" onAction={() => router.replace('/train')}/></Screen>;

  return <Screen>
    <View><Eyebrow>INICIADA {new Date(detail.workout.startedAt).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}</Eyebrow><Title>Entrenamiento</Title></View>
    <LocalSaveBadge status={detail.workout.syncStatus}/>
    {detail.exercises.length === 0 ? <EmptyState icon="barbell-outline" title="Agrega tu primer ejercicio" detail="Elige un ejercicio del catálogo local y registra tus series." action={showPicker ? undefined : 'Buscar ejercicios'} onAction={() => setShowPicker(true)}/> : null}
    {detail.exercises.map((exercise) => <View key={exercise.id} style={s.exerciseBlock}>
      <Card accent={colors.graphite}><Row><View style={{flex:1}}><Eyebrow>{exercise.setsTarget ? `${exercise.setsTarget} SERIES · OBJETIVO ${exercise.repsTarget} REPS` : 'EJERCICIO'}</Eyebrow><Text style={s.exerciseName}>{exercise.exerciseName}</Text></View><Pressable accessibilityRole="button" accessibilityLabel={`Agregar serie a ${exercise.exerciseName}`} onPress={async () => { try { await repository?.addSet(sessionId, exercise.id); setActionError(''); await refresh(false); } catch { setActionError('No se pudo agregar la serie. Intenta de nuevo.'); } }} style={s.addSet}><Ionicons name="add" size={18} color={colors.blue}/><Text style={s.addSetText}>Serie</Text></Pressable></Row>{exercise.restSeconds ? <Text style={s.detail}>Descanso objetivo: {exercise.restSeconds} s</Text> : null}</Card>
      {exercise.sets.map((set) => <SetEditor key={set.id} set={set} targetRir={exercise.targetRir ?? null} onSave={async (values) => { await repository?.saveSet(sessionId, set.id, values); await refresh(false); }} />)}
    </View>)}
    {detail.exercises.length ? <ActionButton secondary onPress={() => setShowPicker((value) => !value)}>{showPicker ? 'Cerrar catálogo' : '＋ Agregar ejercicio'}</ActionButton> : null}
    {showPicker ? <ExercisePicker onSelect={async (exercise) => { try { await repository?.addExercise(sessionId, exercise.id); setActionError(''); setShowPicker(false); await refresh(false); } catch { setActionError('No se pudo agregar el ejercicio. Intenta de nuevo.'); } }} /> : null}
    {actionError ? <Text accessibilityRole="alert" style={s.error}>{actionError}</Text> : null}
    {finishError ? <Text accessibilityRole="alert" style={s.error}>{finishError}</Text> : null}
    <ActionButton onPress={finish} loading={finishing} disabled={detail.workout.state !== 'active'}>Finalizar y guardar sesión</ActionButton>
  </Screen>;
}

const s=StyleSheet.create({exerciseBlock:{gap:9},exerciseName:{color:colors.text,fontSize:18,fontWeight:'800',marginTop:5},detail:{color:colors.secondary,fontSize:11,lineHeight:16},addSet:{flexDirection:'row',alignItems:'center',gap:3,padding:7},addSetText:{color:colors.blue,fontSize:11,fontWeight:'800'},error:{color:colors.red,fontSize:12,lineHeight:18}});
