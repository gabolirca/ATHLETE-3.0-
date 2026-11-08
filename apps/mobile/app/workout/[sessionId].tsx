import { useCallback, useRef, useState } from 'react';
import { DEFAULT_REST_SECONDS, RestTimerBar, RestTimerFullScreen, useRestTimer } from '@/components/RestTimer';
import { useStrictRest } from '@/settings/devicePrefs';
import { exerciseProgress, isLoggedWorkingSet, nextStepLabel, workoutGuide, type ExerciseProgress, type ExerciseStatus } from '@/workout/guide';
import { NewRecordBadge } from '@/progress/records';
import { AppInput } from '@/components/AppInput';
import { isPastWorkout } from '@/data/OfficialTrainingRepository';
import { dayLabel, localDateOfDevice } from '@/lib/localDate';
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
  const [duration, setDuration] = useState('60');
  const timer = useRestTimer();
  const timerStarted = useRef(new Set<string>());
  const [toggled, setToggled] = useState<Set<string>>(new Set());
  const [strictRest] = useStrictRest();

  const refresh = useCallback(async (showLoading = true) => {
    if (!repository) return;
    if (showLoading) setLoading(true);
    try { setDetail(await repository.getWorkout(sessionId)); setLoadError(false); }
    catch { setLoadError(true); }
    finally { if (showLoading) setLoading(false); }
  }, [repository, sessionId]);
  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));

  async function finish() {
    if (!repository || !detail) return;
    let durationMinutes: number | undefined;
    if (isPastWorkout(detail.workout.startedAt)) {
      const n = Number(duration.trim());
      if (!/^\d{1,3}$/.test(duration.trim()) || n < 1 || n > 600) { setFinishError('Indica cuántos minutos duró (entre 1 y 600).'); return; }
      durationMinutes = n;
    }
    setFinishing(true); setFinishError('');
    try { await repository.finishWorkout(sessionId, durationMinutes ? { durationMinutes } : {}); router.replace('/history'); }
    catch (error) { setFinishError(error instanceof Error && error.message === 'WORKOUT_REQUIRES_RECORDED_SET' ? 'Registra al menos una serie con peso o repeticiones antes de finalizar.' : 'No pudimos finalizar la sesión. La información sigue guardada localmente.'); }
    finally { setFinishing(false); }
  }

  if (loading) return <Screen><ActivityIndicator color={colors.blue}/><Text style={s.detail}>Cargando sesión guardada…</Text></Screen>;
  if (loadError) return <Screen><Title>Sesión</Title><EmptyState icon="alert-circle-outline" title="No pudimos cargar la sesión" detail="La base local no se modificó. Intenta volver a abrirla." action="Reintentar" onAction={() => void refresh()}/></Screen>;
  if (!detail) return <Screen><Title>Sesión</Title><EmptyState title="Sesión no disponible" detail="Puede que se haya eliminado de este dispositivo." action="Ir a Entrenar" onAction={() => router.replace('/train')}/></Screen>;

  const past = isPastWorkout(detail.workout.startedAt);
  const guide = workoutGuide(detail.exercises);
  return <View style={s.root}><Screen>
    <View><Eyebrow>{past
      ? `${dayLabel(localDateOfDevice(new Date(detail.workout.startedAt)), localDateOfDevice(new Date()))} · ${new Date(detail.workout.startedAt).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}`.toUpperCase()
      : `INICIADA ${new Date(detail.workout.startedAt).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}`}</Eyebrow><Title>{past ? 'Entrenamiento pasado' : 'Entrenamiento'}</Title></View>
    <LocalSaveBadge status={detail.workout.syncStatus}/>
    {detail.exercises.length === 0 ? <EmptyState icon="barbell-outline" title="Agrega tu primer ejercicio" detail="Elige un ejercicio del catálogo local y registra tus series." action={showPicker ? undefined : 'Buscar ejercicios'} onAction={() => setShowPicker(true)}/> : null}
    {guide.guided && detail.workout.state === 'active' ? <Card accent={guide.allComplete ? colors.green : colors.blue}>
      <Text style={s.guideTitle}>{guide.allComplete ? '¡Rutina completa! Finaliza y guarda' : `Ejercicio ${(guide.currentIndex ?? 0) + 1} de ${detail.exercises.length}`}</Text>
      <View style={s.track}><View style={[s.fill, { width: `${guide.setsTarget ? Math.round((guide.setsDone / guide.setsTarget) * 100) : 0}%` }, guide.allComplete && s.fillDone]}/></View>
      <Text style={s.detail}>{guide.setsDone} de {guide.setsTarget} series</Text>
    </Card> : null}
    {detail.exercises.map((exercise, exIndex) => {
      const status = guide.statuses[exIndex] ?? 'free';
      const progress = exerciseProgress(exercise);
      // Abierto: el actual, los libres o los que el usuario abrió. Plegados: los terminados y los que vienen.
      const open = toggled.has(exercise.id) ? status === 'done' || status === 'upcoming' : status === 'current' || status === 'free';
      const loggedSets = exercise.sets.filter(isLoggedWorkingSet);
      return <View key={exercise.id} style={s.exerciseBlock}>
      <Pressable accessibilityRole="button" accessibilityLabel={`${exercise.exerciseName}, ${statusLabel(status, progress)}`} accessibilityState={{ expanded: open }}
        onPress={() => setToggled((cur) => { const next = new Set(cur); if (next.has(exercise.id)) next.delete(exercise.id); else next.add(exercise.id); return next; })}>
      <Card accent={status === 'current' ? colors.blue : status === 'done' ? colors.green : colors.graphite}><Row><View style={{flex:1}}>
        <View style={s.statusRow}>
          {status === 'current' ? <Text style={s.now}>AHORA</Text> : null}
          {status === 'done' ? <Text style={s.doneTag}>✓ COMPLETADO</Text> : null}
          {status === 'upcoming' ? <Text style={s.upcoming}>DESPUÉS</Text> : null}
          <Eyebrow>{exercise.setsTarget ? `${exercise.setsTarget} × ${exercise.repsTarget ?? '—'} REPS` : 'EJERCICIO'}</Eyebrow>
        </View>
        <Text style={s.exerciseName}>{exercise.exerciseName}</Text>
        <Text style={s.detail}>{progress.target !== null ? (progress.complete ? `${progress.done} de ${progress.target} series hechas` : `Serie ${progress.done + 1} de ${progress.target}`) : `${progress.done} ${progress.done === 1 ? 'serie' : 'series'}`}{exercise.restSeconds ? ` · descanso ${exercise.restSeconds} s` : ''}</Text>
        {!open && loggedSets.length ? <Text style={s.summary}>{loggedSets.map((x) => `${x.weightKg ?? '—'}×${x.reps}`).join(' · ')}</Text> : null}
      </View>
      {open ? <Pressable accessibilityRole="button" accessibilityLabel={`Agregar serie a ${exercise.exerciseName}`} onPress={async () => { try { await repository?.addSet(sessionId, exercise.id); setActionError(''); await refresh(false); } catch { setActionError('No se pudo agregar la serie. Intenta de nuevo.'); } }} style={s.addSet}><Ionicons name="add" size={18} color={colors.blue}/><Text style={s.addSetText}>Serie</Text></Pressable>
        : <Ionicons name="chevron-down" size={18} color={colors.secondary}/>}
      </Row></Card></Pressable>
      {open ? <>
      {exercise.previous ? <Text style={s.previous}>
        La vez pasada · {dayLabel(exercise.previous.localDate, localDateOfDevice(new Date()))}: {exercise.previous.sets.map((p) => `${p.weightKg ?? '—'}×${p.reps ?? '—'}`).join(' · ')}
      </Text> : null}
      <NewRecordBadge records={exercise.newRecords ?? []}/>
      {exercise.sets.filter((set) => !(progress.complete && set.reps === null && set.weightKg === null && !toggled.has(exercise.id))).map((set, index) => {
        const prev = exercise.previous?.sets[index] ?? null;
        return <SetEditor key={set.id} set={set} targetRir={exercise.targetRir ?? null} previous={prev ? { weightKg: prev.weightKg, reps: prev.reps } : null} onSave={async (values) => {
          await repository?.saveSet(sessionId, set.id, values);
          const updated = repository ? await repository.getWorkout(sessionId) : null;
          if (updated) setDetail(updated);
          // El descanso arranca una sola vez por serie: cuando una serie de trabajo ya tiene repeticiones.
          if (!values.isWarmup && values.reps !== null && !timerStarted.current.has(set.id)) {
            timerStarted.current.add(set.id);
            const label = updated ? nextStepLabel(updated.exercises, exIndex) : `Siguiente: ${exercise.exerciseName}`;
            const finishedAll = updated ? workoutGuide(updated.exercises).allComplete : false;
            if (!finishedAll) timer.start(exercise.restSeconds ?? DEFAULT_REST_SECONDS, label);
          }
        }} />;
      })}
      </> : null}
    </View>;
    })}
    {detail.exercises.length ? <ActionButton secondary onPress={() => setShowPicker((value) => !value)}>{showPicker ? 'Cerrar catálogo' : '＋ Agregar ejercicio'}</ActionButton> : null}
    {showPicker ? <ExercisePicker onSelect={async (exercise) => { try { await repository?.addExercise(sessionId, exercise.id); setActionError(''); setShowPicker(false); await refresh(false); } catch { setActionError('No se pudo agregar el ejercicio. Intenta de nuevo.'); } }} /> : null}
    {actionError ? <Text accessibilityRole="alert" style={s.error}>{actionError}</Text> : null}
    {past && detail.workout.state === 'active' ? <AppInput label="¿Cuánto duró? (minutos)" defaultValue={duration} onChangeText={setDuration} keyboardType="number-pad" maxLength={3}/> : null}
    {finishError ? <Text accessibilityRole="alert" style={s.error}>{finishError}</Text> : null}
    <ActionButton onPress={finish} loading={finishing} disabled={detail.workout.state !== 'active'}>Finalizar y guardar sesión</ActionButton>
    {timer.active ? <View style={{ height: 84 }}/> : null}
  </Screen>{strictRest ? <RestTimerFullScreen timer={timer}/> : <RestTimerBar timer={timer}/>}</View>;
}

