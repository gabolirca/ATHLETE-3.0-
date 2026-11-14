import { useCallback, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { Alert, StyleSheet, Text, View } from 'react-native';
import type { NutritionPlan } from '@athlete/contracts';
import { useAccount } from '@/account/AccountProvider';
import { ActionButton } from '@/components/ActionButton';
import { AppInput } from '@/components/AppInput';
import { Card } from '@/components/Card';
import { Screen } from '@/components/Screen';
import { Eyebrow, Label, Title } from '@/components/Typography';
import { localDateOfDevice } from '@/lib/localDate';
import { useNutrition } from '@/nutrition/mobileNutrition';
import { PlanView } from '@/nutrition/PlanView';
import { proApi, type ProStatus } from '@/pro/proApi';
import { colors } from '@/theme/colors';

/** "Con mi nutriólogo": el cliente se vincula con el código de su nutriólogo y recibe el plan que él le asigne. */
export default function MyNutritionistScreen() {
  const router = useRouter();
  const account = useAccount();
  const nutrition = useNutrition();
  const signedIn = account.auth?.status === 'signed_in';
  const [status, setStatus] = useState<ProStatus | null>(null);
  const [plan, setPlan] = useState<NutritionPlan | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!signedIn) return;
    proApi.status().then((s) => { setStatus(s); setError(null); }).catch((e: unknown) => setError(e instanceof Error ? e.message : 'No se pudo consultar.'));
    nutrition?.getPlan(localDateOfDevice(new Date())).then(setPlan).catch(() => setPlan(null));
  }, [signedIn, nutrition]);
  useFocusEffect(load);

  async function link() {
    if (busy) return;
    if (!/^[A-Za-z2-9]{8}$/.test(code.trim())) { setError('El código tiene 8 letras y números.'); return; }
    setBusy(true); setError(null); setMessage(null);
    try {
      const r = await proApi.acceptInvite(code);
      setMessage(`Listo: ahora estás con ${r.name}. Tu plan aparecerá en Nutrición cuando te lo asigne.`);
      await account.syncNow().catch(() => undefined);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo vincular.');
    } finally { setBusy(false); }
  }

  async function refresh() {
    setBusy(true); setError(null);
    try { await account.syncNow(); load(); } catch { setError('No se pudo sincronizar. Revisa tu conexión.'); } finally { setBusy(false); }
  }

  function unlink(linkId: string, name: string) {
    Alert.alert('Terminar vínculo', `${name} ya no podrá asignarte planes. Tus planes anteriores se quedan contigo.`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Terminar', style: 'destructive', onPress: () => {
        proApi.endLink(linkId).then(() => { setMessage('Vínculo terminado.'); load(); })
          .catch((e: unknown) => setError(e instanceof Error ? e.message : 'No se pudo terminar el vínculo.'));
      } },
    ]);
  }

  return <Screen>
    <View><Eyebrow>NUTRICIÓN</Eyebrow><Title>Con mi nutriólogo</Title></View>
    {!account.available ? <Card><Text style={s.detail}>Esta compilación no tiene la nube configurada; esta función necesita cuenta en línea.</Text></Card>
    : !signedIn ? <Card>
      <Label>Inicia sesión para vincularte</Label>
      <Text style={s.detail}>Tu nutriólogo te asigna el plan desde su cuenta y te llega aquí. Para eso necesitas tu cuenta de Mundo Fit.</Text>
      <ActionButton onPress={() => router.push('/account/login')}>Iniciar sesión o crear cuenta</ActionButton>
    </Card>
    : status?.professional ? <>
      <Card accent={colors.blue}>
        <Label>Tu nutriólogo: {status.professional.name}</Label>
        <Text style={s.detail}>Vinculados desde el {new Date(status.professional.since).toLocaleDateString('es-MX')}. Cuando te asigne o cambie el plan, se actualiza al sincronizar.</Text>
        <ActionButton secondary onPress={() => void refresh()} loading={busy}>Buscar plan nuevo</ActionButton>
      </Card>
      {plan?.source === 'assigned' ? <Card><PlanView plan={plan}/></Card>
        : <Card><Text style={s.detail}>Aún no tienes un plan asignado.</Text></Card>}
      <ActionButton secondary onPress={() => unlink(status.professional!.linkId, status.professional!.name)}>Terminar vínculo</ActionButton>
    </>
    : <Card>
      <Label>Vincúlate con tu nutriólogo</Label>
      <Text style={s.detail}>Pídele su código de Mundo Fit (8 letras y números). Solo verá tu nombre, tu correo y el plan que te asigne.</Text>
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
