import { StyleSheet, View } from 'react-native';
import { Label } from './Typography';
import { colors } from '@/theme/colors';
export function SectionHeading({ title, action }: { title: string; action?: string }) { return <View style={s.row}><Label>{title}</Label>{action ? <Label style={s.action}>{action}</Label> : null}</View>; }
const s = StyleSheet.create({ row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, action: { color: colors.blue, fontSize: 12 } });
