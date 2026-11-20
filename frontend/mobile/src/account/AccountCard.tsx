import { useRouter } from 'expo-router';
import { Alert, StyleSheet, Text } from 'react-native';
import { ActionButton } from '@/components/ActionButton';
import { Card } from '@/components/Card';
import { Eyebrow, Label } from '@/components/Typography';
import { colors, themed } from '@/theme/colors';
import { useAccount } from './AccountProvider';

export function AccountCard() {
  const router = useRouter();
  const account = useAccount();

  if (!account.available) {
    return <Card><Eyebrow>CUENTA</Eyebrow><Label>Modo local</Label><Text style={s.note}>Esta compilación no tiene la nube configurada. Tus datos se guardan solo en este dispositivo.</Text></Card>;
  }
  if (account.auth?.status !== 'signed_in') {
    return <Card>
      <Eyebrow>CUENTA</Eyebrow><Label>Respalda tus entrenamientos</Label>
      <Text style={s.note}>Ahora tus datos viven solo en este teléfono. Inicia sesión para respaldarlos en la nube y no perderlos si cambias de dispositivo.</Text>
      <ActionButton onPress={() => router.push('/account/login')}>Iniciar sesión o crear cuenta</ActionButton>
    </Card>;
  }

  // La sincronización es automática (y al deslizar hacia abajo en cualquier pantalla): aquí no se muestra.
  // Solo se avisa si algo lleva tiempo sin poder subir, para que la persona no pierda datos sin saberlo.
  const { status, error } = account.sync;
  const stuck = (status?.pendingCount ?? 0) > 0 && Boolean(error);
  return <Card>
    <Eyebrow>CUENTA</Eyebrow>
    <Label>{account.auth.user.email ?? 'Cuenta activa'}</Label>
    {account.link === 'other-account'
      ? <Text accessibilityRole="alert" style={s.warning}>Este dispositivo ya guarda datos de otra cuenta. Para no mezclar información de dos personas, no se sincronizará con esta cuenta.</Text>
      : stuck ? <Text accessibilityRole="alert" style={s.warning}>Hay cambios que aún no se suben. Desliza hacia abajo en Inicio con internet para intentarlo de nuevo.</Text>
      : <Text style={s.note}>Tus entrenamientos se respaldan solos en tu cuenta.</Text>}
    <ActionButton secondary onPress={() => router.push({ pathname: '/account/password', params: { mode: account.auth?.status === 'signed_in' && account.auth.user.hasPassword ? 'change' : 'create' } } as never)}>
      {account.auth.user.hasPassword ? 'Cambiar contraseña' : 'Crear contraseña'}
    </ActionButton>
    <ActionButton secondary onPress={() => Alert.alert('Cerrar sesión', 'Tus datos se quedan en este teléfono. Lo que no se haya sincronizado se subirá cuando vuelvas a iniciar sesión.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Cerrar sesión', style: 'destructive', onPress: () => void account.signOut() },
    ])}>Cerrar sesión</ActionButton>
  </Card>;
}

const s = themed(() => StyleSheet.create({
  note: { color: colors.secondary, fontSize: 11, lineHeight: 17 },
  warning: { color: colors.amber, fontSize: 11, lineHeight: 16 },
}));
