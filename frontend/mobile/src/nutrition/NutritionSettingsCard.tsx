import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Card } from '@/components/Card';
import { Eyebrow } from '@/components/Typography';
import { colors, themed } from '@/theme/colors';
import { IconTile, TILE } from '@/components/IconTile';

/** Ajustes → Nutrición: cambiar de plan en cualquier momento (aunque ya tengas uno). */
export function NutritionSettingsCard() {
  const router = useRouter();
  const rows = [
    { key: 'plan', icon: 'restaurant-outline', title: 'Tu plan de nutrición', detail: 'Calculado por la app o cargando tu propio plan.', to: '/nutrition/plan' },
  ];
  return <Card>
    <Eyebrow>NUTRICIÓN</Eyebrow>
    {rows.map((r) => <Pressable key={r.key} accessibilityRole="button" accessibilityLabel={r.title} onPress={() => router.push(r.to as never)} style={s.row}>
      <IconTile icon={r.key === 'pro' ? 'stethoscope' : 'food-apple'} color={r.key === 'pro' ? TILE.teal : TILE.amber}/>
      <View style={s.flex}><Text style={s.title}>{r.title}</Text><Text style={s.detail}>{r.detail}</Text></View>
      <Ionicons name="chevron-forward" size={18} color={colors.secondary}/>
    </Pressable>)}
  </Card>;
}

const s = themed(() => StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  flex: { flex: 1, gap: 2 },
  title: { color: colors.text, fontSize: 14, fontWeight: '700' },
  detail: { color: colors.secondary, fontSize: 11, lineHeight: 16 },
}));
