import { useCallback, useEffect, useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, Vibration, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/theme/colors';
import { cancelRestEnd, scheduleRestEnd } from '@/notifications/restNotification';

/** "1:28". Redondea hacia arriba: 0.3 s restantes se muestran como 0:01, no 0:00. */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

export const DEFAULT_REST_SECONDS = 90;

type TimerState = { endAt: number; totalMs: number; label: string } | null;

/**
 * Temporizador de descanso basado en la hora de fin (no en restar segundos): si la app pasa a segundo plano y
 * vuelve, muestra el tiempo correcto. Vibra al terminar mientras la app está abierta y, con la pantalla apagada,
 * avisa con una notificación local.
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

  // La notificación sigue a la hora de fin: al iniciar, sumar/restar o saltar el descanso.
  useEffect(() => {
    if (state) void scheduleRestEnd(state.endAt, state.label);
    else void cancelRestEnd();
  }, [state]);

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

export const HOLD_TO_EXIT_MS = 3000;

/**
 * Salida de emergencia del descanso obligatorio: hay que mantener el dedo 3 s. Se implementa a mano (pressIn →
 * temporizador, pressOut → cancela) en vez de con onLongPress, que se cancelaba con el refresco del reloj o con
 * un movimiento mínimo del dedo. La barra se llena para que se vea que está contando.
 */
export function HoldToExit({ onExit, holdMs = HOLD_TO_EXIT_MS }: { onExit: () => void; holdMs?: number }) {
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [progress, setProgress] = useState(0);
  const exitRef = useRef(onExit);
  exitRef.current = onExit;

  useEffect(() => {
    if (startedAt === null) { setProgress(0); return; }
    const id = setInterval(() => {
      const p = Math.min(1, (Date.now() - startedAt) / holdMs);
      setProgress(p);
      if (p >= 1) { clearInterval(id); setStartedAt(null); exitRef.current(); }
    }, 50);
    return () => clearInterval(id);
  }, [startedAt, holdMs]);

  const left = Math.ceil(((1 - progress) * holdMs) / 1000);
  return <Pressable accessibilityRole="button" accessibilityLabel="Salir del descanso (mantén presionado 3 segundos)"
    onPressIn={() => setStartedAt(Date.now())} onPressOut={() => setStartedAt(null)} pressRetentionOffset={{ top: 80, bottom: 80, left: 80, right: 80 }}
    hitSlop={16} style={f.emergency}>
    <View style={[f.emergencyFill, { width: `${Math.round(progress * 100)}%` }]}/>
    <Text style={f.emergencyText}>{startedAt === null ? 'Mantén presionado 3 s para salir' : `Saliendo en ${left} s… (suelta para cancelar)`}</Text>
  </Pressable>;
}

/**
 * Descanso obligatorio (preferencia del usuario): ocupa toda la pantalla y no se puede saltar.
 * Solo permite +15 s y, para emergencias, salir manteniendo presionado 3 segundos.
 * El botón "atrás" de Android no lo cierra.
 */
export function RestTimerFullScreen({ timer }: { timer: ReturnType<typeof useRestTimer> }) {
  const progress = timer.totalMs ? Math.min(1, Math.max(0, 1 - timer.remaining / timer.totalMs)) : 1;
  return <Modal visible={timer.active} animationType="fade" presentationStyle="fullScreen" onRequestClose={() => undefined} statusBarTranslucent>
    <View style={f.root}>
      <Text style={f.eyebrow}>{timer.done ? 'DESCANSO TERMINADO' : 'DESCANSO OBLIGATORIO'}</Text>
      <Text style={[f.clock, timer.done && f.clockDone]} accessibilityLabel={`Quedan ${formatClock(timer.remaining)}`}>{timer.done ? '¡A darle!' : formatClock(timer.remaining)}</Text>
      <View style={f.track}><View style={[f.fill, { width: `${Math.round(progress * 100)}%` }]}/></View>
      {timer.label ? <Text style={f.next}>{timer.label}</Text> : null}
      {timer.done
        ? <Pressable accessibilityRole="button" onPress={timer.stop} style={f.primary}><Text style={f.primaryText}>Continuar</Text></Pressable>
        : <>
          <Pressable accessibilityRole="button" accessibilityLabel="Agregar 15 segundos" onPress={() => timer.add(15)} style={f.secondary}><Text style={f.secondaryText}>+15 s</Text></Pressable>
          <HoldToExit onExit={timer.stop}/>
        </>}
    </View>
  </Modal>;
}

const f = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.black, alignItems: 'center', justifyContent: 'center', padding: 28, gap: 22 },
  eyebrow: { color: colors.secondary, fontSize: 13, fontWeight: '800', letterSpacing: 2 },
  clock: { color: colors.text, fontSize: 96, fontWeight: '800', letterSpacing: -2, fontVariant: ['tabular-nums'] },
  clockDone: { color: '#F5B841', fontSize: 64 },
  track: { width: '100%', height: 10, borderRadius: 5, backgroundColor: colors.surfaceRaised, overflow: 'hidden' },
  fill: { height: 10, borderRadius: 5, backgroundColor: colors.blue },
  next: { color: '#9DBDFF', fontSize: 16, fontWeight: '700', textAlign: 'center' },
  primary: { minWidth: 220, alignItems: 'center', paddingVertical: 16, borderRadius: 16, backgroundColor: colors.blue },
  primaryText: { color: 'white', fontSize: 18, fontWeight: '800' },
  secondary: { minWidth: 160, alignItems: 'center', paddingVertical: 14, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceRaised },
  secondaryText: { color: colors.text, fontSize: 16, fontWeight: '800' },
  emergency: { position: 'absolute', bottom: 48, left: 28, right: 28, alignItems: 'center', paddingVertical: 16, borderRadius: 14, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  emergencyFill: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: '#3A1D22' },
  emergencyText: { color: colors.secondary, fontSize: 13, fontWeight: '700' },
});
