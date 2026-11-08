import { useCallback, useState } from 'react';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { ActionButton } from '@/components/ActionButton';
import { Card } from '@/components/Card';
import { EmptyState } from '@/components/EmptyState';
import { Eyebrow, Title } from '@/components/Typography';
import { Screen } from '@/components/Screen';
import { useTrainingRepository } from '@/data/MobileTrainingContext';
import type { Program, ProgramDay, ProgramWeekStatus } from '@/data/trainingTypes';
import { DayPlan } from '@/program/DayPlan';
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
  useFocusEffect(useCallback(() => {
    let active = true;
    if (repository) repository.listPrograms().then(async (list) => {
      const program = list.find((p) => p.days.some((d) => d.id === dayId));
      const day = program?.days.find((d) => d.id === dayId);
      const status = program ? await repository.programWeekStatus(program.id).catch(() => ({})) : {};
      if (active) setState(program && day ? { program, day, status } : null);
    }).catch(() => { if (active) setState(null); });
    return () => { active = false; };
  }, [repository, dayId]));

  if (state === undefined) return <Screen><Title>Sesión</Title></Screen>;
  if (!state) return <Screen><Title>Sesión</Title><EmptyState title="Sesión no disponible" detail="Puede que el programa se haya quitado." action="Ir a Entrenar" onAction={() => router.replace('/train')}/></Screen>;
  const { day, status, program } = state;
  const info = modalityInfo(day.modality);
  const st = status[day.id];
  const cardio = cardioActivityFor(day.modality);
  const label = st && !st.active ? 'Ver lo que hiciste' : st?.active ? 'Continuar sesión' : cardio ? 'Registrar al terminar' : 'Empezar sesión';
  return <Screen>
    <View><Eyebrow>{`${weekdayLabel(day.weekday).toUpperCase()} · ${info.label.toUpperCase()} · ${program.name.toUpperCase()}`}</Eyebrow><Title>{day.name}</Title></View>
    <Card accent={HYBRID_COLOR}>
      {daySummary(day) ? <Text style={s.summary}>{daySummary(day)}</Text> : null}
      {cardio ? <Text style={s.muted}>Haz la sesión con el plan de abajo y, al terminar, registra tiempo y metros. Queda ligada a este día del programa.</Text>
        : <Text style={s.muted}>La sesión se arma por bloques. En los AMRAP y "por tiempo" registras tu resultado; al final te preguntamos qué tan dura fue (RPE).</Text>}
      {st && !st.active ? <Text style={s.done}>✓ Hecha esta semana</Text> : null}
      <ActionButton loading={starting} onPress={async () => { setStarting(true); try { await startDay(day, st); } finally { setStarting(false); } }}>{label}</ActionButton>
    </Card>
    <DayPlan blocks={day.blocks}/>
  </Screen>;
}

const s = StyleSheet.create({
  summary: { color: colors.text, fontSize: 16, fontWeight: '800' }, muted: { color: colors.secondary, fontSize: 12, lineHeight: 18 },
  done: { color: colors.green, fontSize: 13, fontWeight: '800' },
});
