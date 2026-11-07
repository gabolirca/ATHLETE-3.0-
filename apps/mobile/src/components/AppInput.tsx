import { forwardRef } from 'react';
import { StyleSheet, Text, TextInput, TextInputInstance, TextInputProps, View } from 'react-native';
import { colors } from '@/theme/colors';
import { notifyInputFocus } from './keyboardReveal';

export const AppInput = forwardRef<TextInputInstance, TextInputProps & { label: string; error?: string }>(function AppInput(
  { label, error, style, accessibilityLabel, onFocus, ...props }, ref,
) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        ref={ref}
        accessibilityLabel={accessibilityLabel ?? label}
        placeholderTextColor={colors.muted}
        selectionColor={colors.blue}
        style={[styles.input, error ? styles.invalid : null, style]}
        {...props}
        onFocus={(e) => { notifyInputFocus(); onFocus?.(e); }}
      />
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { gap: 7 },
  label: { color: colors.secondary, fontSize: 11, fontWeight: '700' },
  input: { minHeight: 46, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceRaised, paddingHorizontal: 13, color: colors.text, fontSize: 14 },
  invalid: { borderColor: colors.red },
  error: { color: colors.red, fontSize: 11 },
});
