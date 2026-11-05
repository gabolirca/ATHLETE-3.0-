import { View } from 'react-native';
import { EmptyState } from '@/components/EmptyState';
import { Eyebrow, Title } from '@/components/Typography';
import { Screen } from '@/components/Screen';

export default function NutritionScreen() {
  return <Screen>
    <View><Eyebrow>REGISTRO MANUAL · PRÓXIMAMENTE</Eyebrow><Title>Nutrición</Title></View>
    <EmptyState icon="nutrition-outline" title="Todavía no hay registros nutricionales" detail="ATHLETE aún no cuenta con un contrato o servicio de nutrición. No mostramos estimaciones ni comidas ficticias." />
  </Screen>;
}
