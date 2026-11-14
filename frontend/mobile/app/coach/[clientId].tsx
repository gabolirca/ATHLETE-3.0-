import { useCallback, useState } from 'react';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useAccount } from '@/account/AccountProvider';
import { ActionButton } from '@/components/ActionButton';
import { AppInput } from '@/components/AppInput';
import { Card } from '@/components/Card';
import { Screen } from '@/components/Screen';
import { Eyebrow, Label, Title } from '@/components/Typography';
import { useTrainingRepository } from '@/data/MobileTrainingContext';
import { coachApi, type CoachClientPlan, type CoachCommentRow, type CoachSummary } from '@/pro/proApi';
import { colors } from '@/theme/colors';

const ACTIVITY: Record<string, string> = { run: 'Carrera', walk: 'Caminata', swim: 'Nado', bike: 'Bici', row: 'Remo', circuit: 'Circuito', hybrid: 'Híbrido' };
const short = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });

/** Atleta del coach: progreso y adherencia (solo lectura), programas asignados y comentarios. */
export default function CoachClientScreen() {
  const router = useRouter();
  const account = useAccount();
  const repository = useTrainingRepository();
  const { clientId, name, linkId } = useLocalSearchParams<{ clientId: string; name?: string; linkId?: string }>();
  const [summary, setSummary] = useState<CoachSummary | null>(null);
  const [plans, setPlans] = useState<CoachClientPlan[]>([]);
  const [comments, setComments] = useState<CoachCommentRow[]>([]);
  const [mine, setMine] = useState<Array<{ id: string; name: string; detail: string }> | null>(null);
  const [commentFor, setCommentFor] = useState<string | null>(null); // id de sesión o 'general'
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fail = (e: unknown, fallback: string) => setError(e instanceof Error ? e.message : fallback);

  const load = useCallback(() => {
    if (!clientId) return;
    Promise.all([coachApi.summary(clientId, 28), coachApi.clientPlans(clientId), coachApi.listComments(clientId)])
      .then(([s, p, c]) => { setSummary(s); setPlans(p); setComments(c); setError(null); })
      .catch((e: unknown) => fail(e, 'No se pudo cargar el progreso.'));
  }, [clientId]);
  useFocusEffect(load);

  async function openMyPlans() {
    if (!repository) return;
    setError(null);
    try {
      const [routines, programs] = await Promise.all([repository.listRoutines(), repository.listPrograms()]);
      setMine([
        ...programs.filter((p) => !p.coachName).map((p) => ({ id: p.id, name: p.name, detail: `Programa · ${p.days.length} días` })),
        ...routines.filter((r) => !r.coachName).map((r) => ({ id: r.id, name: r.name, detail: `Rutina · ${r.exercises.length} ejercicios` })),
      ]);
    } catch (e) { fail(e, 'No se pudieron leer tus programas.'); }
  }

  async function assign(planId: string, planName: string) {
    if (!clientId || busy) return;
    setBusy(true); setError(null); setMessage(null);
    try {
      await account.syncNow().catch(() => undefined); // el programa debe estar en la nube antes de copiarlo
      await coachApi.assignPlan(clientId, planId);
      setMine(null);
      setMessage(`"${planName}" asignado. Le aparecerá en Entrenar al sincronizar su app.`);
      load();
    } catch (e) { fail(e, 'No se pudo asignar.'); } finally { setBusy(false); }
  }

  function remove(plan: CoachClientPlan) {
    if (!clientId) return;
    Alert.alert('Retirar programa', `"${plan.name}" desaparecerá de su app. Sus sesiones registradas se conservan.`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Retirar', style: 'destructive', onPress: () => { coachApi.removePlan(clientId, plan.id).then(load).catch((e: unknown) => fail(e, 'No se pudo retirar.')); } },
    ]);
  }

  async function sendComment() {
    if (!clientId || !commentFor || busy) return;
    const body = draft.trim();
    if (!body) { setError('Escribe el comentario.'); return; }
    setBusy(true); setError(null);
    try {
      await coachApi.addComment(clientId, commentFor === 'general' ? 'general' : 'session', commentFor === 'general' ? null : commentFor, body);
      setDraft(''); setCommentFor(null); setMessage('Comentario enviado. Lo verá al sincronizar.');
      load();
    } catch (e) { fail(e, 'No se pudo enviar.'); } finally { setBusy(false); }
  }

  function end() {
    if (!linkId) return;
    Alert.alert('Terminar vínculo', `Ya no verás el entrenamiento de ${name ?? 'este atleta'}. Lo que le asignaste se queda con él.`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Terminar', style: 'destructive', onPress: () => { coachApi.endLink(linkId).then(() => router.back()).catch((e: unknown) => fail(e, 'No se pudo terminar.')); } },
    ]);
  }

  const composer = (key: string) => commentFor === key ? <View style={s.composer}>
    <AppInput label="Comentario" value={draft} onChangeText={setDraft} multiline maxLength={1000} placeholder="Ej. buena técnica, sube 2.5 kg la próxima"/>
    <View style={s.rowGap}>
      <View style={s.flex}><ActionButton onPress={() => void sendComment()} loading={busy}>Enviar</ActionButton></View>
      <View style={s.flex}><ActionButton secondary onPress={() => { setCommentFor(null); setDraft(''); }}>Cancelar</ActionButton></View>
    </View>
  </View> : null;

  const planned = summary?.plannedPerWeek ?? null;
  return <Screen>
    <View><Eyebrow>MODO COACH</Eyebrow><Title>{name ?? 'Atleta'}</Title></View>
    {message ? <Text style={s.ok}>{message}</Text> : null}
    {error ? <Text accessibilityRole="alert" style={s.error}>{error}</Text> : null}

    {summary ? <Card>
      <Eyebrow>ADHERENCIA · ÚLTIMAS 4 SEMANAS</Eyebrow>
      {summary.weeks.map((w) => {
        const ratio = planned ? Math.min(w.done / planned, 1) : Math.min(w.done / 5, 1);
        return <View key={w.weekStart} style={s.week}>
          <Text style={s.weekLabel}>{short(w.weekStart)}</Text>
          <View style={s.track}><View style={[s.fill, { width: `${Math.round(ratio * 100)}%` }, planned && w.done >= planned ? s.fillOk : null]}/></View>
          <Text style={s.weekValue}>{planned ? `${w.done}/${planned}` : w.done}</Text>
        </View>;
      })}
      <Text style={s.hint}>{planned ? `Su programa activo tiene ${planned} sesiones por semana.` : 'No tiene un programa semanal activo: se cuentan sesiones hechas.'}</Text>
    </Card> : null}

    {summary?.topLifts.length ? <Card>
      <Eyebrow>MEJORES LEVANTAMIENTOS (1RM ESTIMADO)</Eyebrow>
      {summary.topLifts.map((l) => <View key={l.exercise} style={s.line}><Text style={s.lineTitle}>{l.exercise}</Text><Text style={s.lineValue}>{l.e1rmKg} kg</Text></View>)}
    </Card> : null}

    <Card>
      <Eyebrow>SESIONES · 28 DÍAS</Eyebrow>
      {summary && !summary.sessions.length && !summary.cardio.length ? <Text style={s.hint}>Sin sesiones en este periodo.</Text> : null}
      {summary?.sessions.map((w) => <View key={w.id} style={s.session}>
        <Pressable accessibilityRole="button" accessibilityLabel={`Comentar ${w.title} del ${w.localDate}`} onPress={() => { setCommentFor(w.id); setDraft(''); }}>
          <Text style={s.lineTitle}>{short(w.localDate)} · {w.title}</Text>
          <Text style={s.hint}>{[w.planName, w.minutes ? `${w.minutes} min` : null, `${w.workingSets} series`, w.volumeKg ? `${w.volumeKg.toLocaleString('es-MX')} kg` : null, w.sessionRpe ? `RPE ${w.sessionRpe}` : null].filter(Boolean).join(' · ')}</Text>
          <Text style={s.link}>Comentar</Text>
        </Pressable>
        {composer(w.id)}
      </View>)}
      {summary?.cardio.map((c) => <View key={c.id} style={s.session}>
        <Text style={s.lineTitle}>{short(c.localDate)} · {ACTIVITY[c.activity] ?? 'Cardio'}</Text>
        <Text style={s.hint}>{[`${c.minutes} min`, c.distanceM ? `${(c.distanceM / 1000).toFixed(2)} km` : null, c.rpe ? `RPE ${c.rpe}` : null].filter(Boolean).join(' · ')}</Text>
      </View>)}
    </Card>

    <Card>
      <Eyebrow>PROGRAMAS DE {(name ?? 'ATLETA').toUpperCase()}</Eyebrow>
      {plans.length === 0 ? <Text style={s.hint}>Todavía no tiene programas.</Text> : null}
      {plans.map((p) => <View key={p.id} style={s.line}>
        <View style={s.flex}><Text style={s.lineTitle}>{p.name}</Text>
          <Text style={s.hint}>{p.kind === 'program' ? 'Programa' : 'Rutina'} · {p.days} {p.days === 1 ? 'día' : 'días'} · {p.assignedByMe ? 'asignado por ti' : p.assignedByName ? `de ${p.assignedByName}` : 'suyo'}</Text></View>
        {p.assignedByMe ? <Pressable accessibilityRole="button" accessibilityLabel={`Retirar ${p.name}`} onPress={() => remove(p)}><Text style={s.danger}>Retirar</Text></Pressable> : null}
      </View>)}
      {mine === null ? <ActionButton onPress={() => void openMyPlans()}>Asignar uno de mis programas</ActionButton> : <View style={s.picker}>
        <Label>Elige uno de tus programas o rutinas</Label>
        <Text style={s.hint}>Ármalo antes en Entrenar (puedes partir de una plantilla). Se le envía una copia con tu nombre.</Text>
        {mine.length === 0 ? <Text style={s.hint}>Aún no tienes programas propios.</Text> : null}
        {mine.map((m) => <Pressable key={m.id} accessibilityRole="button" accessibilityLabel={`Asignar ${m.name}`} disabled={busy} onPress={() => void assign(m.id, m.name)} style={s.option}>
          <Text style={s.lineTitle}>{m.name}</Text><Text style={s.hint}>{m.detail}</Text>
        </Pressable>)}
        <ActionButton secondary onPress={() => setMine(null)}>Cancelar</ActionButton>
      </View>}
    </Card>

    <Card>
      <Eyebrow>COMENTARIOS</Eyebrow>
      {commentFor === 'general' ? composer('general') : <ActionButton secondary onPress={() => { setCommentFor('general'); setDraft(''); }}>Escribir un mensaje</ActionButton>}
      {comments.map((c) => <View key={c.id} style={s.session}>
        <Text style={s.body}>{c.body}</Text>
        <View style={s.line}>
          <Text style={s.hint}>{c.targetType === 'session' ? 'En una sesión' : c.targetType === 'plan' ? 'En un programa' : 'Mensaje'} · {new Date(c.createdAt).toLocaleDateString('es-MX')}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Borrar comentario" onPress={() => { coachApi.deleteComment(c.id).then(load).catch((e: unknown) => fail(e, 'No se pudo borrar.')); }}><Text style={s.danger}>Borrar</Text></Pressable>
        </View>
      </View>)}
    </Card>

    {linkId ? <ActionButton secondary onPress={end}>Terminar vínculo</ActionButton> : null}
  </Screen>;
}

