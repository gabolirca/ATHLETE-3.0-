import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/theme/colors';
import { QuickAddButton } from '@/navigation/QuickAdd';

/**
 * Barra: Inicio · Entrenar · ＋ · Progreso · Nutrición.
 * El "+" central abre la hoja de registro (fuerza, cardio, comida, peso). Perfil no va en la barra: se abre desde
 * el avatar de Inicio (como Instagram) como pantalla encima de las pestañas (`app/profile.tsx`). Una pestaña oculta
 * con `href: null` regresaba a Inicio al abrirla (bug 8-nov).
 */
const items = [
  { name: 'index', title: 'Inicio', icon: 'grid-outline', active: 'grid' },
  { name: 'train', title: 'Entrenar', icon: 'barbell-outline', active: 'barbell' },
  { name: 'progress', title: 'Progreso', icon: 'stats-chart-outline', active: 'stats-chart' },
  { name: 'nutrition', title: 'Nutrición', icon: 'nutrition-outline', active: 'nutrition' },
] as const;

export default function TabLayout() {
  const tab = (item: (typeof items)[number]) => <Tabs.Screen key={item.name} name={item.name} options={{
    title: item.title,
    tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? item.active : item.icon} size={21} color={typeof color === 'string' ? color : colors.blue} />,
  }} />;
  return (
    <Tabs screenOptions={{
      headerShown: false,
      tabBarActiveTintColor: colors.blue,
      tabBarInactiveTintColor: colors.muted,
      tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border, height: 84, paddingTop: 10, paddingBottom: 24 },
      tabBarLabelStyle: { fontSize: 10, fontWeight: '600' },
    }}>
      {tab(items[0])}
      {tab(items[1])}
      <Tabs.Screen name="add" options={{ title: 'Registrar', tabBarLabel: () => null, tabBarButton: () => <QuickAddButton/> }} />
      {tab(items[2])}
      {tab(items[3])}
    </Tabs>
  );
}
