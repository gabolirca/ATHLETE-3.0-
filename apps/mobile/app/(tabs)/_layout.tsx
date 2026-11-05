import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/theme/colors';

const items = [
  { name: 'index', title: 'Inicio', icon: 'grid-outline', active: 'grid' },
  { name: 'train', title: 'Entrenar', icon: 'barbell-outline', active: 'barbell' },
  { name: 'progress', title: 'Progreso', icon: 'stats-chart-outline', active: 'stats-chart' },
  { name: 'nutrition', title: 'Nutrición', icon: 'nutrition-outline', active: 'nutrition' },
  { name: 'profile', title: 'Perfil', icon: 'person-outline', active: 'person' },
] as const;

export default function TabLayout() {
  return (
    <Tabs screenOptions={{
      headerShown: false,
      tabBarActiveTintColor: colors.blue,
      tabBarInactiveTintColor: colors.muted,
      tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border, height: 84, paddingTop: 10, paddingBottom: 24 },
      tabBarLabelStyle: { fontSize: 10, fontWeight: '600' },
    }}>
      {items.map((item) => (
        <Tabs.Screen key={item.name} name={item.name} options={{
          title: item.title,
          tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? item.active : item.icon} size={21} color={typeof color === "string" ? color : colors.blue} />,
        }} />
      ))}
    </Tabs>
  );
}
