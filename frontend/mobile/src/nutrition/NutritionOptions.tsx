import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, themed } from '@/theme/colors';
import { FEATURES } from '@/config/features';
import { displayBold } from '@/theme/fonts';

const OPTIONS = [
  { key: 'app', icon: 'calculator-outline', title: 'Plan que calcula la app', detail: 'Una sugerencia con fórmulas generales a partir de tus datos. No es un plan profesional.', to: '/nutrition/estimate' },
  { key: 'load', icon: 'clipboard-outline', title: 'Cargar mi plan', detail: 'Captura tu plan (por ejemplo, el de tu nutriólogo): tiempos de comida y raciones del SMAE.', to: '/nutrition/plan-editor' },
] as const;

/** Formas de tener un plan de nutrición en ATHLETE: el que calcula la app o cargar el tuyo. */
export function NutritionOptions() {
  const router = useRouter();
  return <View style={s.list}>
    {OPTIONS.filter((o) => o.key !== 'app' || FEATURES.nutritionCalc).map((o) => <Pressable key={o.key} accessibilityRole="button" accessibilityLabel={o.title} onPress={() => router.push(o.to as never)} style={s.row}>
      <View style={s.icon}><Ionicons name={o.icon as never} size={20} color={colors.blue}/></View>
      <View style={s.flex}><Text style={s.title}>{o.title}</Text><Text style={s.detail}>{o.detail}</Text></View>
      <Ionicons name="chevron-forward" size={18} color={colors.secondary}/>
    </Pressable>)}
  </View>;
}

const s = themed(() => StyleSheet.create({
  list: { gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, minHeight: 72, borderRadius: 14, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  icon: { width: 38, height: 38, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accentSoft },
  flex: { flex: 1, gap: 3 },
  title: { color: colors.text, fontSize: 21, lineHeight: 23, ...displayBold },
  detail: { color: colors.secondary, fontSize: 12, lineHeight: 17 },
}));
