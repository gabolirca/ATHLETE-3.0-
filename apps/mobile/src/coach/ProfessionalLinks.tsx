import { useCallback, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Card } from '@/components/Card';
import { Eyebrow } from '@/components/Typography';
import { fetchProStatus, type ProStatus } from '@/pro/proApi';
import { colors } from '@/theme/colors';

export function useProStatus(): ProStatus | null {
  const [status, setStatus] = useState<ProStatus | null>(null);
  useFocusEffect(useCallback(() => { fetchProStatus().then(setStatus).catch(() => undefined); }, []));
  return status;
}

type Row = { key: string; icon: string; title: string; detail: string; to: string };

function Rows({ rows }: { rows: Row[] }) {
  const router = useRouter();
  return <>{rows.map((r) => <Pressable key={r.key} accessibilityRole="button" accessibilityLabel={r.title} onPress={() => router.push(r.to as never)} style={s.row}>
    <Ionicons name={r.icon as never} size={19} color={colors.blue}/>
    <View style={s.flex}><Text style={s.title}>{r.title}</Text><Text style={s.detail}>{r.detail}</Text></View>
    <Ionicons name="chevron-forward" size={18} color={colors.secondary}/>
  </Pressable>)}</>;
}

/** Ajustes → Entrenamiento: vincularse con un coach y, si la cuenta es de coach, el modo coach. */
export function TrainingSettingsCard() {
  const status = useProStatus();
  const rows: Row[] = [
    { key: 'link', icon: 'barbell-outline', title: 'Con mi coach', detail: status?.coach ? `Tu coach: ${status.coach.name}` : 'Vincúlate con el código de tu coach.', to: '/coach/link' },
    ...(status?.isCoach ? [{ key: 'coach', icon: 'people-outline', title: 'Modo coach', detail: 'Tus atletas, su progreso y sus programas.', to: '/coach' }] : []),
  ];
  return <Card><Eyebrow>ENTRENAMIENTO</Eyebrow><Rows rows={rows}/></Card>;
}

/** Accesos en Entrenar: modo coach (si aplica) y tu coach (si tienes). Nada si no hay ninguno. */
export function TrainProfessionalRows() {
  const status = useProStatus();
  const rows: Row[] = [
    ...(status?.isCoach ? [{ key: 'coach', icon: 'people-outline', title: 'Modo coach', detail: 'Tus atletas y sus programas', to: '/coach' }] : []),
    ...(status?.coach ? [{ key: 'mine', icon: 'chatbubble-ellipses-outline', title: `Tu coach: ${status.coach.name}`, detail: 'Mensajes y programas asignados', to: '/coach/link' }] : []),
  ];
  return rows.length ? <Card><Rows rows={rows}/></Card> : null;
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  flex: { flex: 1, gap: 2 },
  title: { color: colors.text, fontSize: 14, fontWeight: '700' },
  detail: { color: colors.secondary, fontSize: 11, lineHeight: 16 },
});
