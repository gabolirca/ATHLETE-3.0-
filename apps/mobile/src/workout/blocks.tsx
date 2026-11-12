import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, Vibration, View } from 'react-native';
import { AppInput } from '@/components/AppInput';
import { Card } from '@/components/Card';
import type { WorkoutBlock } from '@/data/trainingTypes';
import { formatBlock } from '@/program/format';
import { HYBRID_COLOR } from '@/program/HybridCard';
import { colors } from '@/theme/colors';

/** "12:34" → 754 s; "45" → 45 s. Null si está vacío; NaN si no es válido. */
export function parseMinSec(raw: string): number | null {
  const t = raw.trim();
  if (!t) return null;
  const m = /^(\d{1,3}):([0-5]\d)$/.exec(t);
  if (m) return Number(m[1]) * 60 + Number(m[2]);
  return /^\d{1,5}$/.test(t) ? Number(t) : Number.NaN;
}
export const clock = (s: number) => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.floor(Math.max(0, s) % 60)).padStart(2, '0')}`;

/** Bloques que se registran como un todo (rondas, tiempo) en vez de serie por serie. */
export const isWholeBlock = (format: WorkoutBlock['format']) => format === 'amrap' || format === 'emom' || format === 'for_time' || format === 'rounds';

/** Texto del resultado guardado: "6 rondas + 4 reps", "12:34", "3 rondas". */
export function blockResultText(block: Pick<WorkoutBlock, 'format' | 'result'>): string | null {
  const r = block.result;
  if (!r) return null;
  if (block.format === 'for_time') return r.durationSeconds ? clock(r.durationSeconds) : null;
  if (r.roundsCompleted === null) return null;
  const rounds = `${r.roundsCompleted} ${r.roundsCompleted === 1 ? 'ronda' : 'rondas'}`;
  return block.format === 'amrap' && r.extraReps ? `${rounds} + ${r.extraReps} reps` : rounds;
}

/** Reloj del bloque: cuenta regresiva (AMRAP, EMOM) o cronómetro (por tiempo). Basado en la hora real, no en ticks. */
export function useBlockClock(countdownFrom: number | null, now: () => number = Date.now) {
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [stoppedAt, setStoppedAt] = useState<number | null>(null);
  const [, tick] = useState(0);
  const buzzed = useRef(false);
  useEffect(() => {
    if (startedAt === null || stoppedAt !== null) return;
    const id = setInterval(() => tick((n) => n + 1), 250);
    return () => clearInterval(id);
  }, [startedAt, stoppedAt]);
  const elapsed = startedAt === null ? 0 : Math.floor(((stoppedAt ?? now()) - startedAt) / 1000);
  const remaining = countdownFrom === null ? null : Math.max(0, countdownFrom - elapsed);
  const finished = remaining === 0 && startedAt !== null;
  useEffect(() => { if (finished && !buzzed.current) { buzzed.current = true; Vibration.vibrate([0, 400, 200, 400]); } }, [finished]);
  return {
    running: startedAt !== null && stoppedAt === null && !finished,
    started: startedAt !== null,
    elapsed, remaining, finished,
    start: () => { buzzed.current = false; setStartedAt(now()); setStoppedAt(null); },
    stop: () => setStoppedAt(now()),
    reset: () => { setStartedAt(null); setStoppedAt(null); buzzed.current = false; },
  };
}

/**
 * Encabezado de un bloque del programa. En AMRAP, EMOM, por tiempo y rondas trae su reloj y el registro del resultado.
 */
export function BlockHeader({ block, editable, onSaveResult, onRest }: {
  block: WorkoutBlock; editable: boolean;
  onSaveResult: (r: { roundsCompleted: number | null; extraReps: number | null; durationSeconds: number | null }) => Promise<void>;
  /** Descanso entre rondas del circuito (usa el temporizador de descanso de la sesión). */
  onRest?: (seconds: number, label: string) => void;
}) {
  const whole = isWholeBlock(block.format);
  // Rondas: cronómetro que cuenta hacia arriba (tiempo total del circuito) y contador de vueltas.
  const timed = block.format === 'amrap' || block.format === 'emom' || block.format === 'for_time' || block.format === 'rounds';
  const roundsMode = block.format === 'rounds';
  const [roundsDone, setRoundsDone] = useState(block.result?.roundsCompleted ?? 0);
  const clockState = useBlockClock(block.format === 'for_time' || block.format === 'rounds' ? null : block.timeCapSeconds);
  const [rounds, setRounds] = useState(block.result?.roundsCompleted != null ? String(block.result.roundsCompleted) : '');
  const [reps, setReps] = useState(block.result?.extraReps != null ? String(block.result.extraReps) : '');
  const [time, setTime] = useState(block.result?.durationSeconds && block.format === 'for_time' ? clock(block.result.durationSeconds) : '');
  const [inputKey, setInputKey] = useState(0);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const saved = blockResultText(block);

  function stopClock() {
    clockState.stop();
    if (block.format === 'for_time') { setTime(clock(clockState.elapsed)); setInputKey((k) => k + 1); }
  }

  async function finishRound() {
    const next = roundsDone + 1;
    setRoundsDone(next);
    setRounds(String(next)); setInputKey((k) => k + 1);
    if (!clockState.started) clockState.start();
    const total = block.rounds ?? null;
    if (total !== null && next >= total) {
      clockState.stop();
      setSaving(true);
      try { await onSaveResult({ roundsCompleted: next, extraReps: null, durationSeconds: Math.max(1, clockState.elapsed) || null }); setError(''); }
      catch { setError('No se pudo guardar el resultado. Intenta de nuevo.'); }
      finally { setSaving(false); }
      return;
    }
    if (block.restSeconds) onRest?.(block.restSeconds, total ? `Descanso · sigue la ronda ${next + 1} de ${total}` : `Descanso · ronda ${next + 1}`);
  }

  async function save() {
    const r = rounds.trim() === '' ? null : Number(rounds);
    const x = reps.trim() === '' ? null : Number(reps);
    const t = parseMinSec(time);
    if (block.format === 'for_time') {
      if (t === null || Number.isNaN(t) || t < 1) { setError('Escribe tu tiempo como min:seg, por ejemplo 12:34.'); return; }
    } else if (r === null || !Number.isInteger(r) || r < 0 || r > 1000 || (x !== null && (!Number.isInteger(x) || x < 0 || x > 10_000))) {
      setError('Escribe las rondas completas (y reps extra) con números enteros.'); return;
    }
    setError(''); setSaving(true);
    try {
      await onSaveResult({
        roundsCompleted: block.format === 'for_time' ? null : r,
        extraReps: block.format === 'amrap' ? x : null,
        durationSeconds: block.format === 'for_time' ? t : block.format === 'amrap' || block.format === 'emom' ? block.timeCapSeconds : roundsMode && clockState.started ? Math.max(1, clockState.elapsed) : null,
      });
    } catch { setError('No se pudo guardar el resultado. Intenta de nuevo.'); }
    finally { setSaving(false); }
  }

  return <Card accent={whole ? HYBRID_COLOR : colors.graphite}>
    <Text style={s.name}>{block.name}</Text>
    <Text style={s.format}>{formatBlock(block)}</Text>
    {block.notes ? <Text style={s.note}>{block.notes}</Text> : null}
    {timed && editable ? <View style={s.clockRow}>
      <Text style={[s.clock, clockState.finished && s.clockDone]} accessibilityLabel="Reloj del bloque">
        {clockState.remaining !== null ? clock(clockState.remaining) : clock(clockState.elapsed)}
      </Text>
      {!clockState.started || clockState.finished
        ? <Pressable accessibilityRole="button" onPress={clockState.start} style={s.clockBtn}><Text style={s.clockBtnText}>{clockState.finished ? 'Otra vez' : 'Iniciar'}</Text></Pressable>
        : clockState.running
          ? <Pressable accessibilityRole="button" onPress={stopClock} style={s.clockBtn}><Text style={s.clockBtnText}>Detener</Text></Pressable>
          : <Pressable accessibilityRole="button" onPress={clockState.reset} style={s.clockBtn}><Text style={s.clockBtnText}>Reiniciar</Text></Pressable>}
    </View> : null}
    {clockState.finished ? <Text style={s.finished}>¡Tiempo! Anota tus rondas.</Text> : null}
    {roundsMode && editable ? <View style={s.roundsBox}>
      <Text style={s.roundsCount} accessibilityLabel={`${roundsDone} de ${block.rounds ?? '—'} rondas`}>Ronda {Math.min(roundsDone + 1, block.rounds ?? roundsDone + 1)}{block.rounds ? ` de ${block.rounds}` : ''}</Text>
      {block.rounds && roundsDone >= block.rounds
        ? <Text style={s.finished}>¡Circuito completo!</Text>
        : <Pressable accessibilityRole="button" accessibilityLabel={`Terminé la ronda ${roundsDone + 1}`} disabled={saving} onPress={() => void finishRound()} style={s.roundBtn}>
            <Text style={s.roundBtnText}>✓ Terminé la ronda {roundsDone + 1}</Text>
          </Pressable>}
      {block.restSeconds ? <Text style={s.note}>Descanso de {block.restSeconds} s entre rondas.</Text> : null}
    </View> : null}
    {whole && saved ? <Text style={s.saved}>Resultado: {saved}</Text> : null}
    {whole && editable ? <>
      <View style={s.fields}>
        {block.format === 'for_time'
          ? <View style={s.flex}><AppInput key={`t-${inputKey}`} label="Tu tiempo (min:seg)" defaultValue={time} onChangeText={setTime} keyboardType="numbers-and-punctuation" placeholder="12:34" autoCorrect={false} spellCheck={false}/></View>
          : <>
            <View style={s.flex}><AppInput key={`r-${inputKey}`} label="Rondas completas" defaultValue={rounds} onChangeText={setRounds} keyboardType="number-pad" placeholder={block.rounds ? String(block.rounds) : '0'} autoCorrect={false} spellCheck={false}/></View>
            {block.format === 'amrap' ? <View style={s.flex}><AppInput label="Reps extra" defaultValue={reps} onChangeText={setReps} keyboardType="number-pad" placeholder="0" autoCorrect={false} spellCheck={false}/></View> : null}
          </>}
      </View>
      {error ? <Text accessibilityRole="alert" style={s.error}>{error}</Text> : null}
      <Pressable accessibilityRole="button" accessibilityLabel={`Guardar resultado de ${block.name}`} disabled={saving} onPress={() => void save()} style={s.save}>
        <Text style={s.saveText}>{saving ? 'Guardando…' : saved ? 'Actualizar resultado' : 'Guardar resultado'}</Text>
      </Pressable>
    </> : null}
  </Card>;
}

const s = StyleSheet.create({
  name: { color: colors.text, fontSize: 17, fontWeight: '800' }, format: { color: HYBRID_COLOR, fontSize: 12, fontWeight: '800' },
  note: { color: colors.secondary, fontSize: 11, lineHeight: 16 },
  clockRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  clock: { color: colors.text, fontSize: 40, fontWeight: '800', fontVariant: ['tabular-nums'] }, clockDone: { color: colors.green },
  clockBtn: { backgroundColor: HYBRID_COLOR, borderRadius: 12, paddingHorizontal: 18, paddingVertical: 11 }, clockBtnText: { color: colors.amberSoft, fontSize: 14, fontWeight: '800' },
  finished: { color: colors.green, fontSize: 13, fontWeight: '800' },
  saved: { color: colors.green, fontSize: 14, fontWeight: '800' },
  roundsBox: { gap: 8 }, roundsCount: { color: colors.text, fontSize: 20, fontWeight: '800' },
  roundBtn: { backgroundColor: HYBRID_COLOR, borderRadius: 12, paddingVertical: 13, alignItems: 'center' }, roundBtnText: { color: colors.amberSoft, fontSize: 15, fontWeight: '800' },
  fields: { flexDirection: 'row', gap: 9 }, flex: { flex: 1 },
  error: { color: colors.red, fontSize: 11 },
  save: { alignSelf: 'flex-start', borderWidth: 1, borderColor: HYBRID_COLOR, borderRadius: 11, paddingHorizontal: 14, paddingVertical: 9 },
  saveText: { color: HYBRID_COLOR, fontSize: 13, fontWeight: '800' },
});
