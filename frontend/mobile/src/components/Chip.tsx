import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text } from 'react-native';
import { colors } from '@/theme/colors';

export function Chip({ label, selected, onPress, icon }: { label: string; selected: boolean; onPress: () => void; icon?: string }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ selected }} accessibilityLabel={label} onPress={onPress} style={[s.chip, selected && s.on]}>
    {icon ? <Ionicons name={icon as never} size={15} color={selected ? 'white' : colors.secondary}/> : null}
    <Text style={[s.text, selected && s.textOn]}>{label}</Text>
  </Pressable>;
}

const s = StyleSheet.create({
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 11, backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border },
  on: { backgroundColor: colors.blue, borderColor: colors.blue },
  text: { color: colors.secondary, fontSize: 12, fontWeight: '700' },
  textOn: { color: 'white' },
});
