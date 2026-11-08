import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, Vibration, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/theme/colors';

/** "1:28". Redondea hacia arriba: 0.3 s restantes se muestran como 0:01, no 0:00. */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

export const DEFAULT_REST_SECONDS = 90;

type TimerState = { endAt: number; totalMs: number; label: string } | null;

/**
 * Temporizador de descanso basado en la hora de fin (no en restar segundos): si la app pasa a segundo plano y
 * vuelve, muestra el tiempo correcto. Vibra al terminar mientras la app está abierta.
 */
export function useRestTimer(now: () => number = Date.now) {
  const [state, setState] = useState<TimerState>(null);
  const [remaining, setRemaining] = useState(0);
  const [done, setDone] = useState(false);
  const fired = useRef(false);

  const start = useCallback((seconds: number, label: string) => {
    const totalMs = Math.max(5, seconds) * 1000;
    fired.current = false;
    setDone(false);
    setState({ endAt: now() + totalMs, totalMs, label });
    setRemaining(totalMs);
  }, [now]);

  const add = useCallback((seconds: number) => {
    setState((s) => (s ? { ...s, endAt: Math.max(now() + 1000, s.endAt + seconds * 1000), totalMs: Math.max(1000, s.totalMs + seconds * 1000) } : s));
  }, [now]);

  const stop = useCallback(() => { setState(null); setDone(false); }, []);

  useEffect(() => {
    if (!state) return;
    const tick = () => {
      const left = state.endAt - now();
      setRemaining(left);
      if (left <= 0 && !fired.current) {
        fired.current = true;
        setDone(true);
        Vibration.vibrate();
      }
    };
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [state, now]);

  // Al terminar, el aviso "¡A darle!" se queda unos segundos y desaparece solo.
  useEffect(() => {
    if (!done) return;
    const id = setTimeout(() => setState(null), 4000);
    return () => clearTimeout(id);
  }, [done]);

  return { active: state !== null, remaining, totalMs: state?.totalMs ?? 0, label: state?.label ?? '', done, start, add, stop };
}

export function RestTimerBar({ timer }: { timer: ReturnType<typeof useRestTimer> }) {
  if (!timer.active) return null;
  const progress = timer.totalMs ? Math.min(1, Math.max(0, 1 - timer.remaining / timer.totalMs)) : 1;
  return <View style={s.bar} accessibilityLiveRegion="polite">
    <View style={[s.fill, { width: `${Math.round(progress * 100)}%` }]}/>
    <View style={s.row}>
      <Ionicons name={timer.done ? 'flash' : 'timer-outline'} size={20} color={timer.done ? '#F5B841' : colors.text}/>
      <View style={s.flex}>
        <Text style={s.title}>{timer.done ? '¡A darle! Siguiente serie' : `Descanso · ${formatClock(timer.remaining)}`}</Text>
        {timer.label ? <Text style={s.label} numberOfLines={1}>{timer.label}</Text> : null}
      </View>
      {!timer.done ? <>
        <Pressable accessibilityRole="button" accessibilityLabel="Quitar 15 segundos" onPress={() => timer.add(-15)} style={s.btn}><Text style={s.btnText}>−15</Text></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Agregar 15 segundos" onPress={() => timer.add(15)} style={s.btn}><Text style={s.btnText}>+15</Text></Pressable>
      </> : null}
      <Pressable accessibilityRole="button" accessibilityLabel={timer.done ? 'Cerrar' : 'Saltar descanso'} onPress={timer.stop} style={s.btn}><Text style={s.btnText}>{timer.done ? 'OK' : 'Saltar'}</Text></Pressable>
    </View>
  </View>;
}

const s = StyleSheet.create({
  bar: { position: 'absolute', left: 12, right: 12, bottom: 16, borderRadius: 16, backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.blue, overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 12, elevation: 8 },
  fill: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: '#10203F' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12 },
  flex: { flex: 1 },
  title: { color: colors.text, fontSize: 15, fontWeight: '800' },
  label: { color: colors.secondary, fontSize: 11 },
  btn: { paddingHorizontal: 10, paddingVertical: 8, borderRadius: 10, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  btnText: { color: colors.text, fontSize: 12, fontWeight: '800' },
});
