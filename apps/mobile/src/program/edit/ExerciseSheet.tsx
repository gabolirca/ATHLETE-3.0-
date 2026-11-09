import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { ActionButton } from '@/components/ActionButton';
import { AppInput } from '@/components/AppInput';
import { useTrainingRepository } from '@/data/MobileTrainingContext';
import type { Exercise, ProgramBlock, ProgramExercise, ProgramExercisePatch } from '@/data/trainingTypes';
import { colors } from '@/theme/colors';
import { clock, parseMinSec } from '@/workout/blocks';
import { Choices, Sheet, sheetStyles as st } from './Sheet';

const SET_PRESETS = [
  { value: '3x5', label: '3×5' }, { value: '5x5', label: '5×5' }, { value: '3x8', label: '3×8' }, { value: '4x6', label: '4×6' },
  { value: '3x10', label: '3×10' }, { value: '3x12', label: '3×12' }, { value: '3x15', label: '3×15' },
] as const;
const REST = [{ value: 60, label: '60 s' }, { value: 90, label: '90 s' }, { value: 120, label: '2 min' }, { value: 180, label: '3 min' }];

/** Ejercicios del catálogo parecidos a uno: primero el mismo patrón de movimiento, luego el mismo músculo principal. */
export function similarExercises(current: Exercise | undefined, all: readonly Exercise[], limit = 8): Exercise[] {
  if (!current) return [];
  const others = all.filter((e) => e.id !== current.id && (e.modality ?? 'strength') === (current.modality ?? 'strength'));
  const primary = new Set(current.muscleRoles?.primary.map((m) => m.slug) ?? []);
  const score = (e: Exercise) => (e.movementPattern && e.movementPattern === current.movementPattern ? 2 : 0) + ((e.muscleRoles?.primary ?? []).some((m) => primary.has(m.slug)) ? 1 : 0);
  return others.map((e) => [e, score(e)] as const).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1] || a[0].name.localeCompare(b[0].name, 'es')).slice(0, limit).map(([e]) => e);
}

/** Validación de lo planeado para un ejercicio (fuerza o tiempo/distancia). */
export function parseExerciseForm(timed: boolean, v: { sets: string; repsMin: string; repsMax: string; time: string; meters: string; rest: number | null; perSide: boolean }):
  { ok: true; patch: ProgramExercisePatch } | { ok: false; error: string } {
  const int = (x: string) => (x.trim() === '' ? null : Number(x.trim()));
  const sets = int(v.sets);
  if (sets !== null && (!Number.isInteger(sets) || sets < 1 || sets > 50)) return { ok: false, error: 'Las series van de 1 a 50.' };
  if (timed) {
    const seconds = parseMinSec(v.time);
    const meters = v.meters.trim() === '' ? null : Number(v.meters.replace(',', '.'));
    if (Number.isNaN(seconds) || (meters !== null && !(meters > 0))) return { ok: false, error: 'Tiempo como min:seg y distancia mayor que cero.' };
    return { ok: true, patch: { sets, durationSeconds: seconds, distanceMeters: meters, repsMin: null, repsMax: null, restSeconds: v.rest, perSide: v.perSide } };
  }
  const min = int(v.repsMin), max = int(v.repsMax) ?? min;
  if (min !== null && (!Number.isInteger(min) || min < 1)) return { ok: false, error: 'Las repeticiones deben ser un número entero.' };
  if (min !== null && max !== null && max < min) return { ok: false, error: 'El máximo de reps no puede ser menor que el mínimo.' };
  return { ok: true, patch: { sets, repsMin: min, repsMax: max, restSeconds: v.rest, perSide: v.perSide } };
}

