import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Image, StyleSheet, View } from 'react-native';
import { colors } from '@/theme/colors';
import { BRAND, BRAND_CYAN, MARK_RATIO } from './assets';

type Props = { lit: boolean; size?: number };

/**
 * La "A" de ATHLETE como ícono de la racha.
 * - Apagada (sin racha): gris y quieta.
 * - Encendida: entra con un impulso (crece y se endereza, como el trazo del logo) y luego "respira".
 * Respeta "Reducir movimiento" del teléfono: ahí solo cambia de color.
 */
export function AnimatedA({ lit, size = 56 }: Props) {
  const [reduce, setReduce] = useState<boolean | null>(null);
  const scale = useRef(new Animated.Value(1)).current;
  const swoosh = useRef(new Animated.Value(1)).current;
  const glow = useRef(new Animated.Value(lit ? 0.6 : 0)).current;

  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled().then((r) => { if (alive) setReduce(r); }).catch(() => { if (alive) setReduce(true); });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (reduce === null) return;
    if (!lit || reduce) { scale.setValue(1); swoosh.setValue(1); glow.setValue(lit ? 0.6 : 0); return; }
    scale.setValue(0.55); swoosh.setValue(0); glow.setValue(0);
    const ignite = Animated.parallel([
      Animated.spring(scale, { toValue: 1, friction: 4, tension: 120, useNativeDriver: true }),
      Animated.timing(swoosh, { toValue: 1, duration: 420, easing: Easing.out(Easing.back(2)), useNativeDriver: true }),
      Animated.timing(glow, { toValue: 1, duration: 420, useNativeDriver: true }),
    ]);
    const breathe = Animated.loop(Animated.sequence([
      Animated.parallel([
        Animated.timing(scale, { toValue: 1.07, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(glow, { toValue: 0.45, duration: 900, useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.timing(scale, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(glow, { toValue: 1, duration: 900, useNativeDriver: true }),
      ]),
    ]));
    const all = Animated.sequence([ignite, breathe]);
    all.start();
    return () => all.stop();
  }, [lit, reduce, scale, swoosh, glow]);

  const w = size * 0.86; const h = w / MARK_RATIO;
  const rotate = swoosh.interpolate({ inputRange: [0, 1], outputRange: ['-14deg', '0deg'] });
  const translateX = swoosh.interpolate({ inputRange: [0, 1], outputRange: [-size * 0.12, 0] });
  return <View testID={lit ? 'streak-a-lit' : 'streak-a-off'} accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
    style={[s.box, { width: size, height: size, borderRadius: size * 0.32 }, lit ? s.on : s.off]}>
    {lit ? <Animated.View pointerEvents="none" style={[s.glow, { width: size * 0.8, height: size * 0.8, borderRadius: size * 0.4, opacity: glow.interpolate({ inputRange: [0, 1], outputRange: [0, 0.22] }) }]}/> : null}
    <Animated.View style={{ transform: [{ translateX }, { rotate }, { scale }] }}>
      <Image source={BRAND.mark} resizeMode="contain" style={[{ width: w, height: h }, !lit && s.dim]}/>
    </Animated.View>
  </View>;
}

const s = StyleSheet.create({
  box: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  on: { backgroundColor: '#0C1A2C' }, off: { backgroundColor: colors.surfaceRaised },
  glow: { position: 'absolute', backgroundColor: BRAND_CYAN, transform: [{ scale: 1.1 }], shadowColor: BRAND_CYAN, shadowOpacity: 0.9, shadowRadius: 18 },
  dim: { tintColor: colors.muted, opacity: 0.6 },
});
