import { PropsWithChildren } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '@/theme/colors';

export function Screen({ children }: PropsWithChildren) {
  return <SafeAreaView style={styles.safe} edges={['top']}><ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}
    // El teclado no tapa lo que escribes: iOS ajusta el área visible y lleva el campo enfocado a la vista.
    automaticallyAdjustKeyboardInsets keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive">{children}</ScrollView></SafeAreaView>;
}
export function Row({ children, style }: PropsWithChildren<{ style?: object }>) { return <View style={[styles.row, style]}>{children}</View>; }
const styles = StyleSheet.create({ safe: { flex: 1, backgroundColor: colors.black }, content: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 30, gap: 22 }, row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' } });
