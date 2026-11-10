import { useEffect, useRef, useState } from 'react';
import { Animated, Image, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const SPLASH = require('../../assets/brand/splash-icon.png') as number;
const BY_LIRCA = require('../../assets/brand/by-lirca.png') as number;
const BY_RATIO = 502 / 81;

/**
 * Entrada tipo Instagram ("from Meta"): justo después del splash nativo, la misma "A" en el centro y
 * "by LIRCA" abajo; luego se desvanece. El splash nativo solo admite una imagen centrada, por eso va aquí.
 */
export function BrandIntro({ holdMs = 1100 }: { holdMs?: number }) {
  const insets = useSafeAreaInsets();
  const [gone, setGone] = useState(false);
  const opacity = useRef(new Animated.Value(1)).current;
  const by = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const anim = Animated.sequence([
      Animated.timing(by, { toValue: 1, duration: 350, useNativeDriver: true }),
      Animated.delay(holdMs),
      Animated.timing(opacity, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]);
    anim.start(({ finished }) => { if (finished) setGone(true); });
    return () => anim.stop();
  }, [by, opacity, holdMs]);
  if (gone) return null;
  return <Animated.View testID="brand-intro" pointerEvents="none" style={[s.root, { opacity }]} accessibilityLabel="ATHLETE by LIRCA">
    <Image source={SPLASH} style={s.mark} resizeMode="contain"/>
    <Animated.View style={[s.by, { bottom: insets.bottom + 36, opacity: by }]}>
      <Image source={BY_LIRCA} style={{ height: 22, width: 22 * BY_RATIO }} resizeMode="contain"/>
    </Animated.View>
  </Animated.View>;
}

const s = StyleSheet.create({
  root: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: '#0B0E14', alignItems: 'center', justifyContent: 'center', zIndex: 100 },
  mark: { width: 200, height: 200 },
  by: { position: 'absolute', alignSelf: 'center' },
});
