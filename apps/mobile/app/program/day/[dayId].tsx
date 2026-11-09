import { useCallback, useState } from 'react';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ActionButton } from '@/components/ActionButton';
import { Card } from '@/components/Card';
import { EmptyState } from '@/components/EmptyState';
import { Eyebrow, Title } from '@/components/Typography';
import { Screen } from '@/components/Screen';
import { useTrainingRepository } from '@/data/MobileTrainingContext';
import type { Program, ProgramDay, ProgramWeekStatus } from '@/data/trainingTypes';
import { DayPlan } from '@/program/DayPlan';
import { AddExerciseSheet } from '@/program/edit/AddExerciseSheet';
import { BlockSheet } from '@/program/edit/BlockSheet';
import { ExerciseSheet } from '@/program/edit/ExerciseSheet';
import { SessionSheet } from '@/program/edit/SessionSheet';
import type { ProgramBlock, ProgramExercise } from '@/data/trainingTypes';
import { HYBRID_COLOR } from '@/program/HybridCard';
import { cardioActivityFor, daySummary, modalityInfo, weekdayLabel } from '@/program/format';
import { useStartDay } from '@/program/useProgram';
import { colors } from '@/theme/colors';

/** Detalle de una sesión del programa: bloques y prescripciones, y botón para empezarla. */
export default function ProgramDayScreen() {
  const { dayId } = useLocalSearchParams<{ dayId: string }>();
  const router = useRouter();
  const repository = useTrainingRepository();
  const startDay = useStartDay();
  const [state, setState] = useState<{ program: Program; day: ProgramDay; status: ProgramWeekStatus } | null | undefined>(undefined);
  const [starting, setStarting] = useState(false);
  const [editing, setEditing] = useState(false);
  const [sheet, setSheet] = useState<{ kind: 'session' } | { kind: 'block'; block: ProgramBlock | null } | { kind: 'exercise'; exercise: ProgramExercise; block: ProgramBlock } | { kind: 'add'; block: ProgramBlock } | null>(null);
  const load = useCallback(async () => {
    if (!repository) return;
    try {
      const list = await repository.listPrograms();
      const program = list.find((p) => p.days.some((d) => d.id === dayId));
      const day = program?.days.find((d) => d.id === dayId);
      const status = program ? await repository.programWeekStatus(program.id).catch(() => ({})) : {};
      setState(program && day ? { program, day, status } : null);
    } catch { setState(null); }
  }, [repository, dayId]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  if (state === undefined) return <Screen><Title>Sesión</Title></Screen>;
  if (!state) return <Screen><Title>Sesión</Title><EmptyState title="Sesión no disponible" detail="Puede que el programa se haya quitado." action="Ir a Entrenar" onAction={() => router.replace('/train')}/></Screen>;
  const { day, status, program } = state;
  const info = modalityInfo(day.modality);
  const st = status[day.id];
  const cardio = cardioActivityFor(day.modality);
  const label = st && !st.active ? 'Ver lo que hiciste' : st?.active ? 'Continuar sesión' : cardio ? 'Registrar al terminar' : 'Empezar sesión';
  return <Screen>
    <View style={s.titleRow}>
      <View style={s.flex}><Eyebrow>{`${weekdayLabel(day.weekday).toUpperCase()} · ${info.label.toUpperCase()} · ${program.name.toUpperCase()}`}</Eyebrow><Title>{day.name}</Title></View>
      <Pressable accessibilityRole="button" accessibilityLabel={editing ? 'Terminar de editar' : 'Editar sesión'} onPress={() => setEditing((v) => !v)} style={[s.editBtn, editing && s.editOn]}>
        <Text style={[s.editText, editing && s.editTextOn]}>{editing ? 'Listo' : 'Editar'}</Text>
      </Pressable>
    </View>
    {editing ? <Card>
      <Text style={s.muted}>Toca un bloque o ejercicio para cambiarlo. Los cambios aplican de hoy en adelante; tu historial no se toca.</Text>
      <ActionButton secondary onPress={() => setSheet({ kind: 'session' })}>Nombre, día y modalidad</ActionButton>
    </Card> : <Card accent={HYBRID_COLOR}>
      {daySummary(day) ? <Text style={s.summary}>{daySummary(day)}</Text> : null}
      {cardio ? <Text style={s.muted}>Haz la sesión con el plan de abajo y, al terminar, registra tiempo y metros. Queda ligada a este día del programa.</Text>
        : <Text style={s.muted}>La sesión se arma por bloques. En los AMRAP y "por tiempo" registras tu resultado; al final te preguntamos qué tan dura fue (RPE).</Text>}
      {st && !st.active ? <Text style={s.done}>✓ Hecha esta semana</Text> : null}
      <ActionButton loading={starting} onPress={async () => { setStarting(true); try { await startDay(day, st); } finally { setStarting(false); } }}>{label}</ActionButton>
    </Card>}
    <DayPlan blocks={day.blocks} edit={editing ? {
      onEditBlock: (block) => setSheet({ kind: 'block', block }),
      onAddExercise: (block) => setSheet({ kind: 'add', block }),
      onEditExercise: (exercise, block) => setSheet({ kind: 'exercise', exercise, block }),
    } : undefined}/>
    {editing ? <ActionButton secondary onPress={() => setSheet({ kind: 'block', block: null })}>＋ Agregar bloque</ActionButton> : null}
    <SessionSheet visible={sheet?.kind === 'session'} day={day} onClose={() => setSheet(null)}
      onSave={async (v) => { await repository!.updateProgramDay(day.id, v); await load(); }}
      onDuplicate={async (weekday) => { await repository!.duplicateProgramDay(day.id, weekday); await load(); }}
      onDelete={async () => { await repository!.deleteProgramDay(day.id); router.back(); }}/>
    <BlockSheet visible={sheet?.kind === 'block'} block={sheet?.kind === 'block' ? sheet.block : null} onClose={() => setSheet(null)}
      onSave={async (v) => { if (sheet?.kind === 'block' && sheet.block) await repository!.updateProgramBlock(sheet.block.id, v); else await repository!.addProgramBlock(day.id, v); await load(); }}
      onDelete={sheet?.kind === 'block' && sheet.block ? async () => { await repository!.deleteProgramBlock((sheet as { block: ProgramBlock }).block.id); await load(); } : undefined}/>
    <ExerciseSheet visible={sheet?.kind === 'exercise'} exercise={sheet?.kind === 'exercise' ? sheet.exercise : null} block={sheet?.kind === 'exercise' ? sheet.block : null} onClose={() => setSheet(null)}
      onSave={async (patch) => { if (sheet?.kind === 'exercise') { await repository!.updateProgramExercise(sheet.exercise.id, patch); await load(); } }}
      onRemove={async () => { if (sheet?.kind === 'exercise') { await repository!.removeProgramExercise(sheet.exercise.id); await load(); } }}/>
    <AddExerciseSheet visible={sheet?.kind === 'add'} block={sheet?.kind === 'add' ? sheet.block : null} onClose={() => setSheet(null)}
      onPick={async (exercise) => { if (sheet?.kind === 'add') { await repository!.addProgramExercise(day.id, sheet.block.id, exercise.id); await load(); } }}/>
  </Screen>;
}

const s = StyleSheet.create({
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 }, flex: { flex: 1 },
  editBtn: { borderWidth: 1, borderColor: '#F5B841', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 7, marginTop: 4 }, editOn: { backgroundColor: '#F5B841' },
  editText: { color: '#F5B841', fontSize: 13, fontWeight: '800' }, editTextOn: { color: '#1A1300' },
  summary: { color: colors.text, fontSize: 16, fontWeight: '800' }, muted: { color: colors.secondary, fontSize: 12, lineHeight: 18 },
  done: { color: colors.green, fontSize: 13, fontWeight: '800' },
});
