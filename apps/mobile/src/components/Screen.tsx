import { PropsWithChildren, useCallback, useEffect, useRef, useState } from 'react';
import { Keyboard, Platform, ScrollView, StyleSheet, TextInput, View, type KeyboardEvent, type ScrollViewInstance } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '@/theme/colors';
import { onInputFocus, revealScrollY } from './keyboardReveal';

/**
 * Pantalla con scroll que nunca deja el campo enfocado detrás del teclado:
 *  - al abrir el teclado (y al cambiar de campo con el teclado abierto) mide el campo y recorre el scroll;
 *  - agrega espacio abajo del alto del teclado para que el último campo también pueda subir.
 */
export function Screen({ children }: PropsWithChildren) {
  const scroll = useRef<ScrollViewInstance>(null);
  const scrollY = useRef(0);
  const keyboardTop = useRef<number | null>(null);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  const reveal = useCallback(() => {
    const top = keyboardTop.current;
    const input = TextInput.State.currentlyFocusedInput?.() as unknown as { measureInWindow?: (cb: (x: number, y: number, w: number, h: number) => void) => void } | null;
    if (top === null || !input?.measureInWindow) return;
    input.measureInWindow((_x, y, _w, h) => {
      const next = revealScrollY({ inputTop: y, inputHeight: h, keyboardTop: top, scrollY: scrollY.current });
      if (next !== null) scroll.current?.scrollTo({ y: next, animated: true });
    });
  }, []);

  useEffect(() => {
    const show = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hide = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const onShow = (e: KeyboardEvent) => {
      keyboardTop.current = e.endCoordinates.screenY;
      setKeyboardHeight(e.endCoordinates.height);
      // Espera a que el espacio extra se aplique antes de medir.
      setTimeout(reveal, Platform.OS === 'ios' ? 60 : 120);
    };
    const onHide = () => { keyboardTop.current = null; setKeyboardHeight(0); };
    const subs = [Keyboard.addListener(show, onShow), Keyboard.addListener(hide, onHide)];
    const offFocus = onInputFocus(() => setTimeout(reveal, 30)); // cambiar de campo con el teclado abierto
    return () => { subs.forEach((sub) => sub.remove()); offFocus(); };
  }, [reveal]);

  return <SafeAreaView style={styles.safe} edges={['top']}>
    <ScrollView ref={scroll} contentContainerStyle={[styles.content, keyboardHeight ? { paddingBottom: 30 + keyboardHeight } : null]}
      showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive"
      scrollEventThrottle={16} onScroll={(e) => { scrollY.current = e.nativeEvent.contentOffset.y; }}>
      {children}
    </ScrollView>
  </SafeAreaView>;
}
export function Row({ children, style }: PropsWithChildren<{ style?: object }>) { return <View style={[styles.row, style]}>{children}</View>; }
const styles = StyleSheet.create({ safe: { flex: 1, backgroundColor: colors.black }, content: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 30, gap: 22 }, row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' } });