const s = StyleSheet.create({
  flex: { flex: 1 },
  rowGap: { flexDirection: 'row', gap: 8 },
  week: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  weekLabel: { width: 54, color: colors.secondary, fontSize: 11 },
  weekValue: { width: 36, textAlign: 'right', color: colors.text, fontSize: 12, fontWeight: '800' },
  track: { flex: 1, height: 8, borderRadius: 4, backgroundColor: colors.surfaceRaised, overflow: 'hidden' },
  fill: { height: 8, borderRadius: 4, backgroundColor: colors.blue },
  fillOk: { backgroundColor: colors.green },
  line: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingVertical: 4 },
  lineTitle: { color: colors.text, fontSize: 13, fontWeight: '700' },
  lineValue: { color: colors.text, fontSize: 13, fontWeight: '800' },
  session: { gap: 3, paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.border },
  composer: { gap: 8, paddingTop: 6 },
  picker: { gap: 8 },
  option: { padding: 12, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceRaised, gap: 2 },
  body: { color: colors.text, fontSize: 13, lineHeight: 19 },
  hint: { color: colors.secondary, fontSize: 11, lineHeight: 16 },
  link: { color: colors.blue, fontSize: 12, fontWeight: '800', paddingTop: 2 },
  danger: { color: colors.red, fontSize: 12, fontWeight: '800' },
  ok: { color: colors.green, fontSize: 12, lineHeight: 18 },
  error: { color: colors.red, fontSize: 12, lineHeight: 18 },
});
