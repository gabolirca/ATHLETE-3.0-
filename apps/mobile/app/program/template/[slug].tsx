import { useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { BUNDLED_CATALOG, CATALOG_EXERCISE_ID } from '@athlete/data';
import { PROGRAM_TEMPLATES, type TemplateSession } from '@athlete/domain';
import { ActionButton } from '@/components/ActionButton';
import { Card } from '@/components/Card';
import { EmptyState } from '@/components/EmptyState';
import { Eyebrow, Title } from '@/components/Typography';
import { Screen } from '@/components/Screen';
import { useTrainingRepository } from '@/data/MobileTrainingContext';
import type { ProgramBlock } from '@/data/trainingTypes';
import { DayPlan, ProgramNotes } from '@/program/DayPlan';
import { HYBRID_COLOR } from '@/program/HybridCard';
import { modalityInfo, weekdayLabel } from '@/program/format';
import { colors } from '@/theme/colors';

const nameOf = new Map<string, string>(BUNDLED_CATALOG.exercises.map((e) => [String(e.id), String(e.name)]));

/** Bloques de la plantilla en el formato de la app (para reutilizar DayPlan antes de adoptarla). */
function templateBlocks(session: TemplateSession): ProgramBlock[] {
  return session.blocks.map((b, i) => ({
    id: `${session.name}-${i}`, name: b.name, kind: b.kind, format: b.format, rounds: b.rounds ?? null, timeCapSeconds: b.timeCapSeconds ?? null,
    restSeconds: b.restSeconds ?? null, targetRpe: b.targetRpe ?? null, notes: b.notes ?? null,
    exercises: b.exercises.map((e, j) => ({
      id: `${i}-${j}`, exerciseId: e.slug, exerciseName: nameOf.get(CATALOG_EXERCISE_ID[e.slug] ?? '') ?? e.slug, modality: 'strength', loadType: 'external',
      sets: e.sets ?? null, repsMin: e.repsMin ?? null, repsMax: e.repsMax ?? null, durationSeconds: e.durationSeconds ?? null, distanceMeters: e.distanceMeters ?? null,
      restSeconds: e.restSeconds ?? null, perSide: e.perSide ?? false, targetRpe: e.targetRpe ?? null, notes: e.notes ?? null,
    })),
  }));
}

export default function ProgramTemplateScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const router = useRouter();
  const repository = useTrainingRepository();
  const template = PROGRAM_TEMPLATES.find((t) => t.slug === slug);
  const [open, setOpen] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  if (!template) return <Screen><Title>Programa</Title><EmptyState title="Programa no disponible" detail="Puede que esta versión de la app no lo incluya." action="Volver" onAction={() => router.back()}/></Screen>;

  async function adopt() {
    if (!repository || !template) return;
    setSaving(true); setError('');
    try { const id = await repository.adoptProgramTemplate(template.slug); router.replace(`/program/${id}`); }
    catch (cause) {
      setError(cause instanceof Error && cause.message === 'CATALOG_OUTDATED'
        ? 'A tu teléfono le faltan ejercicios del catálogo. Conéctate a internet, espera unos segundos y vuelve a intentar.'
        : `No pudimos crear el programa en este teléfono. Intenta de nuevo.${cause instanceof Error ? ` (${(cause as Error & { code?: string }).code ?? cause.message})` : ''}`);
    }
    finally { setSaving(false); }
  }

  return <Screen>
    <View><Eyebrow>MODO HÍBRIDO · PLANTILLA</Eyebrow><Title>{template.name}</Title></View>
    <Card accent={HYBRID_COLOR}>
      <Text style={s.summary}>{template.summary}</Text>
      <Text style={s.muted}>Al empezarlo se copia a tus programas: puedes entrenarlo tal cual y, más adelante, editarlo.</Text>
      <ActionButton onPress={() => void adopt()} loading={saving}>Empezar este programa</ActionButton>
      {error ? <Text accessibilityRole="alert" style={s.error}>{error}</Text> : null}
    </Card>
    <Eyebrow>SEMANA TIPO</Eyebrow>
    {template.sessions.map((session, i) => {
      const info = modalityInfo(session.modality);
      const expanded = open === i;
      return <View key={`${session.weekday}-${session.name}`} style={s.gap}>
        <Pressable accessibilityRole="button" accessibilityState={{ expanded }} onPress={() => setOpen(expanded ? null : i)}>
          <Card>
            <View style={s.row}>
              <View style={[s.icon, { backgroundColor: `${info.color}22` }]}><Ionicons name={info.icon as never} size={18} color={info.color}/></View>
              <View style={s.flex}><Text style={s.day}>{weekdayLabel(session.weekday)}</Text><Text style={s.name}>{session.name}</Text></View>
              <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={colors.secondary}/>
            </View>
          </Card>
        </Pressable>
        {expanded ? <DayPlan blocks={templateBlocks(session)}/> : null}
      </View>;
    })}
    <ProgramNotes notes={template.notes}/>
  </Screen>;
}

const s = StyleSheet.create({
  summary: { color: colors.text, fontSize: 15, fontWeight: '700', lineHeight: 21 }, muted: { color: colors.secondary, fontSize: 12, lineHeight: 18 },
  error: { color: colors.red, fontSize: 12 }, gap: { gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 }, flex: { flex: 1 },
  icon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  day: { color: colors.secondary, fontSize: 11, fontWeight: '700' }, name: { color: colors.text, fontSize: 15, fontWeight: '800' },
});
