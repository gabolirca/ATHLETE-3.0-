import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/theme/colors';

/**
 * Barra de 4 pestañas: Inicio · Entrenar · Nutrición · Progreso.
 * Perfil se abre desde el avatar. Nada de pestañas ocultas con
 * `href: null`: regresaban a Inicio al abrirlas (bug 8-nov).
 */
const items = [
  { name: 'index', title: 'Inicio', icon: 'home-outline', active: 'home' },
  { name: 'train', title: 'Entrenar', icon: 'barbell-outline', active: 'barbell' },
  { name: 'nutrition', title: 'Nutrición', icon: 'nutrition-outline', active: 'nutrition' },
  { name: 'progress', title: 'Progreso', icon: 'stats-chart-outline', active: 'stats-chart' },
] as const;

export default function TabLayout() {
  return (
    <Tabs screenOptions={{
      headerShown: false,
      tabBarActiveTintColor: colors.text,
      tabBarInactiveTintColor: colors.secondary,
      tabBarStyle: { backgroundColor: colors.black, borderTopColor: colors.border, height: 86, paddingTop: 10, paddingBottom: 24 },
      tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
    }}>
      {items.map((item) => <Tabs.Screen key={item.name} name={item.name} options={{
        title: item.title,
        tabBarIcon: ({ focused }) => <Ionicons name={focused ? item.active : item.icon} size={22} color={focused ? colors.blue : colors.secondary} />,
      }} />)}
    </Tabs>
  );
}
