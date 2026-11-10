import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, Vibration, View } from 'react-native';
import { AppInput } from './AppInput';
import type { LoggedSetInput } from '@/data/trainingSchemas';
import type { TrainingSet } from '@/data/trainingTypes';
import { clock, parseMinSec } from '@/workout/blocks';
import { colors } from '@/theme/colors';

/**
 * Serie por tiempo y/o distancia (remo 400 m, plancha 40 s, zona 2 12 min). Se guarda al salir del campo o con
 * "Como el plan", que copia el objetivo. Sin peso ni RIR.
 */
export function TimedSetEditor({ set, label, targetSeconds, targetMeters, onSave, withTimer = false, now = Date.now }: {
  set: TrainingSet; label: string; targetSeconds: number | null; targetMeters: number | null; onSave: (input: LoggedSetInput) => Promise<void>;
  /** Plancha, hollow, etc.: cuenta regresiva con el tiempo meta (o cronómetro si no hay meta). Al terminar se guarda sola. */
  withTimer?: boolean; now?: () => number;
}) {
  const [time, setTime] = useState(set.durationSeconds ? clock(set.durationSeconds) : '');
  const [dist, setDist] = useState(set.distanceMeters ? String(set.distanceMeters) : '');
  const [inputKey, setInputKey] = useState(0);
  const [error, setError] = useState('');
  const done = Boolean(set.durationSeconds || set.distanceMeters);
  // Temporizador basado en la hora de inicio: si la pantalla se apaga y vuelve, el tiempo sigue siendo correcto.
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const finished = useRef(false);
  useEffect(() => {
    if (startedAt === null) return;
    const tick = () => {
      const ms = now() - startedAt;
      setElapsed(ms);
      if (targetSeconds && ms >= targetSeconds * 1000 && !finished.current) {
        finished.current = true;
        Vibration.vibrate();
        void finishTimer(targetSeconds);
      }
    };
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startedAt]);
  function startTimer() { finished.current = false; setElapsed(0); setStartedAt(now()); }
  async function finishTimer(seconds: number) {
    setStartedAt(null);
    if (seconds < 1) return;
    const next = { time: clock(seconds), dist };
    setTime(next.time); setInputKey((k) => k + 1);
    await persist(next);
  }
  const running = startedAt !== null;
  const shownMs = targetSeconds ? Math.max(0, targetSeconds * 1000 - elapsed) : elapsed;

  async function persist(values = { time, dist }) {
    const seconds = parseMinSec(values.time);
    const meters = values.dist.trim() === '' ? null : Number(values.dist.trim().replace(',', '.'));
    if (Number.isNaN(seconds) || (seconds !== null && seconds < 1)) { setError('Tiempo como min:seg (por ejemplo 1:45) o en segundos.'); return; }
    if (meters !== null && (!Number.isFinite(meters) || meters <= 0)) { setError('La distancia debe ser un número mayor que cero.'); return; }
    if (seconds === null && meters === null) return;
    setError('');
    try { await onSave({ weightKg: null, reps: null, rir: null, isWarmup: false, durationSeconds: seconds, distanceMeters: meters }); }
    catch { setError('No se pudo guardar.'); }
  }
  function asPlanned() {
    const next = { time: targetSeconds ? clock(targetSeconds) : '', dist: targetMeters ? String(targetMeters) : '' };
    setTime(next.time); setDist(next.dist); setInputKey((k) => k + 1);
    void persist(next);
  }

  return <View style={s.box}>
    <View style={s.head}><Text style={s.label}>{label}</Text>{done ? <Text style={s.done}>✓</Text> : null}</View>
    {withTimer && !done ? running
      ? <View style={s.timer}>
          <Text style={s.clock} accessibilityLabel={`${targetSeconds ? 'Faltan' : 'Llevas'} ${Math.ceil(shownMs / 1000)} segundos`}>{clock(Math.ceil(shownMs / 1000)) || '0:00'}</Text>
          <Text style={s.timerHint}>{targetSeconds ? 'Aguanta… se guarda sola al terminar.' : 'Toca Terminar cuando acabes.'}</Text>
          <Pressable accessibilityRole="button" onPress={() => void finishTimer(Math.floor(elapsed / 1000))} style={s.stop}><Text style={s.stopText}>{targetSeconds ? 'Terminar antes' : 'Terminar'}</Text></Pressable>
        </View>
      : <Pressable accessibilityRole="button" accessibilityLabel={targetSeconds ? `Iniciar ${clock(targetSeconds)}` : 'Iniciar cronómetro'} onPress={startTimer} style={s.start}>
          <Text style={s.startText}>▶ {targetSeconds ? `Iniciar ${clock(targetSeconds)}` : 'Iniciar cronómetro'}</Text></Pressable>
    : null}
    <View style={s.fields}>
      <View style={s.flex}><AppInput key={`t-${inputKey}`} label="Tiempo (min:seg)" defaultValue={time} onChangeText={setTime} onBlur={() => void persist()} keyboardType="numbers-and-punctuation" placeholder={targetSeconds ? clock(targetSeconds) : '—'} autoCorrect={false} spellCheck={false}/></View>
      <View style={s.flex}><AppInput key={`d-${inputKey}`} label="Distancia (m)" defaultValue={dist} onChangeText={setDist} onBlur={() => void persist()} keyboardType="decimal-pad" placeholder={targetMeters ? String(targetMeters) : '—'} autoCorrect={false} spellCheck={false}/></View>
    </View>
    {!done && (targetSeconds || targetMeters) ? <Pressable accessibilityRole="button" accessibilityLabel={`Como el plan: ${label}`} onPress={asPlanned} style={s.plan}><Text style={s.planText}>✓ Como el plan</Text></Pressable> : null}
    {error ? <Text accessibilityRole="alert" style={s.error}>{error}</Text> : null}
  </View>;
}

const s = StyleSheet.create({
  box: { gap: 8, borderWidth: 1, borderColor: colors.border, borderRadius: 14, padding: 12, backgroundColor: colors.surface },
  head: { flexDirection: 'row', justifyContent: 'space-between' }, label: { color: colors.secondary, fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  done: { color: colors.green, fontSize: 14, fontWeight: '800' },
  fields: { flexDirection: 'row', gap: 8 }, flex: { flex: 1 },
  plan: { alignSelf: 'flex-start', borderRadius: 10, borderWidth: 1, borderColor: colors.green, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: colors.greenSoft },
  planText: { color: colors.green, fontSize: 12, fontWeight: '800' },
  error: { color: colors.red, fontSize: 11 },
  start: { borderRadius: 12, backgroundColor: colors.blue, paddingVertical: 12, alignItems: 'center' },
  startText: { color: 'white', fontSize: 15, fontWeight: '800' },
  timer: { alignItems: 'center', gap: 4, paddingVertical: 6 },
  clock: { color: colors.text, fontSize: 48, fontWeight: '800', fontVariant: ['tabular-nums'] },
  timerHint: { color: colors.secondary, fontSize: 12 },
  stop: { marginTop: 4, borderRadius: 10, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 14, paddingVertical: 8 },
  stopText: { color: colors.text, fontSize: 13, fontWeight: '800' },
});
