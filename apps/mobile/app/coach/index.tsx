import { useCallback, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { ActionButton } from '@/components/ActionButton';
import { Card } from '@/components/Card';
import { EmptyState } from '@/components/EmptyState';
import { Screen } from '@/components/Screen';
import { Eyebrow, Label, Title } from '@/components/Typography';
import { coachApi, type CoachClient } from '@/pro/proApi';
import { colors } from '@/theme/colors';

/** Modo coach: invitar atletas y ver de un vistazo quién entrena. */
export default function CoachClientsScreen() {
  const router = useRouter();
  const [clients, setClients] = useState<CoachClient[] | null>(null);
  const [invite, setInvite] = useState<{ code: string; expiresAt: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    coachApi.listClients().then((c) => { setClients(c); setError(null); })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'No se pudieron cargar tus atletas.'));
  }, []);
  useFocusEffect(load);

  async function newInvite() {
    setBusy(true); setError(null);
    try { setInvite(await coachApi.createInvite()); } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo generar el código.'); } finally { setBusy(false); }
  }

  return <Screen>
    <View><Eyebrow>MODO COACH</Eyebrow><Title>Mis atletas</Title></View>
    <Card accent={colors.blue}>
      <Label>Invitar a un atleta</Label>
      <Text style={s.detail}>Comparte el código; tu atleta lo escribe en Ajustes → Con mi coach. Cada código sirve una vez y vence en 7 días.</Text>
      {invite ? <View style={s.codeBox}>
        <Text selectable style={s.code} accessibilityLabel={`Código ${invite.code.split('').join(' ')}`}>{invite.code}</Text>
        <Text style={s.detail}>Vence el {new Date(invite.expiresAt).toLocaleDateString('es-MX')}</Text>
        <ActionButton secondary onPress={() => void Share.share({ message: `Mi código de coach para vincularte en la app: ${invite.code}` })}>Compartir código</ActionButton>
      </View> : null}
      <ActionButton onPress={() => void newInvite()} loading={busy}>{invite ? 'Generar otro código' : 'Generar código'}</ActionButton>
    </Card>

    {error ? <Text accessibilityRole="alert" style={s.error}>{error}</Text> : null}
    {clients && clients.length === 0 ? <EmptyState icon="people-outline" title="Aún no tienes atletas" detail="Cuando alguien acepte tu código aparecerá aquí."/> : null}
    {clients?.map((c) => <Pressable key={c.linkId} accessibilityRole="button" accessibilityLabel={`Abrir ${c.name}`}
      onPress={() => router.push({ pathname: '/coach/[clientId]', params: { clientId: c.clientId, name: c.name, linkId: c.linkId } } as never)} style={s.row}>
      <View style={[s.dot, c.sessionsLast7Days > 0 ? s.dotOn : null]}/>
      <View style={s.flex}>
        <Text style={s.name}>{c.name}</Text>
        <Text style={s.detail}>{c.sessionsLast7Days} {c.sessionsLast7Days === 1 ? 'sesión' : 'sesiones'} en 7 días · última: {c.lastSessionDate ?? 'ninguna'}</Text>
        <Text style={s.detail}>{c.assignedPlans ? `${c.assignedPlans} ${c.assignedPlans === 1 ? 'programa asignado' : 'programas asignados'}` : 'Sin programa asignado'}</Text>
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
  dot: { width: 9, height: 9, borderRadius: 5, backgroundColor: colors.muted },
  dotOn: { backgroundColor: colors.green },
  flex: { flex: 1, gap: 2 },
  name: { color: colors.text, fontSize: 14, fontWeight: '800' },
  error: { color: colors.red, fontSize: 12, lineHeight: 18 },
});
