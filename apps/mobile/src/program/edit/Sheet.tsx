import type { PropsWithChildren } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors } from '@/theme/colors';

/** Hoja inferior para editar sin salir de la pantalla. */
export function Sheet({ visible, title, onClose, children }: PropsWithChildren<{ visible: boolean; title: string; onClose: () => void }>) {
  return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.flex}>
      <Pressable style={s.backdrop} accessibilityLabel="Cerrar" onPress={onClose}/>
      <View style={s.sheet}>
        <View style={s.head}><Text style={s.title}>{title}</Text><Pressable accessibilityRole="button" accessibilityLabel="Cerrar hoja" onPress={onClose} hitSlop={10}><Text style={s.close}>Cerrar</Text></Pressable></View>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.body}>{children}</ScrollView>
      </View>
    </KeyboardAvoidingView>
  </Modal>;
}

/** Fila de opciones tipo chip (un solo valor). */
export function Choices<T extends string | number>({ label, options, value, onChange }: { label: string; options: ReadonlyArray<{ value: T; label: string }>; value: T | null; onChange: (v: T) => void }) {
  return <View style={s.choices} accessibilityLabel={label}>
    {options.map((o) => <Pressable key={String(o.value)} accessibilityRole="button" accessibilityLabel={`${label}: ${o.label}`} accessibilityState={{ selected: value === o.value }} onPress={() => onChange(o.value)} style={[s.choice, value === o.value && s.choiceOn]}>
      <Text style={[s.choiceText, value === o.value && s.choiceTextOn]}>{o.label}</Text>
    </Pressable>)}
  </View>;
}

export const sheetStyles = StyleSheet.create({
  label: { color: colors.secondary, fontSize: 11, fontWeight: '800', letterSpacing: 0.6 },
  row: { flexDirection: 'row', gap: 9 }, flex: { flex: 1 },
  danger: { color: colors.red, fontSize: 13, fontWeight: '800', textAlign: 'center', paddingVertical: 12 },
  error: { color: colors.red, fontSize: 12 },
  hint: { color: colors.muted, fontSize: 11, lineHeight: 16 },
});

const s = StyleSheet.create({
  flex: { flex: 1 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' },
  sheet: { maxHeight: '86%', backgroundColor: colors.surface, borderTopLeftRadius: 22, borderTopRightRadius: 22, borderWidth: 1, borderColor: colors.border },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 18, paddingTop: 16, paddingBottom: 6 },
  title: { color: colors.text, fontSize: 17, fontWeight: '800', flex: 1 }, close: { color: colors.accentText, fontSize: 13, fontWeight: '700' },
  body: { padding: 18, paddingTop: 8, paddingBottom: 40, gap: 12 },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  choice: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceRaised },
  choiceOn: { borderColor: colors.amber, backgroundColor: colors.amberSoft },
  choiceText: { color: colors.secondary, fontSize: 12, fontWeight: '700' }, choiceTextOn: { color: colors.amber },
});
