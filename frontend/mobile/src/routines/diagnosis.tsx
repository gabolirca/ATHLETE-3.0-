import { StyleSheet, Text, View } from 'react-native';
import { diagnoseWeeklyVolume, plannedSetsByMuscle } from '@athlete/domain';
import { Card } from '@/components/Card';
import { Chip } from '@/components/Chip';
import { Eyebrow } from '@/components/Typography';
import type { Exercise, MuscleVolumeItem } from '@/data/trainingTypes';
import { MuscleVolumeRow, formatSets } from '@/progress/muscleVolume';
import { colors } from '@/theme/colors';

export type PlannedItem = { exercise: Exercise; sets: number | null };
export type RoutineDiagnosis = { trained: MuscleVolumeItem[]; missing: MuscleVolumeItem[] };

/** Diagnóstico de una rutina: series por semana de cada músculo si la haces `timesPerWeek` veces. */
export function diagnoseRoutine(items: readonly PlannedItem[], timesPerWeek: number): RoutineDiagnosis {
  const byId = new Map(items.map((i) => [i.exercise.id, i.exercise]));
  const names = new Map<string, string>();
  for (const i of items) for (const m of [...(i.exercise.muscleRoles?.primary ?? []), ...(i.exercise.muscleRoles?.secondary ?? [])]) names.set(m.slug, m.name);
  const sets = plannedSetsByMuscle(items.map((i) => ({ exerciseId: i.exercise.id, sets: i.sets })), (id) => {
    const roles = byId.get(id)?.muscleRoles;
    return roles ? { primary: roles.primary.map((m) => m.slug), secondary: roles.secondary.map((m) => m.slug) } : undefined;
  }, timesPerWeek);
  const all = diagnoseWeeklyVolume(sets).map((m) => ({ ...m, name: names.get(m.muscle) ?? MUSCLE_NAMES[m.muscle] ?? m.muscle }));
  return { trained: all.filter((m) => m.sets > 0), missing: all.filter((m) => m.sets === 0) };
}

/** Nombres de los músculos que se diagnostican aunque la rutina no los toque (para el aviso "sin trabajo"). */
const MUSCLE_NAMES: Record<string, string> = {
  chest: 'Pecho', back: 'Espalda', shoulders: 'Hombros', quadriceps: 'Cuádriceps', hamstrings: 'Isquiotibiales', glutes: 'Glúteos',
  biceps: 'Bíceps', triceps: 'Tríceps', calves: 'Pantorrillas', core: 'Core', traps: 'Trapecio',
};

/** "Pecho 8 · Tríceps 4 · Hombros 4": los músculos con más series de una rutina (por sesión). */
export function routineFocus(items: readonly PlannedItem[], top = 3): string {
  return diagnoseRoutine(items, 1).trained.slice(0, top).map((m) => `${m.name} ${formatSets(m.sets)}`).join(' · ');
}

export function RoutineDiagnosisCard({ items, timesPerWeek, onTimesChange }: { items: readonly PlannedItem[]; timesPerWeek: number; onTimesChange: (n: number) => void }) {
  const d = diagnoseRoutine(items, timesPerWeek);
  const max = Math.max(22, ...d.trained.map((m) => m.sets));
  const low = d.trained.filter((m) => m.status === 'low').length;
  const high = d.trained.filter((m) => m.status === 'high').length;
  return <Card>
    <Eyebrow>DIAGNÓSTICO · SERIES POR SEMANA</Eyebrow>
    <Text style={s.q}>¿Cuántas veces a la semana harás esta rutina?</Text>
    <View style={s.chips}>{[1, 2, 3].map((n) => <Chip key={n} label={`${n}× por semana`} selected={timesPerWeek === n} onPress={() => onTimesChange(n)}/>)}</View>
    {d.trained.length ? <>
      <Text style={[s.verdict, { color: low || high ? colors.amber : colors.green }]}>
        {low || high ? [low ? `${low} ${low === 1 ? 'músculo queda bajo' : 'músculos quedan bajos'}` : '', high ? `${high} con demasiadas series` : ''].filter(Boolean).join(' y ') : 'Todo lo que trabajas queda en rango'}
      </Text>
      {d.trained.map((m) => <MuscleVolumeRow key={m.muscle} item={m} scaleMax={max}/>)}
    </> : <Text style={s.note}>Agrega ejercicios para ver qué músculos trabaja.</Text>}
    {d.trained.length && d.missing.length ? <Text style={s.note}>Sin trabajo en esta rutina: {d.missing.map((m) => m.name).join(', ')}. Está bien si los entrenas en otra rutina.</Text> : null}
  </Card>;
}

const s = StyleSheet.create({
  q: { color: colors.text, fontSize: 13, fontWeight: '700' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  verdict: { fontSize: 13, fontWeight: '800' },
  note: { color: colors.secondary, fontSize: 11, lineHeight: 16 },
});