/** Editar un ejercicio del programa: lo planeado, cambiarlo por otro o quitarlo. */
export function ExerciseSheet({ visible, exercise, block, onClose, onSave, onRemove }: {
  visible: boolean; exercise: ProgramExercise | null; block: ProgramBlock | null; onClose: () => void;
  onSave: (patch: ProgramExercisePatch) => Promise<void>; onRemove: () => Promise<void>;
}) {
  const repository = useTrainingRepository();
  const [catalog, setCatalog] = useState<Exercise[]>([]);
  const [swap, setSwap] = useState<Exercise | null>(null);
  const [query, setQuery] = useState('');
  const [sets, setSets] = useState(''); const [repsMin, setRepsMin] = useState(''); const [repsMax, setRepsMax] = useState('');
  const [time, setTime] = useState(''); const [meters, setMeters] = useState('');
  const [rest, setRest] = useState<number | null>(null); const [perSide, setPerSide] = useState(false);
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false); const [key, setKey] = useState(0);
  useEffect(() => {
    if (!visible || !exercise) return;
    setSwap(null); setQuery(''); setError('');
    setSets(exercise.sets ? String(exercise.sets) : ''); setRepsMin(exercise.repsMin ? String(exercise.repsMin) : ''); setRepsMax(exercise.repsMax ? String(exercise.repsMax) : '');
    setTime(exercise.durationSeconds ? clock(exercise.durationSeconds) : ''); setMeters(exercise.distanceMeters ? String(exercise.distanceMeters) : '');
    setRest(exercise.restSeconds); setPerSide(exercise.perSide); setKey((k) => k + 1);
    repository?.searchExercises('', { modality: 'all' }).then(setCatalog).catch(() => setCatalog([]));
  }, [visible, exercise, repository]);
  const current = catalog.find((e) => e.id === exercise?.exerciseId);
  const suggestions = useMemo(() => similarExercises(current, catalog), [current, catalog]);
  const results = useMemo(() => {
    const q = query.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    return q.length < 2 ? [] : catalog.filter((e) => e.name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').includes(q)).slice(0, 12);
  }, [query, catalog]);
  if (!exercise) return null;
  const chosen = swap ?? current;
  const timed = (chosen?.modality ?? exercise.modality) === 'cardio' || (chosen?.loadType ?? exercise.loadType) === 'time';
  const whole = block ? ['amrap', 'emom', 'for_time', 'rounds'].includes(block.format) : false;
  const num = { keyboardType: 'number-pad' as const, autoCorrect: false, spellCheck: false };
  const pick = (e: Exercise) => { setSwap(e); setQuery(''); };
  return <Sheet visible={visible} title={chosen?.name ?? exercise.exerciseName} onClose={onClose}>
    {swap ? <Text style={s.swapped}>Se cambiará {exercise.exerciseName} → {swap.name}</Text> : null}
    {!whole ? <>
      {!timed ? <Choices label="Series × reps" options={SET_PRESETS} value={sets && repsMin && repsMin === (repsMax || repsMin) ? `${sets}x${repsMin}` as never : null}
        onChange={(v) => { const [a, b] = String(v).split('x'); setSets(a!); setRepsMin(b!); setRepsMax(b!); setKey((k) => k + 1); }}/> : null}
      <View style={st.row}>
        <View style={st.flex}><AppInput key={`s-${key}`} label="Series" defaultValue={sets} onChangeText={setSets} {...num} maxLength={2} placeholder="—"/></View>
        {timed ? <>
          <View style={st.flex}><AppInput key={`t-${key}`} label="Tiempo (min:seg)" defaultValue={time} onChangeText={setTime} keyboardType="numbers-and-punctuation" autoCorrect={false} placeholder="—"/></View>
          <View style={st.flex}><AppInput key={`m-${key}`} label="Metros" defaultValue={meters} onChangeText={setMeters} keyboardType="decimal-pad" placeholder="—"/></View>
        </> : <>
          <View style={st.flex}><AppInput key={`a-${key}`} label="Reps (mín)" defaultValue={repsMin} onChangeText={setRepsMin} {...num} maxLength={3}/></View>
          <View style={st.flex}><AppInput key={`b-${key}`} label="Reps (máx)" defaultValue={repsMax} onChangeText={setRepsMax} {...num} maxLength={3}/></View>
        </>}
      </View>
      <Text style={st.label}>DESCANSO</Text>
      <Choices label="Descanso" options={REST} value={rest} onChange={(v) => setRest(rest === v ? null : v)}/>
    </> : <View style={st.row}>
      {timed ? <><View style={st.flex}><AppInput key={`t-${key}`} label="Tiempo (min:seg)" defaultValue={time} onChangeText={setTime} keyboardType="numbers-and-punctuation" autoCorrect={false}/></View>
        <View style={st.flex}><AppInput key={`m-${key}`} label="Metros" defaultValue={meters} onChangeText={setMeters} keyboardType="decimal-pad"/></View></>
        : <View style={st.flex}><AppInput key={`a-${key}`} label="Reps por ronda" defaultValue={repsMin} onChangeText={(v) => { setRepsMin(v); setRepsMax(v); }} {...num} maxLength={3}/></View>}
    </View>}
    <View style={s.switchRow}><Text style={s.switchText}>Por lado (cada pierna o brazo)</Text><Switch value={perSide} onValueChange={setPerSide}/></View>
    {error ? <Text accessibilityRole="alert" style={st.error}>{error}</Text> : null}
    <ActionButton loading={busy} onPress={async () => {
      const parsed = parseExerciseForm(timed, { sets: whole ? '' : sets, repsMin, repsMax, time, meters, rest: whole ? null : rest, perSide });
      if (!parsed.ok) { setError(parsed.error); return; }
      setBusy(true);
      try { await onSave({ ...parsed.patch, ...(swap ? { exerciseId: swap.id } : {}) }); onClose(); } catch { setError('No se pudo guardar.'); } finally { setBusy(false); }
    }}>Guardar</ActionButton>
    <Text style={st.label}>CAMBIAR POR OTRO EJERCICIO</Text>
    {suggestions.length ? <View style={s.list}>{suggestions.map((e) => <Pressable key={e.id} accessibilityRole="button" accessibilityLabel={`Cambiar por ${e.name}`} onPress={() => pick(e)} style={[s.item, swap?.id === e.id && s.itemOn]}>
      <Text style={s.itemName}>{e.name}</Text><Text style={s.itemSub}>{e.equipment ?? e.muscleGroup}{e.tier === 'pro' ? ' · PRO' : ''}</Text>
    </Pressable>)}</View> : null}
    <AppInput label="Buscar en el catálogo" defaultValue="" onChangeText={setQuery} placeholder="Ej. remo, prensa, sled" autoCorrect={false}/>
    {results.map((e) => <Pressable key={e.id} accessibilityRole="button" accessibilityLabel={`Cambiar por ${e.name}`} onPress={() => pick(e)} style={[s.item, swap?.id === e.id && s.itemOn]}>
      <Text style={s.itemName}>{e.name}</Text><Text style={s.itemSub}>{e.equipment ?? e.muscleGroup}</Text>
    </Pressable>)}
    <Pressable accessibilityRole="button" onPress={async () => { setBusy(true); try { await onRemove(); onClose(); } finally { setBusy(false); } }}><Text style={st.danger}>Quitar de la sesión</Text></Pressable>
  </Sheet>;
}

const s = StyleSheet.create({
  swapped: { color: colors.green, fontSize: 13, fontWeight: '800' },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, switchText: { color: colors.text, fontSize: 13 },
  list: { gap: 6 },
  item: { borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 10, backgroundColor: colors.surfaceRaised },
  itemOn: { borderColor: colors.green, backgroundColor: '#12291F' },
  itemName: { color: colors.text, fontSize: 14, fontWeight: '700' }, itemSub: { color: colors.secondary, fontSize: 11 },
});
