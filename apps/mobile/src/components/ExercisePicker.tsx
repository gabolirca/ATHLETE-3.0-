import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Card } from '@/components/Card';
import { AppInput } from '@/components/AppInput';
import { Label } from '@/components/Typography';
import { useTrainingRepository } from '@/data/MobileTrainingContext';
import type { Exercise } from '@/data/trainingTypes';
import { colors } from '@/theme/colors';

/** Orden en que se muestran los filtros (los que no estén aquí van al final, en orden alfabético). */
const MUSCLE_ORDER = ['Pecho', 'Espalda', 'Hombros', 'Bíceps', 'Tríceps', 'Cuádriceps', 'Isquiotibiales', 'Glúteos', 'Pantorrillas', 'Core'];
const EQUIPMENT_ORDER = ['Barra', 'Mancuernas', 'Máquina', 'Polea', 'Peso corporal', 'Kettlebell'];

function ordered(values: Iterable<string>, order: string[]): string[] {
  const unique = [...new Set(values)];
  const rank = (v: string) => { const i = order.indexOf(v); return i === -1 ? order.length : i; };
  return unique.sort((a, b) => rank(a) - rank(b) || a.localeCompare(b, 'es'));
}

/** Filtra por músculo principal y equipo. "Todos" (null) no filtra. */
export function filterExercises(exercises: readonly Exercise[], muscle: string | null, equipment: string | null): Exercise[] {
  return exercises.filter((e) =>
    (muscle === null || (e.muscles ?? [e.muscleGroup]).includes(muscle)) &&
    (equipment === null || (e.equipmentList ?? []).includes(equipment)));
}

function ChipRow({ label, values, selected, onSelect }: { label: string; values: string[]; selected: string | null; onSelect: (v: string | null) => void }) {
  return <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters} accessibilityLabel={label} keyboardShouldPersistTaps="handled">
    {[null, ...values].map((item) => {
      const active = selected === item;
      return <Pressable key={item ?? 'todos'} accessibilityRole="button" accessibilityState={{ selected: active }} accessibilityLabel={`${label}: ${item ?? 'Todos'}`}
        onPress={() => onSelect(item)} style={[styles.filter, active && styles.filterActive]}>
        <Text style={[styles.filterText, active && styles.filterTextActive]}>{item ?? 'Todos'}</Text>
      </Pressable>;
    })}
  </ScrollView>;
}

export function ExercisePicker({ selectedIds = [], onSelect, multi = false }: {
  selectedIds?: string[];
  onSelect: (exercise: Exercise) => void;
  multi?: boolean;
}) {
  const repository = useTrainingRepository();
  const [query, setQuery] = useState('');
  const [muscle, setMuscle] = useState<string | null>(null);
  const [equipment, setEquipment] = useState<string | null>(null);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [all, setAll] = useState<Exercise[]>([]);

  useEffect(() => {
    let mounted = true;
    repository?.searchExercises('').then((items) => { if (mounted) setAll(items); }).catch(() => undefined);
    return () => { mounted = false; };
  }, [repository]);

  useEffect(() => {
    let mounted = true;
    repository?.searchExercises(query).then((items) => { if (mounted) setExercises(items); }).catch(() => undefined);
    return () => { mounted = false; };
  }, [repository, query]);

  const muscles = useMemo(() => ordered(all.flatMap((e) => e.muscles ?? []), MUSCLE_ORDER), [all]);
  const equipmentValues = useMemo(() => ordered(all.flatMap((e) => e.equipmentList ?? []), EQUIPMENT_ORDER), [all]);
  const visible = filterExercises(exercises, muscle, equipment);

  return (
    <View style={styles.wrap}>
      <AppInput label="Buscar ejercicio" defaultValue="" onChangeText={setQuery} placeholder="Ej. jalon, press banca, bulgara" returnKeyType="search" autoCorrect={false} spellCheck={false} autoCapitalize="none" />
      <ChipRow label="Músculo" values={muscles} selected={muscle} onSelect={setMuscle}/>
      <ChipRow label="Equipo" values={equipmentValues} selected={equipment} onSelect={setEquipment}/>
      <Text style={styles.count}>{visible.length} {visible.length === 1 ? 'ejercicio' : 'ejercicios'}{multi && selectedIds.length ? ` · ${selectedIds.length} elegidos` : ''}</Text>
      {visible.length === 0 ? <Text style={styles.empty}>No encontramos ejercicios con esa búsqueda o filtros.</Text> : visible.map((exercise) => {
        const selected = selectedIds.includes(exercise.id);
        return <Pressable key={exercise.id} accessibilityRole="button" accessibilityState={{ selected }} accessibilityLabel={`${exercise.name}${exercise.tier === 'pro' ? ', Pro' : ''}`} onPress={() => onSelect(exercise)}>
          <Card accent={selected ? colors.blue : undefined}><View style={styles.exercise}>
            <View style={styles.flex}>
              <View style={styles.nameRow}><Label>{exercise.name}</Label>{exercise.tier === 'pro' ? <Text style={styles.pro}>PRO</Text> : null}{exercise.isCustom ? <Text style={styles.mine}>TUYO</Text> : null}</View>
              <Text style={styles.meta}>{exercise.muscleGroup} · {exercise.equipment ?? 'Sin equipo'}{exercise.mechanics === 'compound' ? ' · Compuesto' : exercise.mechanics === 'isolation' ? ' · Aislamiento' : ''}</Text>
            </View>
            <Text style={styles.select}>{selected ? (multi ? '✓' : 'Añadido') : (multi ? '＋' : 'Añadir')}</Text>
          </View></Card>
        </Pressable>;
      })}
      <Text style={styles.note}>Catálogo disponible en este dispositivo, también sin conexión.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10 },
  filters: { flexDirection: 'row', gap: 7, paddingRight: 8 },
  filter: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border },
  filterActive: { backgroundColor: '#172849', borderColor: colors.blue },
  filterText: { color: colors.secondary, fontSize: 12, fontWeight: '700' },
  filterTextActive: { color: '#9DBDFF' },
  count: { color: colors.muted, fontSize: 11 },
  exercise: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  flex: { flex: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 7, flexWrap: 'wrap' },
  pro: { color: '#F5B841', fontSize: 10, fontWeight: '800', borderWidth: 1, borderColor: '#F5B841', borderRadius: 6, paddingHorizontal: 5, paddingVertical: 1 },
  mine: { color: '#9DBDFF', fontSize: 10, fontWeight: '800', borderWidth: 1, borderColor: '#9DBDFF', borderRadius: 6, paddingHorizontal: 5, paddingVertical: 1 },
  meta: { color: colors.secondary, fontSize: 11, marginTop: 5 },
  select: { color: colors.blue, fontSize: 13, fontWeight: '800' },
  empty: { color: colors.secondary, fontSize: 12, textAlign: 'center', padding: 18 },
  note: { color: colors.muted, fontSize: 10, lineHeight: 15 },
});
