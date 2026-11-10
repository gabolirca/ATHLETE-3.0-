import { useRouter } from 'expo-router';
import { Alert, StyleSheet, Text } from 'react-native';
import { ActionButton } from '@/components/ActionButton';
import { Card } from '@/components/Card';
import { Eyebrow, Label } from '@/components/Typography';
import { colors } from '@/theme/colors';
import { useAccount } from './AccountProvider';

function when(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' }) : 'nunca';
}

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

  const { status, syncing, error } = account.sync;
  const pending = status?.pendingCount ?? 0;
  return <Card>
    <Eyebrow>CUENTA</Eyebrow>
    <Label>{account.auth.user.email ?? 'Cuenta activa'}</Label>
    {account.link === 'other-account'
      ? <Text accessibilityRole="alert" style={s.warning}>Este dispositivo ya guarda datos de otra cuenta. Para no mezclar información de dos personas, no se sincronizará con esta cuenta.</Text>
      : <>
        <Text style={s.note}>{pending > 0 ? `${pending} cambio(s) pendiente(s) de subir` : 'Todo respaldado'} · Última sincronización: {when(status?.lastPullAt ?? null)}</Text>
        {error ? <Text accessibilityRole="alert" style={s.warning}>{error}</Text> : null}
        <ActionButton secondary onPress={() => void account.syncNow()} loading={syncing} disabled={account.link !== 'linked'}>Sincronizar ahora</ActionButton>
      </>}
    <ActionButton secondary onPress={() => Alert.alert('Cerrar sesión', 'Tus datos se quedan en este teléfono. Lo que no se haya sincronizado se subirá cuando vuelvas a iniciar sesión.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Cerrar sesión', style: 'destructive', onPress: () => void account.signOut() },
    ])}>Cerrar sesión</ActionButton>
  </Card>;
}

const s = StyleSheet.create({
  note: { color: colors.secondary, fontSize: 11, lineHeight: 17 },
  warning: { color: colors.amber, fontSize: 11, lineHeight: 16 },
});
