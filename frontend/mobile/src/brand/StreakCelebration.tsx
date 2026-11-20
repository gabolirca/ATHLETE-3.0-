import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Modal, Pressable, StyleSheet, Text, Vibration, View } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { colors, themed } from '@/theme/colors';
import { display } from '@/theme/fonts';
import { BRAND, BRAND_COLOR, MARK_RATIO } from './assets';

const SEEN_KEY = 'athlete3.streak.seen';

/** ¿Hay que festejar? Solo cuando la racha SUBE respecto a la última vez que el socio la vio (y hoy ya entrenó). */
export function shouldCelebrate(current: number, seen: number | null, todayDone: boolean): boolean {
  return todayDone && current > 0 && current > (seen ?? 0);
}
export async function getSeenStreak(): Promise<number | null> {
  try { const v = await SecureStore.getItemAsync(SEEN_KEY); return v === null ? null : Number(v); } catch { return null; }
}
export async function setSeenStreak(n: number): Promise<void> {
  try { await SecureStore.setItemAsync(SEEN_KEY, String(n)); } catch { /* sin almacenamiento: se festejaría otra vez, no pasa nada */ }
}

/** Mensaje según el número (hitos como Duolingo). */
export function streakCheer(days: number): string {
  if (days === 1) return '¡Empezaste tu racha! Mañana la seguimos.';
  if (days === 7) return '¡Una semana completa! Eso es disciplina.';
  if (days % 30 === 0) return `¡${days / 30} ${days === 30 ? 'mes' : 'meses'} sin fallar! Leyenda de ATHLETE.`;
  if (days % 10 === 0) return `¡${days} días! Ya es un hábito.`;
  return '¡No la sueltes! Cada día cuenta.';
}

/**
 * Festejo de racha a pantalla completa: la A del logo cae, rebota y "late", y el número sube del anterior al nuevo.
 * Con "Reducir movimiento" solo aparece, sin brincos.
 */
export function StreakCelebration({ from, to, onClose }: { from: number; to: number | null; onClose: () => void }) {
  const [reduce, setReduce] = useState(false);
  const [shown, setShown] = useState(from);
  const drop = useRef(new Animated.Value(0)).current;
  const beat = useRef(new Animated.Value(1)).current;
  const spin = useRef(new Animated.Value(0)).current;
  const ring = useRef(new Animated.Value(0)).current;

  useEffect(() => { AccessibilityInfo.isReduceMotionEnabled().then(setReduce).catch(() => setReduce(true)); }, []);

  useEffect(() => {
    if (to === null) return;
    setShown(from);
    if (reduce) { drop.setValue(1); setShown(to); return; }
    drop.setValue(0); spin.setValue(0); ring.setValue(0); beat.setValue(1);
    Vibration.vibrate([0, 30, 60, 30]);
    const intro = Animated.parallel([
      Animated.spring(drop, { toValue: 1, friction: 4, tension: 70, useNativeDriver: true }),
      Animated.timing(spin, { toValue: 1, duration: 650, easing: Easing.out(Easing.back(1.6)), useNativeDriver: true }),
      Animated.timing(ring, { toValue: 1, duration: 900, easing: Easing.out(Easing.quad), useNativeDriver: true }),
    ]);
    const heart = Animated.loop(Animated.sequence([
      Animated.timing(beat, { toValue: 1.12, duration: 160, useNativeDriver: true }),
      Animated.timing(beat, { toValue: 1, duration: 160, useNativeDriver: true }),
      Animated.timing(beat, { toValue: 1.08, duration: 140, useNativeDriver: true }),
      Animated.timing(beat, { toValue: 1, duration: 500, useNativeDriver: true }),
    ]));
    const all = Animated.sequence([intro, heart]);
    all.start();
    // El número sube de uno en uno (como el contador de Duolingo).
    const steps = Math.max(1, to - from);
    const id = setInterval(() => setShown((n) => (n >= to ? n : n + 1)), Math.max(60, Math.round(500 / steps)));
    const stop = setTimeout(() => clearInterval(id), 1500);
    return () => { all.stop(); clearInterval(id); clearTimeout(stop); };
  }, [to, from, reduce, drop, beat, spin, ring]);

  if (to === null) return null;
  const size = 150, w = size, h = w / MARK_RATIO;
  const translateY = drop.interpolate({ inputRange: [0, 1], outputRange: [-260, 0] });
  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['-25deg', '0deg'] });
  return <Modal visible transparent animationType="fade" onRequestClose={onClose}>
    <View style={s.backdrop} accessibilityViewIsModal>
      <Animated.View pointerEvents="none" style={[s.ring, { opacity: ring.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0, 0.5, 0] }), transform: [{ scale: ring.interpolate({ inputRange: [0, 1], outputRange: [0.4, 2.2] }) }] }]}/>
      <Animated.View testID="streak-celebration-logo" style={{ transform: [{ translateY }, { rotate }, { scale: beat }] }}>
        <Animated.Image source={BRAND.mark} resizeMode="contain" style={{ width: w, height: h }}/>
      </Animated.View>
      <Text style={s.number} accessibilityLabel={`${to} ${to === 1 ? 'día' : 'días'} de racha`}>{shown}</Text>
      <Text style={s.title}>{to === 1 ? 'día de racha' : 'días de racha'}</Text>
      <Text style={s.cheer}>{streakCheer(to)}</Text>
      <Pressable accessibilityRole="button" onPress={onClose} style={({ pressed }) => [s.button, pressed && { opacity: 0.85 }]}><Text style={s.buttonText}>¡Vamos!</Text></Pressable>
    </View>
  </Modal>;
}

const s = themed(() => StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(10,10,10,0.96)', alignItems: 'center', justifyContent: 'center', padding: 28, gap: 8 },
  ring: { position: 'absolute', width: 220, height: 220, borderRadius: 110, borderWidth: 10, borderColor: BRAND_COLOR },
  number: { color: BRAND_COLOR, fontSize: 110, lineHeight: 112, marginTop: 18, ...display },
  title: { color: colors.text, fontSize: 30, ...display },
  cheer: { color: colors.secondary, fontSize: 16, textAlign: 'center', lineHeight: 23, marginTop: 4 },
  button: { marginTop: 28, alignSelf: 'stretch', minHeight: 60, borderRadius: 16, backgroundColor: colors.blue, alignItems: 'center', justifyContent: 'center' },
  buttonText: { color: 'white', fontSize: 26, ...display },
}));
