import { PropsWithChildren } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';
import { colors, themed } from '@/theme/colors';
import { display } from '@/theme/fonts';

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

const styles = themed(() => StyleSheet.create({
  button: { minHeight: 58, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16, borderRadius: 16, backgroundColor: colors.blue },
  secondary: { minHeight: 48, borderRadius: 14, backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border },
  pressed: { opacity: 0.82 },
  disabled: { opacity: 0.48 },
  text: { color: 'white', fontSize: 22, letterSpacing: 0.5, ...display },
  secondaryText: { color: colors.text, fontSize: 15, fontWeight: '700', fontFamily: undefined, textTransform: 'none', letterSpacing: 0 },
}));
