import { useCallback, useState } from 'react';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { CoachComments } from '@/coach/CoachComments';
import { Ionicons } from '@expo/vector-icons';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { PROGRAM_TEMPLATES } from '@athlete/domain';
import { Card } from '@/components/Card';
import { EmptyState } from '@/components/EmptyState';
import { Eyebrow, Title } from '@/components/Typography';
import { Screen } from '@/components/Screen';
import { useTrainingRepository } from '@/data/MobileTrainingContext';
import type { Program, ProgramWeekStatus } from '@/data/trainingTypes';
import { ProgramNotes } from '@/program/DayPlan';
import { SessionSheet } from '@/program/edit/SessionSheet';
import { ActionButton } from '@/components/ActionButton';
import type { ProgramDay } from '@/data/trainingTypes';
import { HYBRID_COLOR } from '@/program/HybridCard';
import { daySummary, modalityInfo, todayWeekday, weekdayLabel } from '@/program/format';
import { colors } from '@/theme/colors';

/** Semana del programa: cada día con sus sesiones, lo hecho esta semana y el día de hoy resaltado. */
export default function ProgramWeekScreen() {
  const { planId } = useLocalSearchParams<{ planId: string }>();
  const router = useRouter();
  const repository = useTrainingRepository();
  const [program, setProgram] = useState<Program | null | undefined>(undefined);
  const [status, setStatus] = useState<ProgramWeekStatus>({});
  const [sheet, setSheet] = useState<{ day: ProgramDay | null } | null>(null);
  const load = useCallback(async () => {
    if (!repository) return;
    try {
      const [list, st] = await Promise.all([repository.listPrograms(), repository.programWeekStatus(planId).catch(() => ({}))]);
      setProgram(list.find((p) => p.id === planId) ?? null); setStatus(st);
    } catch { setProgram(null); }
  }, [repository, planId]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  if (program === undefined) return <Screen><Title>Programa</Title></Screen>;
  if (!program) return <Screen><Title>Programa</Title><EmptyState title="Programa no disponible" detail="Puede que lo hayas quitado en otro dispositivo." action="Ir a Entrenar" onAction={() => router.replace('/train')}/></Screen>;
  const today = todayWeekday();
  const notes = PROGRAM_TEMPLATES.find((t) => t.slug === program.templateSlug)?.notes ?? [];
  const done = program.days.filter((d) => status[d.id] && !status[d.id]!.active).length;

  function confirmDelete() {
    Alert.alert('Quitar programa', 'Se quitará de tus programas. Tus entrenamientos ya registrados se conservan.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Quitar', style: 'destructive', onPress: () => { void repository?.deleteProgram(program!.id).then(() => router.replace('/train')); } },
    ]);
  }

  return <Screen>
    <View><Eyebrow>{program.coachName ? `DE TU COACH · ${program.coachName.toUpperCase()}` : 'MODO HÍBRIDO'}</Eyebrow><Title>{program.name}</Title></View>
    <CoachComments targetType="plan" targetId={program.id}/>
    <Card accent={HYBRID_COLOR}>
      <Text style={s.big}>{done} de {program.days.length}</Text>
      <Text style={s.muted}>sesiones hechas esta semana (lunes a domingo)</Text>
      <View style={s.track}><View style={[s.fill, { width: `${Math.round((done / Math.max(1, program.days.length)) * 100)}%` }]}/></View>
      <ActionButton secondary onPress={() => router.push(`/share/week/${program.id}`)}>Compartir mi semana</ActionButton>
    </Card>
    {[1, 2, 3, 4, 5, 6, 7].map((w) => {
      const days = program.days.filter((d) => d.weekday === w);
      if (!days.length) return null;
      return <View key={w} style={s.dayGroup}>
        <Text style={[s.weekday, w === today && s.today]}>{weekdayLabel(w)}{w === today ? ' · hoy' : ''}</Text>
        {days.map((d) => {
          const info = modalityInfo(d.modality);
          const st = status[d.id];
          return <Pressable key={d.id} accessibilityRole="button" accessibilityLabel={`${d.name}${st && !st.active ? ', hecho' : ''}`} onPress={() => router.push(`/program/day/${d.id}`)}>
            <Card accent={w === today ? HYBRID_COLOR : undefined}>
              <View style={s.row}>
                <View style={[s.icon, { backgroundColor: `${info.color}22` }]}><Ionicons name={info.icon as never} size={18} color={info.color}/></View>
                <View style={s.flex}><Text style={s.name}>{d.name}</Text><Text style={s.muted}>{info.label}{daySummary(d) ? ` · ${daySummary(d)}` : ''}</Text></View>
                {st && !st.active ? <Ionicons name="checkmark-circle" size={22} color={colors.green}/> : st?.active ? <Text style={s.live}>EN CURSO</Text> : null}
                <Pressable accessibilityRole="button" accessibilityLabel={`Opciones de ${d.name}`} hitSlop={10} onPress={() => setSheet({ day: d })}><Ionicons name="ellipsis-horizontal" size={20} color={colors.secondary}/></Pressable>
              </View>
            </Card>
          </Pressable>;
        })}
      </View>;
    })}
    <ActionButton secondary onPress={() => setSheet({ day: null })}>＋ Agregar sesión</ActionButton>
    <ProgramNotes notes={notes}/>
    <SessionSheet visible={sheet !== null} day={sheet?.day ?? null} onClose={() => setSheet(null)}
      onSave={async (v) => { if (sheet?.day) await repository!.updateProgramDay(sheet.day.id, v); else { const id = await repository!.addProgramDay(program.id, v); router.push(`/program/day/${id}`); } await load(); }}
      onDuplicate={sheet?.day ? async (weekday) => { await repository!.duplicateProgramDay(sheet.day!.id, weekday); await load(); } : undefined}
      onDelete={sheet?.day ? async () => { await repository!.deleteProgramDay(sheet.day!.id); await load(); } : undefined}/>
    <Pressable accessibilityRole="button" onPress={confirmDelete}><Text style={s.delete}>Quitar este programa</Text></Pressable>
  </Screen>;
}

const s = StyleSheet.create({
  big: { color: colors.text, fontSize: 26, fontWeight: '800' }, muted: { color: colors.secondary, fontSize: 12, lineHeight: 17 },
  track: { height: 8, borderRadius: 4, backgroundColor: colors.surfaceRaised, overflow: 'hidden' }, fill: { height: 8, borderRadius: 4, backgroundColor: HYBRID_COLOR },
  dayGroup: { gap: 8 }, weekday: { color: colors.secondary, fontSize: 12, fontWeight: '800', letterSpacing: 0.5 }, today: { color: HYBRID_COLOR },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 }, flex: { flex: 1 },
  icon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  name: { color: colors.text, fontSize: 15, fontWeight: '800' }, live: { color: colors.blue, fontSize: 10, fontWeight: '800' },
  delete: { color: colors.red, fontSize: 12, fontWeight: '700', textAlign: 'center', padding: 15 },
});
