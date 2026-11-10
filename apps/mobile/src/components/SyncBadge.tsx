import { StyleSheet, Text, View } from 'react-native';
import { colors } from '@/theme/colors';

export function LocalSaveBadge({ status, pendingCount }: { status?: 'pending' | 'synced' | 'conflict' | 'failed'; pendingCount?: number }) {
  const label = status === 'conflict'
    ? 'Requiere resolver conflicto'
    : status === 'failed'
      ? 'Sync pendiente de reintento'
      : status === 'synced'
        ? 'Sincronizado'
        : 'Guardado en este dispositivo';
  return (
    <View style={[styles.pill, status === 'conflict' && styles.conflict, status === 'failed' && styles.failed]}>
      <View style={[styles.dot, status === 'synced' && styles.synced, status === 'conflict' && styles.conflictDot]} />
      <Text style={styles.label}>{label}{pendingCount ? ` · ${pendingCount} pendiente${pendingCount === 1 ? '' : 's'}` : ''}</Text>
    </View>
  );
}
const styles = StyleSheet.create({ pill: { alignSelf: 'flex-start', backgroundColor: colors.surfaceRaised, borderRadius: 100, paddingHorizontal: 11, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 7 }, conflict: { backgroundColor: colors.redSoft }, failed: { backgroundColor: colors.amberSoft }, dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.blue }, synced: { backgroundColor: colors.green }, conflictDot: { backgroundColor: colors.red }, label: { color: colors.secondary, fontSize: 10, fontWeight: '700' } });
