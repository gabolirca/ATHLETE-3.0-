import { PropsWithChildren } from 'react';
import { Text, TextProps, StyleSheet } from 'react-native';
import { colors } from '@/theme/colors';
export function Title({ children }: PropsWithChildren) { return <Text style={s.title}>{children}</Text>; }
export function Label({ children, style }: PropsWithChildren<TextProps>) { return <Text style={[s.label, style]}>{children}</Text>; }
export function Eyebrow({ children }: PropsWithChildren) { return <Text style={s.eyebrow}>{children}</Text>; }
const s = StyleSheet.create({ title: { color: colors.text, fontSize: 28, fontWeight: '800', letterSpacing: -0.8 }, label: { color: colors.text, fontSize: 15, fontWeight: '700' }, eyebrow: { color: colors.secondary, fontSize: 11, fontWeight: '700', letterSpacing: 1.4, textTransform: 'uppercase' } });
