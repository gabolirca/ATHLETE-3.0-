import { useCallback, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { useAccount } from '@/account/AccountProvider';
import { CoachComments } from '@/coach/CoachComments';
import { ActionButton } from '@/components/ActionButton';
import { AppInput } from '@/components/AppInput';
import { Card } from '@/components/Card';
import { Screen } from '@/components/Screen';
import { Eyebrow, Label, Title } from '@/components/Typography';
import { proApi, type ProStatus } from '@/pro/proApi';
import { colors } from '@/theme/colors';

/** "Con mi coach": el atleta se vincula con el código de su coach; recibe programas y comentarios por sync. */
export default function MyCoachScreen() {
  const router = useRouter();
  const account = useAccount();
  const signedIn = account.auth?.status === 'signed_in';
  const [status, setStatus] = useState<ProStatus | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!signedIn) return;
    proApi.status().then((s) => { setStatus(s); setError(null); }).catch((e: unknown) => setError(e instanceof Error ? e.message : 'No se pudo consultar.'));
  }, [signedIn]);
  useFocusEffect(load);

  async function link() {
    if (busy) return;
    if (!/^[A-Za-z2-9]{8}$/.test(code.trim())) { setError('El código tiene 8 letras y números.'); return; }
    setBusy(true); setError(null); setMessage(null);
    try {
      const r = await proApi.acceptInvite(code);
      setMessage(r.scope === 'nutrition'
        ? `Ese código era de nutrición: ahora ${r.name} es tu nutriólogo.`
        : `Listo: ahora ${r.name} es tu coach. Sus programas aparecerán en Entrenar.`);
      await account.syncNow().catch(() => undefined);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo vincular.');
    } finally { setBusy(false); }
  }

  async function refresh() {
    setBusy(true); setError(null);
    try { await account.syncNow(); setMessage('Actualizado.'); load(); } catch { setError('No se pudo sincronizar. Revisa tu conexión.'); } finally { setBusy(false); }
  }

  function unlink(linkId: string, name: string) {
    Alert.alert('Terminar vínculo', `${name} ya no verá tu entrenamiento ni podrá asignarte programas. Lo que ya tienes se queda contigo.`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Terminar', style: 'destructive', onPress: () => {
        proApi.endLink(linkId).then(() => { setMessage('Vínculo terminado.'); load(); })
          .catch((e: unknown) => setError(e instanceof Error ? e.message : 'No se pudo terminar el vínculo.'));
      } },
    ]);
  }

  const coach = status?.coach ?? null;
  return <Screen>
    <View><Eyebrow>ENTRENAMIENTO</Eyebrow><Title>Con mi coach</Title></View>
    {!account.available ? <Card><Text style={s.detail}>Esta compilación no tiene la nube configurada; esta función necesita cuenta en línea.</Text></Card>
    : !signedIn ? <Card>
      <Label>Inicia sesión para vincularte</Label>
      <Text style={s.detail}>Tu coach te asigna programas, ve tu progreso y te deja comentarios. Para eso necesitas tu cuenta.</Text>
      <ActionButton onPress={() => router.push('/account/login')}>Iniciar sesión o crear cuenta</ActionButton>
    </Card>
    : coach ? <>
      <Card accent={colors.blue}>
        <Label>Tu coach: {coach.name}</Label>
        <Text style={s.detail}>Desde el {new Date(coach.since).toLocaleDateString('es-MX')}. Ve tus sesiones, cardio y récords (no tu nutrición). Sus programas aparecen en Entrenar con su nombre.</Text>
        <ActionButton secondary onPress={() => void refresh()} loading={busy}>Buscar programas y mensajes nuevos</ActionButton>
      </Card>
      <CoachComments title="MENSAJES DE TU COACH"/>
      <ActionButton secondary onPress={() => unlink(coach.linkId, coach.name)}>Terminar vínculo</ActionButton>
    </>
    : <Card>
      <Label>Vincúlate con tu coach</Label>
      <Text style={s.detail}>Pídele su código (8 letras y números). Podrá ver tu entrenamiento y asignarte programas; puedes terminar el vínculo cuando quieras.</Text>
      <AppInput label="Código" value={code} onChangeText={(t) => setCode(t.toUpperCase())} autoCapitalize="characters" autoCorrect={false} maxLength={8} placeholder="ABCD2345"/>
      <ActionButton onPress={() => void link()} loading={busy}>Vincular</ActionButton>
    </Card>}
    {message ? <Text style={s.ok}>{message}</Text> : null}
    {error ? <Text accessibilityRole="alert" style={s.error}>{error}</Text> : null}
  </Screen>;
}

const s = StyleSheet.create({
  detail: { color: colors.secondary, fontSize: 12, lineHeight: 18 },
  ok: { color: colors.green, fontSize: 12, lineHeight: 18 },
  error: { color: colors.red, fontSize: 12, lineHeight: 18 },
});
