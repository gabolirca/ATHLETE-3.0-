import { useEffect, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '@/theme/colors';
import { MONTHS, dayLabel, localDateOfDevice, monthGrid, parseLocalDate } from '@/lib/localDate';

const HEAD = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

/** Calendario en hoja inferior. No permite días futuros (no se registra lo que aún no pasa). */
export function DatePickerSheet({ visible, value, onSelect, onClose }: {
  visible: boolean;
  value: string;
  onSelect: (localDate: string) => void;
  onClose: () => void;
}) {
  const today = localDateOfDevice(new Date());
  const [cursor, setCursor] = useState(() => parseLocalDate(value));
  useEffect(() => { if (visible) setCursor(parseLocalDate(value)); }, [visible, value]);
  const { year, month } = cursor;
  const todayParts = parseLocalDate(today);
  const atCurrentMonth = year === todayParts.year && month === todayParts.month;
  const move = (delta: number) => {
    const d = new Date(year, month - 1 + delta, 1);
    setCursor({ year: d.getFullYear(), month: d.getMonth() + 1, day: 1 });
  };
  const pick = (d: string) => { onSelect(d); onClose(); };

  return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
    <Pressable style={s.backdrop} accessibilityLabel="Cerrar calendario" onPress={onClose}/>
    <View style={s.sheet}>
      <View style={s.head}>
        <Pressable accessibilityRole="button" accessibilityLabel="Mes anterior" onPress={() => move(-1)} style={s.nav}><Ionicons name="chevron-back" size={20} color={colors.text}/></Pressable>
        <Text style={s.month}>{MONTHS[month - 1]} {year}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Mes siguiente" disabled={atCurrentMonth} onPress={() => move(1)} style={[s.nav, atCurrentMonth && s.off]}><Ionicons name="chevron-forward" size={20} color={colors.text}/></Pressable>
      </View>
      <View style={s.week}>{HEAD.map((h, i) => <Text key={i} style={s.weekday}>{h}</Text>)}</View>
      {monthGrid(year, month).map((week, wi) => <View key={wi} style={s.week}>
        {week.map((d, di) => {
          if (!d) return <View key={di} style={s.cell}/>;
          const future = d > today;
          const selected = d === value;
          return <Pressable key={d} accessibilityRole="button" accessibilityLabel={dayLabel(d, today)} accessibilityState={{ selected, disabled: future }}
            disabled={future} onPress={() => pick(d)} style={[s.cell, selected && s.selected, future && s.off]}>
            <Text style={[s.dayText, d === today && !selected && s.today, selected && s.selectedText]}>{parseLocalDate(d).day}</Text>
          </Pressable>;
        })}
      </View>)}
      <View style={s.actions}>
        <Pressable accessibilityRole="button" onPress={() => pick(today)} style={s.action}><Text style={s.actionText}>Hoy</Text></Pressable>
        <Pressable accessibilityRole="button" onPress={onClose} style={s.action}><Text style={s.actionMuted}>Cerrar</Text></Pressable>
      </View>
    </View>
  </Modal>;
}

/** Botón que muestra el día elegido y abre el calendario. */
export function DateField({ value, onChange, label = 'Día' }: { value: string; onChange: (localDate: string) => void; label?: string }) {
  const [open, setOpen] = useState(false);
  const today = localDateOfDevice(new Date());
  return <>
    <Pressable accessibilityRole="button" accessibilityLabel={`${label}: ${dayLabel(value, today)}. Cambiar día`} onPress={() => setOpen(true)} style={s.field}>
      <Ionicons name="calendar-outline" size={17} color={colors.blue}/>
      <Text style={s.fieldLabel}>{label}</Text>
      <Text style={s.fieldValue}>{dayLabel(value, today)}</Text>
      <Ionicons name="chevron-down" size={15} color={colors.secondary}/>
    </Pressable>
    <DatePickerSheet visible={open} value={value} onSelect={onChange} onClose={() => setOpen(false)}/>
  </>;
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 18, paddingBottom: 34, gap: 8, borderWidth: 1, borderColor: colors.border },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  nav: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceRaised },
  month: { color: colors.text, fontSize: 16, fontWeight: '800', textTransform: 'capitalize' },
  week: { flexDirection: 'row' },
  weekday: { flex: 1, textAlign: 'center', color: colors.muted, fontSize: 11, fontWeight: '700', paddingVertical: 4 },
  cell: { flex: 1, aspectRatio: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 12 },
  selected: { backgroundColor: colors.blue },
  off: { opacity: 0.3 },
  dayText: { color: colors.text, fontSize: 14, fontWeight: '600' },
  today: { color: colors.blue, fontWeight: '800' },
  selectedText: { color: 'white', fontWeight: '800' },
  actions: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  action: { paddingVertical: 10, paddingHorizontal: 14 },
  actionText: { color: colors.blue, fontSize: 14, fontWeight: '800' },
  actionMuted: { color: colors.secondary, fontSize: 14, fontWeight: '700' },
  field: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 46, paddingHorizontal: 13, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceRaised },
  fieldLabel: { color: colors.secondary, fontSize: 12, fontWeight: '700' },
  fieldValue: { flex: 1, color: colors.text, fontSize: 14, fontWeight: '800', textTransform: 'capitalize' },
});
