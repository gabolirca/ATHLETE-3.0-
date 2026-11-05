import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Card } from '@/components/Card';
import { AppInput } from '@/components/AppInput';
import { Label } from '@/components/Typography';
import { useTrainingRepository } from '@/data/MobileTrainingContext';
import type { Exercise } from '@/data/trainingTypes';
import { colors } from '@/theme/colors';

export function ExercisePicker({ selectedIds = [], onSelect, multi = false }: {
  selectedIds?: string[];
  onSelect: (exercise: Exercise) => void;
  multi?: boolean;
}) {
  const repository = useTrainingRepository();
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState('Todos');
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const groups = ['Todos', ...new Set(exercises.map((exercise) => exercise.muscleGroup))];

  useEffect(() => {
    let mounted = true;
    repository?.searchExercises(query).then((items) => { if (mounted) setExercises(items); });
    return () => { mounted = false; };
  }, [repository, query]);

  const visible = exercises.filter((exercise) => group === 'Todos' || exercise.muscleGroup === group);
  return (
    <View style={styles.wrap}>
      <AppInput label="Buscar ejercicio" value={query} onChangeText={setQuery} placeholder="Nombre o grupo muscular" returnKeyType="search" />
      <View style={styles.filters}>{groups.map((item) => <Pressable key={item} accessibilityRole="button" accessibilityState={{ selected: group === item }} onPress={() => setGroup(item)} style={[styles.filter, group === item && styles.filterActive]}><Text style={[styles.filterText, group === item && styles.filterTextActive]}>{item}</Text></Pressable>)}</View>
      {visible.length === 0 ? <Text style={styles.empty}>No encontramos ejercicios con esa búsqueda.</Text> : visible.map((exercise) => {
        const selected = selectedIds.includes(exercise.id);
        return <Pressable key={exercise.id} accessibilityRole="button" accessibilityState={{ selected }} onPress={() => onSelect(exercise)}>
          <Card accent={selected ? colors.blue : undefined}><View style={styles.exercise}><View><Label>{exercise.name}</Label><Text style={styles.meta}>{exercise.muscleGroup} · {exercise.equipment ?? 'Sin equipo'}</Text></View><Text style={styles.select}>{selected ? (multi ? '✓' : 'Añadido') : (multi ? '＋' : 'Añadir')}</Text></View></Card>
        </Pressable>;
      })}
      <Text style={styles.note}>Catálogo disponible en este dispositivo, también sin conexión.</Text>
    </View>
  );
}

const styles = StyleSheet.create({ wrap: { gap: 10 }, filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 }, filter: { paddingHorizontal: 10, paddingVertical: 7, borderRadius: 20, backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border }, filterActive: { backgroundColor: '#172849', borderColor: colors.blue }, filterText: { color: colors.secondary, fontSize: 10, fontWeight: '700' }, filterTextActive: { color: '#9DBDFF' }, exercise: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, meta: { color: colors.secondary, fontSize: 10, marginTop: 5 }, select: { color: colors.blue, fontSize: 12, fontWeight: '800' }, empty: { color: colors.secondary, fontSize: 12, textAlign: 'center', padding: 18 }, note: { color: colors.muted, fontSize: 10, lineHeight: 15 } });
