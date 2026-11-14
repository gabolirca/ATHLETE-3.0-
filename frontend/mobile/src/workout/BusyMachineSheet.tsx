import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { AppInput } from '@/components/AppInput';
import { useTrainingRepository } from '@/data/MobileTrainingContext';
import type { Exercise, SessionExercise } from '@/data/trainingTypes';
import { Sheet, sheetStyles as st } from '@/program/edit/Sheet';
import { colors } from '@/theme/colors';
import { machineAlternatives } from './busyMachine';

const fold = (x: string) => x.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/** Hoja "Máquina ocupada": variantes para no esperar. Elegir una cambia el ejercicio de la sesión. */
export function BusyMachineSheet({ exercise, onClose, onPick }: { exercise: SessionExercise | null; onClose: () => void; onPick: (e: Exercise) => Promise<void> }) {
  const repository = useTrainingRepository();
  const [catalog, setCatalog] = useState<Exercise[] | null>(null);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!exercise) return;
    setQuery(''); setError(''); setBusy(null);
    repository?.searchExercises('', { modality: 'all' }).then(setCatalog).catch(() => setCatalog([]));
  }, [exercise, repository]);
  const current = catalog?.find((e) => e.id === exercise?.exerciseId);
  const options = useMemo(() => machineAlternatives(current, catalog ?? []), [current, catalog]);
  const results = useMemo(() => {
    const q = fold(query.trim());
    return q.length < 2 || !catalog ? [] : catalog.filter((e) => e.id !== exercise?.exerciseId && fold(e.name).includes(q)).slice(0, 10);
  }, [query, catalog, exercise]);
  if (!exercise) return null;
  const pick = async (e: Exercise) => {
    setBusy(e.id); setError('');
    try { await onPick(e); onClose(); } catch { setError('No se pudo cambiar el ejercicio. Intenta de nuevo.'); } finally { setBusy(null); }
  };
  const row = (e: Exercise) => <Pressable key={e.id} accessibilityRole="button" accessibilityLabel={`Cambiar por ${e.name}`} disabled={busy !== null} onPress={() => void pick(e)} style={s.item}>
    <View style={{ flex: 1 }}><Text style={s.name}>{e.name}</Text><Text style={s.sub}>{e.equipment ?? 'Sin equipo'} · {e.muscleGroup}{e.tier === 'pro' ? ' · PRO' : ''}</Text></View>
    {busy === e.id ? <ActivityIndicator color={colors.blue}/> : <Text style={s.go}>Cambiar</Text>}
  </Pressable>;
  return <Sheet visible title={`Máquina ocupada · ${exercise.exerciseName}`} onClose={onClose}>
    <Text style={st.hint}>Haz una variante y sigue con tu rutina. Se conservan las series, repeticiones y descanso del plan.</Text>
    {catalog === null ? <ActivityIndicator color={colors.blue}/> : options.length
      ? <><Text style={st.label}>VARIANTES SUGERIDAS</Text><View style={s.list}>{options.map(row)}</View></>
      : <Text style={st.hint}>No encontramos variantes parecidas. Búscala en el catálogo.</Text>}
    <AppInput label="Buscar otra" defaultValue="" onChangeText={setQuery} placeholder="Ej. mancuerna, polea, prensa" autoCorrect={false}/>
    {results.length ? <View style={s.list}>{results.map(row)}</View> : null}
    {error ? <Text accessibilityRole="alert" style={st.error}>{error}</Text> : null}
  </Sheet>;
}

const s = StyleSheet.create({
  list: { gap: 6 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 11, backgroundColor: colors.surfaceRaised },
  name: { color: colors.text, fontSize: 14, fontWeight: '700' }, sub: { color: colors.secondary, fontSize: 11, marginTop: 2 },
  go: { color: colors.blue, fontSize: 12, fontWeight: '800' },
});
