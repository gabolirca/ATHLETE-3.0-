import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '@/theme/colors';

const OPTIONS = [
  { key: 'load', icon: 'clipboard-outline', title: 'Cargar mi plan', detail: 'Captura el plan que te dio tu nutriólogo: tiempos de comida y raciones del SMAE.', to: '/nutrition/plan-editor' },
  { key: 'pro', icon: 'medkit-outline', title: 'Con mi nutriólogo', detail: 'Vincúlate con su código y él te asigna el plan desde su cuenta.', to: '/nutrition/pro' },
  { key: 'app', icon: 'calculator-outline', title: 'Plan que calcula la app', detail: 'Una sugerencia con fórmulas generales a partir de tus datos. No es un plan profesional.', to: '/nutrition/estimate' },
] as const;

/** Las tres formas de tener un plan de nutrición. Se ven en Nutrición (sin meta) y en "Tu plan de nutrición". */
export function NutritionOptions() {
  const router = useRouter();
  return <View style={s.list}>
    {OPTIONS.map((o) => <Pressable key={o.key} accessibilityRole="button" accessibilityLabel={o.title} onPress={() => router.push(o.to as never)} style={s.row}>
      <View style={s.icon}><Ionicons name={o.icon as never} size={20} color={colors.blue}/></View>
      <View style={s.flex}><Text style={s.title}>{o.title}</Text><Text style={s.detail}>{o.detail}</Text></View>
      <Ionicons name="chevron-forward" size={18} color={colors.secondary}/>
    </Pressable>)}
  </View>;
}

const s = StyleSheet.create({
  list: { gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 14, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  icon: { width: 38, height: 38, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accentSoft },
  flex: { flex: 1, gap: 3 },
  title: { color: colors.text, fontSize: 14, fontWeight: '800' },
  detail: { color: colors.secondary, fontSize: 11, lineHeight: 16 },
});
