import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Screen } from '@/components/Screen';
import { Eyebrow, Title } from '@/components/Typography';
import { NutritionOptions } from '@/nutrition/NutritionOptions';
import { colors } from '@/theme/colors';

/** Tu plan de nutrición: las tres opciones (cargar, con nutriólogo o calculado por la app) y metas sueltas. */
export default function NutritionPlanScreen() {
  const router = useRouter();
  return <Screen>
    <View><Eyebrow>NUTRICIÓN</Eyebrow><Title>Tu plan de nutrición</Title></View>
    <Text style={s.detail}>Elige cómo quieres llevar tu alimentación. Puedes cambiar de opción cuando quieras.</Text>
    <NutritionOptions/>
    <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/nutrition/target', params: { source: 'manual' } })} style={s.more}>
      <Text style={s.link}>Solo quiero fijar calorías y macros</Text>
    </Pressable>
  </Screen>;
}

const s = StyleSheet.create({
  detail: { color: colors.secondary, fontSize: 12, lineHeight: 18 },
  more: { alignSelf: 'center', paddingVertical: 10 },
  link: { color: colors.blue, fontSize: 13, fontWeight: '800' },
});
