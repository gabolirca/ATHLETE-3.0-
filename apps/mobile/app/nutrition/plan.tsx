import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { ActionButton } from '@/components/ActionButton';
import { Card } from '@/components/Card';
import { Screen } from '@/components/Screen';
import { Eyebrow, Label, Title } from '@/components/Typography';
import { colors } from '@/theme/colors';

export default function NutritionPlanScreen() {
  const router = useRouter();
  return <Screen>
    <View><Eyebrow>NUTRICIÓN</Eyebrow><Title>Tu meta diaria</Title></View>
    <Card accent={colors.blue}>
      <Label>Tengo un plan de mi nutriólogo</Label>
      <Text style={s.detail}>Captura las calorías y macros que te indicó. Es la mejor opción: un plan hecho para ti.</Text>
      <ActionButton onPress={() => router.push({ pathname: '/nutrition/target', params: { source: 'professional' } })}>Capturar mi plan</ActionButton>
      <Text style={s.soon}>Próximamente: subir el plan completo (comidas, horarios y equivalentes) con una plantilla estándar.</Text>
    </Card>
    <Card>
      <Label>Calcular un plan provisional</Label>
      <Text style={s.detail}>Una estimación con fórmulas generales a partir de tu edad, estatura, peso, actividad y objetivo. Es una sugerencia, no un plan profesional.</Text>
      <ActionButton secondary onPress={() => router.push('/nutrition/estimate')}>Calcular plan provisional</ActionButton>
    </Card>
    <Card>
      <Label>Fijar mis propias metas</Label>
      <Text style={s.detail}>Si ya sabes cuántas calorías y macros quieres, escríbelas.</Text>
      <ActionButton secondary onPress={() => router.push({ pathname: '/nutrition/target', params: { source: 'manual' } })}>Escribir mis metas</ActionButton>
    </Card>
  </Screen>;
}

const s = StyleSheet.create({
  detail: { color: colors.secondary, fontSize: 12, lineHeight: 18 },
  soon: { color: colors.muted, fontSize: 11, lineHeight: 16 },
});
