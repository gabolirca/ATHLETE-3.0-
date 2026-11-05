import { PropsWithChildren } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';
import { colors } from '@/theme/colors';

export function ActionButton({ children, onPress, disabled, loading, secondary, accessibilityLabel }: PropsWithChildren<{
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  secondary?: boolean;
  accessibilityLabel?: string;
}>) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: Boolean(disabled || loading) }}
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [styles.button, secondary && styles.secondary, pressed && styles.pressed, (disabled || loading) && styles.disabled]}
    >
      {loading ? <ActivityIndicator color={secondary ? colors.blue : 'white'} /> : <Text style={[styles.text, secondary && styles.secondaryText]}>{children}</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { minHeight: 48, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16, borderRadius: 13, backgroundColor: colors.blue },
  secondary: { backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border },
  pressed: { opacity: 0.82 },
  disabled: { opacity: 0.48 },
  text: { color: 'white', fontSize: 14, fontWeight: '800' },
  secondaryText: { color: colors.text },
});
