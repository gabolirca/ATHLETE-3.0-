import { useEffect, useState } from 'react';
import { Text } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import * as SQLite from 'expo-sqlite';
import { Directory, File } from 'expo-file-system';
import { Screen } from '@/components/Screen';
import { Title } from '@/components/Typography';
import { EmptyState } from '@/components/EmptyState';
import { getCloud } from '@/account/cloud';
import { useAthleteData } from '@/data/AthleteDataProvider';
import { eraseDevice, type EraseResult } from '@/data/eraseDevice';
import { colors } from '@/theme/colors';

/** Pantalla final de "Borrar todo de este teléfono": borra y pide reabrir la app. */
export default function EraseScreen() {
  const { data } = useAthleteData();
  const [result, setResult] = useState<EraseResult | null>(null);
  useEffect(() => {
    const dir = new Directory(SQLite.defaultDatabaseDirectory);
    void eraseDevice({
      signOut: async () => { await getCloud()?.auth.signOut(); },
      closeData: async () => { await data?.close(); },
      listFiles: async () => (dir.exists ? dir.list().filter((e): e is File => e instanceof File).map((f) => f.name) : []),
      deleteFile: async (name) => { new File(dir, name).delete(); },
      deleteKey: (key) => SecureStore.deleteItemAsync(key),
    }).then(setResult);
    // Solo una vez: después de borrar, la app tiene que reabrirse.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <Screen>
    <Title>ATHLETE</Title>
    {!result ? <EmptyState icon="hourglass-outline" title="Borrando este teléfono…" detail="No cierres la app."/>
      : <EmptyState icon="checkmark-circle-outline" title="Listo: el teléfono quedó en blanco"
          detail={'Cierra ATHLETE por completo (desliza hacia arriba) y vuelve a abrirla para registrarte desde cero.' + (result.failed.length ? `\n\nNo se pudo borrar: ${result.failed.join(', ')}.` : '')}/>}
    <Text style={{ color: colors.muted, fontSize: 11 }}>No uses la app hasta reabrirla.</Text>
  </Screen>;
}
