import { useCallback, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { ActionButton } from '@/components/ActionButton';
import { Card } from '@/components/Card';
import { EmptyState } from '@/components/EmptyState';
import { Screen } from '@/components/Screen';
import { Eyebrow, Label, Title } from '@/components/Typography';
import { proApi, type ProClient } from '@/pro/proApi';
import { colors } from '@/theme/colors';

/** Modo nutriólogo: invitar clientes con un código y ver a quién asignarle plan. */
export default function ProClientsScreen() {
  const router = useRouter();
  const [clients, setClients] = useState<ProClient[] | null>(null);
  const [invite, setInvite] = useState<{ code: string; expiresAt: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    proApi.listClients().then((c) => { setClients(c); setError(null); })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'No se pudieron cargar tus clientes.'));
  }, []);
  useFocusEffect(load);

  async function newInvite() {
    setBusy(true); setError(null);
    try { setInvite(await proApi.createInvite()); } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo generar el código.'); } finally { setBusy(false); }
  }

  return <Screen>
    <View><Eyebrow>MODO NUTRIÓLOGO</Eyebrow><Title>Mis clientes</Title></View>
    <Card accent={colors.blue}>
      <Label>Invitar a un cliente</Label>
      <Text style={s.detail}>Genera un código y compártelo. Tu cliente lo escribe en Nutrición → Con mi nutriólogo. Cada código sirve una vez y vence en 7 días.</Text>
      {invite ? <View style={s.codeBox}>
        <Text selectable style={s.code} accessibilityLabel={`Código ${invite.code.split('').join(' ')}`}>{invite.code}</Text>
        <Text style={s.detail}>Vence el {new Date(invite.expiresAt).toLocaleDateString('es-MX')}</Text>
        <ActionButton secondary onPress={() => void Share.share({ message: `Mi código de Mundo Fit para asignarte tu plan de nutrición: ${invite.code}` })}>Compartir código</ActionButton>
      </View> : null}
      <ActionButton onPress={() => void newInvite()} loading={busy}>{invite ? 'Generar otro código' : 'Generar código'}</ActionButton>
    </Card>

    {error ? <Text accessibilityRole="alert" style={s.error}>{error}</Text> : null}
    {clients && clients.length === 0 ? <EmptyState icon="people-outline" title="Aún no tienes clientes" detail="Cuando alguien acepte tu código aparecerá aquí."/> : null}
    {clients?.map((c) => <Pressable key={c.linkId} accessibilityRole="button" accessibilityLabel={`Abrir ${c.name}`}
      onPress={() => router.push({ pathname: '/pro/[clientId]', params: { clientId: c.clientId, name: c.name, linkId: c.linkId } } as never)} style={s.row}>
      <View style={s.flex}>
        <Text style={s.name}>{c.name}</Text>
        {c.email ? <Text style={s.detail}>{c.email}</Text> : null}
        <Text style={s.detail}>{c.plan ? `${c.plan.source === 'assigned' ? 'Plan asignado' : 'Plan propio'}: ${c.plan.name} · desde ${c.plan.effectiveFrom}` : 'Sin plan'}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.secondary}/>
    </Pressable>)}
  </Screen>;
}

const s = StyleSheet.create({
  detail: { color: colors.secondary, fontSize: 12, lineHeight: 18 },
  codeBox: { alignItems: 'center', gap: 6, paddingVertical: 6 },
  code: { color: colors.text, fontSize: 32, fontWeight: '800', letterSpacing: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 14, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  flex: { flex: 1, gap: 2 },
  name: { color: colors.text, fontSize: 14, fontWeight: '800' },
  error: { color: colors.red, fontSize: 12, lineHeight: 18 },
});
