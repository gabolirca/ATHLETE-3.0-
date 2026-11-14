import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/theme/colors';
import { ActionButton } from './ActionButton';

export function EmptyState({ icon = 'barbell-outline', title, detail, action, onAction }: {
  icon?: keyof typeof Ionicons.glyphMap;
  title: string;
  detail: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.wrap}>
      <View style={styles.icon}><Ionicons name={icon} size={23} color={colors.blue} /></View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.detail}>{detail}</Text>
      {action && onAction ? <ActionButton onPress={onAction}>{action}</ActionButton> : null}
    </View>
  );
}

const styles = StyleSheet.create({ wrap: { alignItems: 'center', gap: 12, paddingVertical: 26, paddingHorizontal: 18, backgroundColor: colors.surface, borderRadius: 18, borderWidth: 1, borderColor: colors.border }, icon: { width: 48, height: 48, borderRadius: 16, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' }, title: { color: colors.text, fontWeight: '800', fontSize: 16, textAlign: 'center' }, detail: { color: colors.secondary, fontSize: 12, lineHeight: 18, textAlign: 'center' } });
