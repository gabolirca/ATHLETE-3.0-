import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { AppInput } from '@/components/AppInput';
import { useTrainingRepository } from '@/data/MobileTrainingContext';
import type { Exercise, ProgramBlock } from '@/data/trainingTypes';
import { colors } from '@/theme/colors';
import { Sheet } from './Sheet';

const fold = (t: string) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/** Elegir un ejercicio para agregar a un bloque. Bloques de cardio muestran primero los de cardio. */
export function AddExerciseSheet({ visible, block, onClose, onPick }: { visible: boolean; block: ProgramBlock | null; onClose: () => void; onPick: (exercise: Exercise) => Promise<void> }) {
  const repository = useTrainingRepository();
  const [all, setAll] = useState<Exercise[]>([]);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (visible) { setQuery(''); repository?.searchExercises('', { modality: 'all' }).then(setAll).catch(() => setAll([])); } }, [visible, repository]);
  const cardioFirst = block ? ['cardio', 'swim', 'warmup', 'cooldown'].includes(block.kind) || block.format === 'intervals' || block.format === 'continuous' : false;
  const list = useMemo(() => {
    const q = fold(query.trim());
    const matches = all.filter((e) => !q || fold(e.name).includes(q) || fold(e.muscleGroup).includes(q));
    return [...matches].sort((a, b) => (cardioFirst ? Number(b.modality === 'cardio') - Number(a.modality === 'cardio') : 0) || a.name.localeCompare(b.name, 'es')).slice(0, 40);
  }, [all, query, cardioFirst]);
  return <Sheet visible={visible} title={block ? `Agregar a ${block.name}` : 'Agregar ejercicio'} onClose={onClose}>
    <AppInput label="Buscar" defaultValue="" onChangeText={setQuery} placeholder="Ej. sentadilla, remo, natación" autoCorrect={false}/>
    {list.map((e) => <Pressable key={e.id} accessibilityRole="button" accessibilityLabel={`Agregar ${e.name}`} disabled={busy} onPress={async () => { setBusy(true); try { await onPick(e); onClose(); } finally { setBusy(false); } }} style={s.item}>
      <Text style={s.name}>{e.name}</Text><Text style={s.sub}>{e.modality === 'cardio' ? 'Cardio' : e.muscleGroup}{e.equipment ? ` · ${e.equipment}` : ''}{e.tier === 'pro' ? ' · PRO' : ''}</Text>
    </Pressable>)}
  </Sheet>;
}

const s = StyleSheet.create({
  item: { borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 10, backgroundColor: colors.surfaceRaised },
  name: { color: colors.text, fontSize: 14, fontWeight: '700' }, sub: { color: colors.secondary, fontSize: 11 },
});
