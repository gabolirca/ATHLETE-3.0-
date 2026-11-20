import { PropsWithChildren } from 'react';
import { StyleSheet, View } from 'react-native';
import { colors, themed } from '@/theme/colors';
export function Card({ children, accent }: PropsWithChildren<{ accent?: string }>) { return <View style={[styles.card, accent ? { borderColor: accent } : null]}>{children}</View>; }
const styles = themed(() => StyleSheet.create({ card: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 20, padding: 18, gap: 14 } }));
