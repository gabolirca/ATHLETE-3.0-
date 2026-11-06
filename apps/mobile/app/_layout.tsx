import { useCallback, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { colors } from '@/theme/colors';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Screen } from '@/components/Screen';
import { Eyebrow, Title } from '@/components/Typography';
import { EmptyState } from '@/components/EmptyState';
import { Card } from '@/components/Card';
import { ActionButton } from '@/components/ActionButton';
import { AthleteDataProvider, useAthleteData } from '@/data/AthleteDataProvider';
import { OfficialTrainingProvider } from '@/data/OfficialTrainingProvider';
import { AccountProvider } from '@/account/AccountProvider';
import type { OpenErrorSelection } from '@athlete/data';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <AthleteDataProvider>
        <RootStorageGate />
      </AthleteDataProvider>
    </SafeAreaProvider>
  );
}

function AppStack() {
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.black } }}>
      <Stack.Screen name="(tabs)" />
    </Stack>
  );
}

function RootStorageGate() {
  const { status, kind, store, error, actionError, retry, startNewStore } = useAthleteData();

  if (status === 'opening') {
    return (
      <Screen>
        <Title>ATHLETE</Title>
        <EmptyState
          icon="hourglass-outline"
          title="Preparando almacenamiento local…"
          detail="Verificando integridad y seguridad de tus datos."
        />
      </Screen>
    );
  }

  if (status === 'error') {
    return (
      <Screen>
        <Title>ATHLETE</Title>
        <EmptyState
          icon="alert-circle-outline"
          title="No pudimos abrir tus datos locales"
          detail={error?.message ?? 'Ocurrió un error inesperado al acceder al almacenamiento.'}
          action="Reintentar"
          onAction={retry}
        />
      </Screen>
    );
  }

  if (kind === 'blocked' && store?.kind === 'blocked') {
    return (
      <StorageRecoveryView
        selection={store.selection}
        actionError={actionError}
        onRetry={retry}
        onStartNewStore={startNewStore}
      />
    );
  }

  if (kind === 'official') {
    return (
      <AccountProvider>
        <OfficialTrainingProvider>
          <AppStack />
        </OfficialTrainingProvider>
      </AccountProvider>
    );
  }

  return null;
}

function StorageRecoveryView({
  selection,
  actionError,
  onRetry,
  onStartNewStore,
}: {
  selection: OpenErrorSelection;
  actionError: Error | null;
  onRetry: () => void;
  onStartNewStore: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const { code, message, accountLinked, recovery } = selection;

  const handleStartNewStore = useCallback(() => {
    Alert.alert(
      'Iniciar almacenamiento nuevo',
      'Tus datos anteriores se conservarán intactos en este dispositivo, pero dejarán de mostrarse en la aplicación. ¿Deseas crear una nueva base de datos local?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Crear nuevo almacén',
          style: 'destructive',
          onPress: () => {
            setBusy(true);
            // onStartNewStore nunca rechaza: los errores llegan como `actionError`.
            void onStartNewStore().finally(() => setBusy(false));
          },
        },
      ]
    );
  }, [onStartNewStore]);

  return (
    <Screen>
      <Title>ATHLETE</Title>
      <Card accent={colors.red}>
        <Eyebrow>ESTADO DEL ALMACENAMIENTO</Eyebrow>
        <Text style={styles.recoveryTitle}>Atención requerida con tus datos</Text>
        <Text style={styles.recoveryDetail}>{message}</Text>
        <Text style={styles.recoveryCode}>Código de estado: {code}</Text>
        {accountLinked ? (
          <View style={styles.recoveryNoticeBox}>
            <Text style={styles.recoveryNotice}>
              Tus datos sincronizados se recuperarán al iniciar sesión con tu cuenta.
            </Text>
          </View>
        ) : null}
        {actionError ? (
          <Text accessibilityRole="alert" style={styles.recoveryActionError}>
            No se pudo completar la acción: {actionError.message}
          </Text>
        ) : null}
        <View style={styles.recoveryActions}>
          {recovery.includes('retry') ? (
            <ActionButton onPress={onRetry}>Reintentar</ActionButton>
          ) : null}
          {recovery.includes('start-new-store') ? (
            <ActionButton secondary onPress={handleStartNewStore} loading={busy}>
              Comenzar nuevo almacén
            </ActionButton>
          ) : null}
        </View>
        <Text style={styles.recoveryNote}>
          Tus datos locales no fueron eliminados. Ninguna base existente se sobrescribirá automáticamente.
        </Text>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  recoveryTitle: { color: colors.text, fontSize: 18, fontWeight: '800', marginTop: 4 },
  recoveryDetail: { color: colors.secondary, fontSize: 13, lineHeight: 19, marginTop: 6 },
  recoveryCode: { color: colors.muted, fontSize: 11, marginTop: 8 },
  recoveryNoticeBox: { backgroundColor: '#172849', borderRadius: 10, padding: 12, marginTop: 10 },
  recoveryNotice: { color: '#9DBDFF', fontSize: 12, lineHeight: 17, fontWeight: '600' },
  recoveryActionError: { color: colors.red, fontSize: 12, lineHeight: 17, fontWeight: '700', marginTop: 10 },
  recoveryActions: { gap: 10, marginTop: 16 },
  recoveryNote: { color: colors.secondary, fontSize: 11, lineHeight: 16, marginTop: 12, textAlign: 'center' },
});
