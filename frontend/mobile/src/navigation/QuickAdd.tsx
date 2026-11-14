import { useState } from 'react';
import { useRouter, type Href } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '@/theme/colors';

/** Lo que se puede registrar desde el "+" de la barra (como Instagram/Strava): a un toque desde cualquier pantalla. */
export const QUICK_ACTIONS: ReadonlyArray<{ key: string; label: string; detail: string; icon: string; href: Href }> = [
  { key: 'strength', label: 'Entrenamiento de fuerza', detail: 'Rutina o sesión libre', icon: 'barbell-outline', href: '/workout/new' },
  { key: 'cardio', label: 'Cardio', detail: 'Correr, nadar, bici, remo, funcional', icon: 'pulse-outline', href: '/cardio/new' },
  { key: 'meal', label: 'Comida', detail: 'Registro de nutrición', icon: 'restaurant-outline', href: '/nutrition/new' },
  { key: 'body', label: 'Peso o medida', detail: 'En Progreso', icon: 'scale-outline', href: '/progress' },
];

/** Botón central "+" de la barra de pestañas; abre una hoja con las acciones de registro. */
export function QuickAddButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const go = (href: Href) => { setOpen(false); router.push(href); };
  return <>
    <View style={s.slot}>
      <Pressable accessibilityRole="button" accessibilityLabel="Registrar" onPress={() => setOpen(true)} style={({ pressed }) => [s.fab, pressed && s.pressed]}>
        <Ionicons name="add" size={30} color="white"/>
      </Pressable>
    </View>
    <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
      <Pressable style={s.backdrop} accessibilityLabel="Cerrar" onPress={() => setOpen(false)}/>
      <View style={s.sheet}>
        <Text style={s.title}>¿Qué quieres registrar?</Text>
        {QUICK_ACTIONS.map((a) => <Pressable key={a.key} accessibilityRole="button" accessibilityLabel={a.label} onPress={() => go(a.href)} style={({ pressed }) => [s.row, pressed && s.pressed]}>
          <View style={s.icon}><Ionicons name={a.icon as never} size={22} color={colors.blue}/></View>
          <View style={s.flex}><Text style={s.label}>{a.label}</Text><Text style={s.detail}>{a.detail}</Text></View>
          <Ionicons name="chevron-forward" size={18} color={colors.secondary}/>
        </Pressable>)}
      </View>
    </Modal>
  </>;
}

const s = StyleSheet.create({
  slot: { flex: 1, alignItems: 'center', justifyContent: 'flex-start' },
  fab: { width: 54, height: 54, borderRadius: 27, marginTop: -14, backgroundColor: colors.blue, alignItems: 'center', justifyContent: 'center', shadowColor: colors.blue, shadowOpacity: 0.5, shadowRadius: 10, elevation: 6 },
  pressed: { opacity: 0.8 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 18, paddingBottom: 36, gap: 8, borderWidth: 1, borderColor: colors.border },
  title: { color: colors.text, fontSize: 17, fontWeight: '800', marginBottom: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 14, backgroundColor: colors.surfaceRaised },
  icon: { width: 42, height: 42, borderRadius: 13, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' },
  flex: { flex: 1 },
  label: { color: colors.text, fontSize: 15, fontWeight: '800' },
  detail: { color: colors.secondary, fontSize: 12 },
});
