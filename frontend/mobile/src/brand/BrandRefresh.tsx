import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Easing, Image, StyleSheet, View } from 'react-native';
import { BRAND, MARK_RATIO } from './assets';

/** La "A" del logo girando y latiendo mientras se actualiza (en lugar del círculo genérico del sistema). */
export function MFSpinner({ size = 34 }: { size?: number }) {
  const spin = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.timing(spin, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.cubic), useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [spin]);
  const rotateY = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const scale = spin.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 0.82, 1] });
  return <View style={s.wrap} accessibilityLabel="Actualizando" accessibilityRole="progressbar">
    <Animated.View style={{ transform: [{ perspective: 400 }, { rotateY }, { scale }] }}>
      <Image source={BRAND.mark} style={{ width: size, height: size / MARK_RATIO}} resizeMode="contain"/>
    </Animated.View>
  </View>;
}

/**
 * Deslizar hacia abajo para actualizar, como en Instagram: el usuario solo siente que "ya está".
 * `run` hace el trabajo (sincronizar, recargar); el indicador dura al menos 700 ms para que se alcance a ver.
 */
export function usePullRefresh(run: () => Promise<unknown>): { refreshing: boolean; onRefresh: () => void } {
  const [refreshing, setRefreshing] = useState(false);
  const busy = useRef(false);
  const onRefresh = useCallback(() => {
    if (busy.current) return;
    busy.current = true; setRefreshing(true);
    const min = new Promise((r) => setTimeout(r, 700));
    void Promise.allSettled([run(), min]).finally(() => { busy.current = false; setRefreshing(false); });
  }, [run]);
  return { refreshing, onRefresh };
}

const s = StyleSheet.create({ wrap: { alignItems: 'center', justifyContent: 'center', paddingVertical: 6 } });
