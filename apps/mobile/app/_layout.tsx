import { useCallback, useState } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { colors } from '@/theme/colors';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { SQLiteProvider } from 'expo-sqlite';
import { initializeAthleteDatabase, isLocalDatabaseError } from '@/data/database';
import { LocalTrainingProvider } from '@/data/LocalTrainingProvider';
import { Screen } from '@/components/Screen';
import { Title } from '@/components/Typography';
import { EmptyState } from '@/components/EmptyState';
import { AthleteDataProvider } from '@/data/AthleteDataProvider';
import { OfficialTrainingProvider } from '@/data/OfficialTrainingProvider';

export default function RootLayout() {
  const officialDataEnabled = process.env.EXPO_PUBLIC_ATHLETE_DATA_LAYER === 'official';
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      {officialDataEnabled
        ? <AthleteDataProvider><OfficialTrainingProvider><AppStack /></OfficialTrainingProvider></AthleteDataProvider>
        : <LegacyDataRuntime />}
    </SafeAreaProvider>
  );
}

function AppStack() {
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.black } }}>
    <Stack.Screen name="(tabs)" />
  </Stack>;
}

function LegacyDataRuntime() {
  const [initError, setInitError] = useState<Error | null>(null);
  const [attempt, setAttempt] = useState(0);
  // Without onError, SQLiteProvider rethrows during render and any storage failure crashes the app.
  // It calls onError while rendering, so defer the state update out of that render.
  const handleInitError = useCallback((error: Error) => { queueMicrotask(() => setInitError(error)); }, []);
  const retry = useCallback(() => { setInitError(null); setAttempt((value) => value + 1); }, []);

  if (initError) {
    // Retry is offered only when it cannot lose data; this screen never deletes or recreates the database.
    const recoverable = isLocalDatabaseError(initError) && initError.recoverable;
    return (
      <>
        <Screen>
          <Title>ATHLETE</Title>
          <EmptyState
            icon="lock-closed-outline"
            title="No pudimos abrir tus datos locales"
            detail={recoverable
              ? 'Tus datos siguen en el dispositivo. Desbloquéalo y vuelve a intentar.'
              : `Tus datos no se modificaron. Código: ${isLocalDatabaseError(initError) ? initError.code : 'desconocido'}.`}
            action={recoverable ? 'Reintentar' : undefined}
            onAction={recoverable ? retry : undefined}
          />
        </Screen>
      </>
    );
  }

  return (
    <SQLiteProvider key={attempt} databaseName="athlete3.db" onInit={initializeAthleteDatabase} onError={handleInitError}>
      <LocalTrainingProvider><AppStack /></LocalTrainingProvider>
    </SQLiteProvider>
  );
}
