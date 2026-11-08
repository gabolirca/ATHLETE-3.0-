import { StyleSheet, Text, View } from 'react-native';
import { Card } from '@/components/Card';
import { Eyebrow } from '@/components/Typography';
import type { ProgramBlock } from '@/data/trainingTypes';
import { colors } from '@/theme/colors';
import { formatBlock, formatPrescription } from './format';

const seconds = (s: number) => (s >= 60 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : `${s} s`);

/** Bloques de una sesión con sus ejercicios y prescripciones, tal como vienen en el programa. */
export function DayPlan({ blocks }: { blocks: readonly Pick<ProgramBlock, 'id' | 'name' | 'format' | 'rounds' | 'timeCapSeconds' | 'restSeconds' | 'targetRpe' | 'notes' | 'exercises'>[] }) {
  return <>{blocks.map((b) => <Card key={b.id}>
    <View style={s.head}><Text style={s.name}>{b.name}</Text><Text style={s.format}>{formatBlock(b)}</Text></View>
    {b.notes ? <Text style={s.note}>{b.notes}</Text> : null}
    {b.exercises.map((e) => <View key={e.id} style={s.row}>
      <Text style={s.exercise}>{e.exerciseName}</Text>
      <Text style={s.presc}>{formatPrescription(e)}{e.restSeconds ? <Text style={s.rest}>{`  · desc. ${seconds(e.restSeconds)}`}</Text> : null}</Text>
    </View>)}
  </Card>)}</>;
}

/** Notas generales del programa (intensidad, progresión, advertencias). */
export function ProgramNotes({ notes }: { notes: readonly string[] }) {
  return notes.length ? <Card><Eyebrow>CÓMO USARLO</Eyebrow>{notes.map((n) => <Text key={n} style={s.bullet}>• {n}</Text>)}</Card> : null;
}

const s = StyleSheet.create({
  head: { gap: 3 }, name: { color: colors.text, fontSize: 15, fontWeight: '800' }, format: { color: '#F5B841', fontSize: 12, fontWeight: '700' },
  note: { color: colors.secondary, fontSize: 11, lineHeight: 16 },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 10, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 8 },
  exercise: { flex: 1, color: colors.text, fontSize: 13 }, presc: { color: colors.text, fontSize: 13, fontWeight: '800', textAlign: 'right' },
  rest: { color: colors.muted, fontSize: 11, fontWeight: '600' },
  bullet: { color: colors.secondary, fontSize: 12, lineHeight: 18 },
});
