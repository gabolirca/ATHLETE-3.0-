import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import type { CoachComment, CoachCommentTarget } from '@athlete/contracts';
import { Card } from '@/components/Card';
import { Eyebrow } from '@/components/Typography';
import { useAthleteData } from '@/data/AthleteDataProvider';
import { colors } from '@/theme/colors';

export function useCoachComments(filter?: { targetType?: CoachCommentTarget; targetId?: string }): CoachComment[] {
  const { data } = useAthleteData();
  const [items, setItems] = useState<CoachComment[]>([]);
  const type = filter?.targetType; const id = filter?.targetId;
  useFocusEffect(useCallback(() => {
    if (!data) return;
    data.coach.listComments({ ...(type ? { targetType: type } : {}), ...(id ? { targetId: id } : {}) })
      .then((r) => setItems(r.ok ? r.value : [])).catch(() => setItems([]));
  }, [data, type, id]));
  return items;
}

/** Comentarios del coach (solo lectura). No se muestra nada si no hay. */
export function CoachComments({ targetType, targetId, title = 'TU COACH' }: { targetType?: CoachCommentTarget; targetId?: string; title?: string }) {
  const items = useCoachComments(targetType ? { targetType, ...(targetId ? { targetId } : {}) } : undefined);
  if (!items.length) return null;
  return <Card accent={colors.blue}>
    <View style={s.head}><Ionicons name="chatbubble-ellipses-outline" size={16} color={colors.blue}/><Eyebrow>{title}</Eyebrow></View>
    {items.map((c) => <View key={c.id} style={s.item}>
      <Text style={s.body}>{c.body}</Text>
      <Text style={s.meta}>{c.authorName} · {new Date(c.createdAt).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })}</Text>
    </View>)}
  </Card>;
}

const s = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  item: { gap: 3, paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.border },
  body: { color: colors.text, fontSize: 13, lineHeight: 19 },
  meta: { color: colors.secondary, fontSize: 11 },
});
