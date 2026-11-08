import { Pressable, StyleSheet, View } from 'react-native';
import { Label } from './Typography';
import { colors } from '@/theme/colors';

/** Título de sección. Con `onAction`, la acción de la derecha es un botón; sin él es solo texto. */
export function SectionHeading({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  const label = action ? <Label style={s.action}>{action}</Label> : null;
  return <View style={s.row}><Label>{title}</Label>
    {label && onAction ? <Pressable accessibilityRole="button" accessibilityLabel={action} hitSlop={10} onPress={onAction}>{label}</Pressable> : label}
  </View>;
}
const s = StyleSheet.create({ row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, action: { color: colors.blue, fontSize: 12 } });
