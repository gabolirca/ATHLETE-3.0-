import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { PROGRAM_TEMPLATES, programCycle } from '@athlete/domain';
import { localDateOfDevice } from '@/lib/localDate';
import { ActionButton } from '@/components/ActionButton';
import { Card } from '@/components/Card';
import { Eyebrow } from '@/components/Typography';
import type { Program, ProgramWeekStatus } from '@/data/trainingTypes';
import { colors } from '@/theme/colors';
import { WEEKDAYS, daySummary, modalityInfo, todayWeekday, weekdayShort } from './format';
import { useStartDay } from './useProgram';

export const HYBRID_COLOR = colors.amber;

/**
 * Modo Híbrido en Entrenar e Inicio:
 * - sin programa: invitación a ver "Hybrid Athlete 1.0";
 * - con programa: lo de hoy (empezar / continuar / hecho), la semana en puntos y acceso a la semana completa.
 */
export function HybridCard({ program, status, loaded }: { program: Program | null; status: ProgramWeekStatus; loaded: boolean }) {
  const router = useRouter();
  const startDay = useStartDay();
  if (!loaded) return null;
  if (!program) {
    return <Card accent={HYBRID_COLOR}>
      <Eyebrow>MODO HÍBRIDO</Eyebrow>
      <Text style={s.title}>Elige tu programa</Text>
      <Text style={s.muted}>Fuerza, cardio y funcional en una semana. Empieza con una plantilla y ajústala a lo que buscas.</Text>
      {PROGRAM_TEMPLATES.map((t) => {
        const kinds = (['strength', 'conditioning', 'swim', 'run'] as const).map((m) => [m, t.sessions.filter((x) => x.modality === m).length] as const).filter(([, n]) => n > 0);
        return <Pressable key={t.slug} accessibilityRole="button" accessibilityLabel={`Ver ${t.name}`} onPress={() => router.push(`/program/template/${t.slug}`)} style={s.template}>
          <View style={s.flex}>
            <Text style={s.name}>{t.name}</Text>
            <View style={s.chips}>{kinds.map(([m, n]) => { const info = modalityInfo(m); return <View key={m} style={s.chip}><Ionicons name={info.icon as never} size={12} color={info.color}/><Text style={s.chipText}>{n} {info.label.toLowerCase()}</Text></View>; })}</View>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.secondary}/>
        </Pressable>;
      })}
    </Card>;
  }
  const today = todayWeekday();
  const todays = program.days.filter((d) => d.weekday === today);
  const doneCount = program.days.filter((d) => status[d.id] && !status[d.id]!.active).length;
  return <Card accent={HYBRID_COLOR}>
    <View style={s.row}><Eyebrow>{`HOY · ${WEEKDAYS[today - 1]!.toUpperCase()}`}</Eyebrow><Text style={s.week}>{doneCount} de {program.days.length} esta semana</Text></View>
    {todays.length ? todays.map((d) => {
      const info = modalityInfo(d.modality);
      const st = status[d.id];
      const done = st && !st.active;
      return <Pressable key={d.id} accessibilityRole="button" accessibilityLabel={`${d.name}${done ? ', hecho' : ''}`} onPress={() => router.push(`/program/day/${d.id}`)} style={s.session}>
        <View style={[s.icon, { backgroundColor: `${info.color}22` }]}><Ionicons name={info.icon as never} size={18} color={info.color}/></View>
        <View style={s.flex}><Text style={s.name}>{d.name}</Text><Text style={s.muted}>{daySummary(d)}</Text></View>
        {done ? <Text style={s.done}>✓ Hecho</Text>
          : <Pressable accessibilityRole="button" accessibilityLabel={`${st?.active ? 'Continuar' : 'Empezar'} ${d.name}`} onPress={() => void startDay(d, st)} style={s.go}><Text style={s.goText}>{st?.active ? 'Continuar' : 'Empezar'}</Text></Pressable>}
      </Pressable>;
    }) : <Text style={s.muted}>Hoy no tienes sesiones en {program.name}. Descansa o adelanta movilidad.</Text>}
    {(() => { const c = programCycle(program.startedOn ?? localDateOfDevice(new Date()), localDateOfDevice(new Date())); return <Text style={c.deloadWeek ? s.deload : s.cycle}>{`Semana ${c.cycleWeek} de ${c.cycleLength}${c.deloadWeek ? ' · semana de descarga: ~60 % de las series y RPE ≤ 6' : ''}`}</Text>; })()}
    <View style={s.dots} accessibilityLabel="Semana del programa">
      {[1, 2, 3, 4, 5, 6, 7].map((w) => {
        const ds = program.days.filter((d) => d.weekday === w);
        const all = ds.length > 0 && ds.every((d) => status[d.id] && !status[d.id]!.active);
        const some = ds.some((d) => status[d.id]);
        return <View key={w} style={s.dotCol}>
          <View style={[s.dot, all ? s.dotDone : some ? s.dotSome : null, w === today && s.dotToday]}/>
          <Text style={[s.dotLabel, w === today && s.dotLabelToday]}>{weekdayShort(w)}</Text>
        </View>;
      })}
    </View>
    <ActionButton secondary onPress={() => router.push(`/program/${program.id}`)}>Ver la semana</ActionButton>
  </Card>;
}

const s = StyleSheet.create({
  title: { color: colors.text, fontSize: 21, fontWeight: '800' }, muted: { color: colors.secondary, fontSize: 12, lineHeight: 18 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  template: { flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 11 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 9, backgroundColor: colors.surfaceRaised },
  chipText: { color: colors.text, fontSize: 11, fontWeight: '700' },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, week: { color: HYBRID_COLOR, fontSize: 11, fontWeight: '800' },
  session: { flexDirection: 'row', alignItems: 'center', gap: 11 }, flex: { flex: 1 },
  icon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  name: { color: colors.text, fontSize: 15, fontWeight: '800' },
  done: { color: colors.green, fontSize: 12, fontWeight: '800' },
  go: { backgroundColor: HYBRID_COLOR, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 }, goText: { color: colors.amberSoft, fontSize: 12, fontWeight: '800' },
  cycle: { color: colors.secondary, fontSize: 11, fontWeight: '700' }, deload: { color: HYBRID_COLOR, fontSize: 12, fontWeight: '800' },
  dots: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: 2 }, dotCol: { alignItems: 'center', gap: 4 },
  dot: { width: 12, height: 12, borderRadius: 6, backgroundColor: colors.graphite },
  dotDone: { backgroundColor: colors.green }, dotSome: { backgroundColor: HYBRID_COLOR }, dotToday: { borderWidth: 2, borderColor: colors.text },
  dotLabel: { color: colors.muted, fontSize: 9, fontWeight: '700' }, dotLabelToday: { color: colors.text },
});
