import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LOCKUP_RATIO, lockupFor } from '@/brand/assets';
import { useAvatar } from '@/profile/avatar';
import { colors, themed, themeMode } from '@/theme/colors';

/** Encabezado de las pestañas: logo de ATHLETE a la izquierda y el perfil a la derecha. */
export function BrandHeader({ initials }: { initials?: string }) {
  const router = useRouter();
  const avatar = useAvatar();
  return <View style={s.row}>
    <Image source={lockupFor(themeMode)} accessibilityLabel="ATHLETE" resizeMode="contain" style={s.logo}/>
    <Pressable accessibilityRole="button" accessibilityLabel="Abrir perfil" onPress={() => router.push('/profile')} style={s.avatar}>
      {avatar ? <Image source={{ uri: avatar }} style={s.avatarImg}/> : initials ? <Text style={s.initials}>{initials}</Text> : <Ionicons name="person" size={18} color={colors.secondary}/>}
    </Pressable>
  </View>;
}

const s = themed(() => StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  logo: { height: 22, width: 22 * LOCKUP_RATIO },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  avatarImg: { width: 44, height: 44 }, initials: { color: colors.text, fontSize: 14, fontWeight: '700' },
}));
