import { MaterialCommunityIcons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

/** Cuadrito de color con ícono blanco (como los Ajustes de iPhone): cada opción con su color. */
export function IconTile({ icon, color, size = 32 }: { icon: string; color: string; size?: number }) {
  return <View style={[s.tile, { width: size, height: size, borderRadius: size * 0.28, backgroundColor: color }]}>
    <MaterialCommunityIcons name={icon as never} size={size * 0.58} color="white"/>
  </View>;
}
const s = StyleSheet.create({ tile: { alignItems: 'center', justifyContent: 'center' } });

/** Paleta de los cuadritos (fija en claro y oscuro, como en iOS). */
export const TILE = { red: '#1769FF', green: '#1DB97A', amber: '#F2A31B', blue: '#2F7CF6', purple: '#8B5CF6', gray: '#6B6B6B', pink: '#E8457C', teal: '#0EA5A4' } as const;
