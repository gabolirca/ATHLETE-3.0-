import { useCallback, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Card } from '@/components/Card';
import { Eyebrow } from '@/components/Typography';
import { fetchProStatus } from '@/pro/proApi';
import { colors } from '@/theme/colors';

/** Ajustes → Nutrición: cambiar de plan en cualquier momento (aunque ya tengas uno) y el modo nutriólogo. */
export function NutritionSettingsCard() {
  const router = useRouter();
  const [isNutritionist, setIsNutritionist] = useState(false);
  useFocusEffect(useCallback(() => {
    fetchProStatus().then((s) => setIsNutritionist(Boolean(s?.isNutritionist))).catch(() => undefined);
  }, []));
  const rows = [
    { key: 'plan', icon: 'restaurant-outline', title: 'Tu plan de nutrición', detail: 'Cargar tu plan, estar con tu nutriólogo o el plan que calcula la app.', to: '/nutrition/plan' },
    ...(isNutritionist ? [{ key: 'pro', icon: 'people-outline', title: 'Modo nutriólogo', detail: 'Tus clientes y sus planes.', to: '/pro' }] : []),
  ];
  return <Card>
    <Eyebrow>NUTRICIÓN</Eyebrow>
    {rows.map((r) => <Pressable key={r.key} accessibilityRole="button" accessibilityLabel={r.title} onPress={() => router.push(r.to as never)} style={s.row}>
      <Ionicons name={r.icon as never} size={19} color={colors.blue}/>
      <View style={s.flex}><Text style={s.title}>{r.title}</Text><Text style={s.detail}>{r.detail}</Text></View>
      <Ionicons name="chevron-forward" size={18} color={colors.secondary}/>
    </Pressable>)}
  </Card>;
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  flex: { flex: 1, gap: 2 },
  title: { color: colors.text, fontSize: 14, fontWeight: '700' },
  detail: { color: colors.secondary, fontSize: 11, lineHeight: 16 },
});
