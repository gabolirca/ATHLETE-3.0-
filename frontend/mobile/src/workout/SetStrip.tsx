import { StyleSheet, Text, View } from 'react-native';
import type { TrainingSet } from '@/data/trainingTypes';
import { formatWeight, type WeightUnit } from '@/settings/weightUnits';
import { colors, themed } from '@/theme/colors';
import { isLoggedWorkingSet } from './guide';

/** Series de hoy de un ejercicio de un vistazo: S1 ✓ 120 × 12 · S2 (ahora) · S3 — · S4 —. */
export function SetStrip({ sets, target, unit }: { sets: readonly TrainingSet[]; target: number | null; unit: WeightUnit }) {
  const done = sets.filter(isLoggedWorkingSet);
  const total = Math.max(target ?? 0, done.length + 1);
  if (!target) return null;
  return <View style={s.row} accessibilityLabel={`${done.length} de ${target} series hechas`}>
    {Array.from({ length: Math.min(total, 8) }, (_, i) => {
      const set = done[i];
      const now = i === done.length;
      return <View key={i} style={[s.pill, set && s.done, now && s.now, !set && !now && s.next]}>
        <Text style={[s.label, set && s.labelDone, now && s.labelNow]}>S{i + 1}{set ? ' ✓' : now ? ' · ahora' : ''}</Text>
        <Text style={s.value} numberOfLines={1}>{set ? (set.weightKg === null ? `${set.reps ?? '—'} reps` : `${formatWeight(set.weightKg, unit)} × ${set.reps ?? '—'}`) : '—'}</Text>
      </View>;
    })}
  </View>;
}

const s = themed(() => StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  pill: { flexGrow: 1, flexBasis: '22%', borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, paddingVertical: 6, paddingHorizontal: 6, alignItems: 'center' },
  done: { backgroundColor: colors.surfaceRaised }, now: { borderColor: colors.blue, borderWidth: 2 }, next: { opacity: 0.5 },
  label: { color: colors.secondary, fontSize: 11, fontWeight: '700' }, labelDone: { color: colors.green }, labelNow: { color: colors.accentText },
  value: { color: colors.text, fontSize: 12, fontWeight: '700' },
}));