function statusLabel(status: ExerciseStatus, p: ExerciseProgress): string {
  if (status === 'done') return 'completado';
  if (status === 'current') return p.target ? `ahora, serie ${p.done + 1} de ${p.target}` : 'ahora';
  if (status === 'upcoming') return 'después';
  return `${p.done} series`;
}

const s=StyleSheet.create({root:{flex:1},guideTitle:{color:colors.text,fontSize:16,fontWeight:'800'},track:{height:8,borderRadius:4,backgroundColor:colors.surfaceRaised,overflow:'hidden'},fill:{height:8,borderRadius:4,backgroundColor:colors.blue},fillDone:{backgroundColor:colors.green},statusRow:{flexDirection:'row',alignItems:'center',gap:8,flexWrap:'wrap'},now:{color:'white',backgroundColor:colors.blue,fontSize:10,fontWeight:'800',paddingHorizontal:6,paddingVertical:2,borderRadius:6,overflow:'hidden'},doneTag:{color:colors.green,fontSize:10,fontWeight:'800'},upcoming:{color:colors.muted,fontSize:10,fontWeight:'800'},summary:{color:colors.secondary,fontSize:12,marginTop:4},previous:{color:'#9DBDFF',fontSize:12,lineHeight:17,paddingHorizontal:4},exerciseBlock:{gap:9},exerciseName:{color:colors.text,fontSize:18,fontWeight:'800',marginTop:5},detail:{color:colors.secondary,fontSize:11,lineHeight:16},addSet:{flexDirection:'row',alignItems:'center',gap:3,padding:7},addSetText:{color:colors.blue,fontSize:11,fontWeight:'800'},error:{color:colors.red,fontSize:12,lineHeight:18}});
