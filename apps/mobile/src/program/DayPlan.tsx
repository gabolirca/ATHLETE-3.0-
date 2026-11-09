import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '@/components/Card';
import { Eyebrow } from '@/components/Typography';
import type { ProgramBlock, ProgramExercise } from '@/data/trainingTypes';
import { colors } from '@/theme/colors';
import { formatBlock, formatPrescription } from './format';

const seconds = (s: number) => (s >= 60 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : `${s} s`);

/** Bloques de una sesión con sus ejercicios y prescripciones, tal como vienen en el programa. */
export type DayPlanEdit = { onEditBlock: (b: ProgramBlock) => void; onAddExercise: (b: ProgramBlock) => void; onEditExercise: (e: ProgramExercise, b: ProgramBlock) => void };

/** `edit`: modo edición (toca un bloque o ejercicio para cambiarlo, o agrega ejercicios). */
export function DayPlan({ blocks, edit }: { blocks: readonly ProgramBlock[]; edit?: DayPlanEdit }) {
  return <>{blocks.map((b) => {
    const editableBlock = edit && !b.id.endsWith('-sin-bloque');
    return <Card key={b.id}>
      <Pressable disabled={!editableBlock} accessibilityRole={editableBlock ? 'button' : undefined} accessibilityLabel={editableBlock ? `Editar bloque ${b.name}` : undefined} onPress={() => edit?.onEditBlock(b)} style={s.headRow}>
        <View style={s.head}><Text style={s.name}>{b.name}</Text><Text style={s.format}>{formatBlock(b)}</Text></View>
        {editableBlock ? <Ionicons name="create-outline" size={18} color="#F5B841"/> : null}
      </Pressable>
      {b.notes ? <Text style={s.note}>{b.notes}</Text> : null}
      {b.exercises.map((e) => <Pressable key={e.id} disabled={!edit} accessibilityRole={edit ? 'button' : undefined} accessibilityLabel={edit ? `Editar ${e.exerciseName}` : undefined} onPress={() => edit?.onEditExercise(e, b)} style={s.row}>
        <Text style={s.exercise}>{e.exerciseName}</Text>
        <Text style={s.presc}>{formatPrescription(e)}{e.restSeconds ? <Text style={s.rest}>{`  · desc. ${seconds(e.restSeconds)}`}</Text> : null}</Text>
        {edit ? <Ionicons name="chevron-forward" size={15} color={colors.muted}/> : null}
      </Pressable>)}
      {editableBlock ? <Pressable accessibilityRole="button" accessibilityLabel={`Agregar ejercicio a ${b.name}`} onPress={() => edit!.onAddExercise(b)} style={s.add}><Text style={s.addText}>＋ Agregar ejercicio</Text></Pressable> : null}
    </Card>;
  })}</>;
}

/** Notas generales del programa (intensidad, progresión, advertencias). */
export function ProgramNotes({ notes }: { notes: readonly string[] }) {
  return notes.length ? <Card><Eyebrow>CÓMO USARLO</Eyebrow>{notes.map((n) => <Text key={n} style={s.bullet}>• {n}</Text>)}</Card> : null;
}

const s = StyleSheet.create({
  head: { gap: 3, flex: 1 }, headRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  add: { alignSelf: 'flex-start', paddingVertical: 6 }, addText: { color: '#F5B841', fontSize: 13, fontWeight: '800' }, name: { color: colors.text, fontSize: 15, fontWeight: '800' }, format: { color: '#F5B841', fontSize: 12, fontWeight: '700' },
  note: { color: colors.secondary, fontSize: 11, lineHeight: 16 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 8 },
  exercise: { flex: 1, color: colors.text, fontSize: 13 }, presc: { color: colors.text, fontSize: 13, fontWeight: '800', textAlign: 'right' },
  rest: { color: colors.muted, fontSize: 11, fontWeight: '600' },
  bullet: { color: colors.secondary, fontSize: 12, lineHeight: 18 },
});
