import { useCallback, useEffect, useState } from 'react';
import * as SecureStore from 'expo-secure-store';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, themed } from '@/theme/colors';

/**
 * Ícono y color de cada rutina. Si el usuario no elige, se sugiere uno por el nombre o por el músculo que más trabaja.
 * Se guarda en ESTE teléfono (no se sincroniza todavía).
 */
export const ROUTINE_ICONS = [
  { icon: 'dumbbell', label: 'Pesa' }, { icon: 'weight-lifter', label: 'Pierna' }, { icon: 'arm-flex', label: 'Brazo' },
  { icon: 'rowing', label: 'Espalda' }, { icon: 'human-handsup', label: 'Hombro' }, { icon: 'human-handsdown', label: 'Core' },
  { icon: 'kettlebell', label: 'Kettlebell' }, { icon: 'weight', label: 'Fuerza' }, { icon: 'run', label: 'Correr' },
  { icon: 'bike', label: 'Bici' }, { icon: 'swim', label: 'Nadar' }, { icon: 'heart-pulse', label: 'Cardio' },
  { icon: 'jump-rope', label: 'Cuerda' }, { icon: 'boxing-glove', label: 'Box' }, { icon: 'karate', label: 'Combate' },
  { icon: 'yoga', label: 'Movilidad' }, { icon: 'stairs', label: 'Escaleras' }, { icon: 'fire', label: 'Quema' },
  { icon: 'lightning-bolt', label: 'Potencia' }, { icon: 'trophy-outline', label: 'Reto' },
] as const;

export const ROUTINE_COLORS = ['blue', 'green', 'amber', 'red', 'cyan', 'purple'] as const;
export type RoutineColor = (typeof ROUTINE_COLORS)[number];
export type RoutineStyle = { icon: string; color: RoutineColor };

const COLOR_LABELS: Record<RoutineColor, string> = { blue: 'azul', green: 'verde', amber: 'ámbar', red: 'rojo', cyan: 'cian', purple: 'morado' };
export const routineColor = (c: RoutineColor): string => colors[c];
export const routineSoft = (c: RoutineColor): string => `${colors[c]}26`;

const NAME_HINTS: Array<[RegExp, RoutineStyle]> = [
  [/pierna|leg|cu[aá]d|gl[uú]te/i, { icon: 'weight-lifter', color: 'blue' }],
  [/pecho|chest|push|empuje/i, { icon: 'dumbbell', color: 'blue' }],
  [/espalda|back|pull|jal[oó]n/i, { icon: 'rowing', color: 'green' }],
  [/brazo|arm|b[ií]cep|tr[ií]cep/i, { icon: 'arm-flex', color: 'amber' }],
  [/hombro|shoulder/i, { icon: 'human-handsup', color: 'amber' }],
  [/abd|core/i, { icon: 'human-handsdown', color: 'green' }],
  [/nata|alberca|swim|nado/i, { icon: 'swim', color: 'cyan' }],
  [/correr|run|carrera/i, { icon: 'run', color: 'red' }],
  [/bici|spin|ciclo/i, { icon: 'bike', color: 'red' }],
  [/cardio|hiit|wod|metcon/i, { icon: 'heart-pulse', color: 'red' }],
  [/box|combate|mma/i, { icon: 'boxing-glove', color: 'red' }],
  [/movilidad|yoga|estira/i, { icon: 'yoga', color: 'purple' }],
];

const MUSCLE_HINTS: Record<string, RoutineStyle> = {
  quadriceps: { icon: 'weight-lifter', color: 'blue' }, hamstrings: { icon: 'weight-lifter', color: 'blue' }, glutes: { icon: 'weight-lifter', color: 'blue' }, calves: { icon: 'weight-lifter', color: 'blue' },
  chest: { icon: 'dumbbell', color: 'blue' }, back: { icon: 'rowing', color: 'green' }, traps: { icon: 'rowing', color: 'green' },
  shoulders: { icon: 'human-handsup', color: 'amber' }, biceps: { icon: 'arm-flex', color: 'amber' }, triceps: { icon: 'arm-flex', color: 'amber' },
  core: { icon: 'human-handsdown', color: 'green' },
};

/** Sugerencia automática: primero el nombre ("Pierna A"), luego el músculo con más series. */
export function suggestRoutineStyle(name: string, topMuscle?: string | null): RoutineStyle {
  for (const [re, style] of NAME_HINTS) if (re.test(name)) return style;
  return (topMuscle && MUSCLE_HINTS[topMuscle]) || { icon: 'dumbbell', color: 'blue' };
}

const key = (id: string) => `athlete3.routineStyle.${id.replace(/[^A-Za-z0-9._-]/g, '_')}`;
const isColor = (c: unknown): c is RoutineColor => ROUTINE_COLORS.includes(c as RoutineColor);

export async function getRoutineStyle(id: string): Promise<RoutineStyle | null> {
  try {
    const raw = await SecureStore.getItemAsync(key(id));
    const v = raw ? JSON.parse(raw) as Partial<RoutineStyle> : null;
    return v && typeof v.icon === 'string' && isColor(v.color) ? { icon: v.icon, color: v.color } : null;
  } catch { return null; }
}
export async function setRoutineStyle(id: string, style: RoutineStyle): Promise<void> {
  await SecureStore.setItemAsync(key(id), JSON.stringify(style));
}

/** Estilos elegidos para varias rutinas (las que no tienen, no aparecen en el mapa). */
export function useRoutineStyles(ids: readonly string[]): [Record<string, RoutineStyle>, (id: string, style: RoutineStyle) => void] {
  const [map, setMap] = useState<Record<string, RoutineStyle>>({});
  const joined = ids.join('|');
  useEffect(() => {
    let active = true;
    void Promise.all(ids.map(async (id) => [id, await getRoutineStyle(id)] as const)).then((pairs) => {
      if (active) setMap(Object.fromEntries(pairs.filter(([, v]) => v) as Array<[string, RoutineStyle]>));
    });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [joined]);
  const update = useCallback((id: string, style: RoutineStyle) => {
    setMap((m) => ({ ...m, [id]: style }));
    void setRoutineStyle(id, style).catch(() => undefined);
  }, []);
  return [map, update];
}

/** Mosaico con el ícono de la rutina. */
export function RoutineBadge({ style, size = 44 }: { style: RoutineStyle; size?: number }) {
  return <View style={[s.badge, { width: size, height: size, borderRadius: size * 0.3, backgroundColor: routineSoft(style.color) }]}>
    <MaterialCommunityIcons name={style.icon as never} size={size * 0.55} color={routineColor(style.color)}/>
  </View>;
}

/** Cuadrícula de íconos + colores para elegir. */
export function RoutineStylePicker({ value, onChange }: { value: RoutineStyle; onChange: (style: RoutineStyle) => void }) {
  return <View style={s.picker}>
    <View style={s.colors}>{ROUTINE_COLORS.map((c) => <Pressable key={c} accessibilityRole="button" accessibilityLabel={`Color ${COLOR_LABELS[c]}`} accessibilityState={{ selected: value.color === c }}
      onPress={() => onChange({ ...value, color: c })} style={[s.color, { backgroundColor: routineColor(c) }, value.color === c && s.colorOn]}/>)}</View>
    <View style={s.grid}>{ROUTINE_ICONS.map((i) => {
      const on = value.icon === i.icon;
      return <Pressable key={i.icon} accessibilityRole="button" accessibilityLabel={`Ícono ${i.label}`} accessibilityState={{ selected: on }} onPress={() => onChange({ ...value, icon: i.icon })}
        style={[s.cell, on && { borderColor: routineColor(value.color), backgroundColor: routineSoft(value.color) }]}>
        <MaterialCommunityIcons name={i.icon as never} size={24} color={on ? routineColor(value.color) : colors.secondary}/>
        <Text style={[s.cellLabel, on && { color: colors.text }]} numberOfLines={1}>{i.label}</Text>
      </Pressable>;
    })}</View>
  </View>;
}

/** Hoja para cambiar el ícono de una rutina ya creada. */
export function RoutineStyleSheet({ visible, title, value, onSave, onClose }: { visible: boolean; title: string; value: RoutineStyle; onSave: (style: RoutineStyle) => void; onClose: () => void }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => { if (visible) setDraft(value); }, [visible, value]);
  return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
    <Pressable style={s.backdrop} onPress={onClose} accessibilityLabel="Cerrar"/>
    <View style={s.sheet}>
      <View style={s.sheetHead}>
        <RoutineBadge style={draft} size={48}/>
        <View style={{ flex: 1 }}><Text style={s.sheetEyebrow}>ÍCONO DE LA RUTINA</Text><Text style={s.sheetTitle} numberOfLines={1}>{title}</Text></View>
      </View>
      <RoutineStylePicker value={draft} onChange={setDraft}/>
      <Pressable accessibilityRole="button" accessibilityLabel="Guardar ícono" onPress={() => { onSave(draft); onClose(); }} style={s.save}><Text style={s.saveText}>Guardar</Text></Pressable>
    </View>
  </Modal>;
}

const s = themed(() => StyleSheet.create({
  badge: { alignItems: 'center', justifyContent: 'center' },
  picker: { gap: 12 },
  colors: { flexDirection: 'row', gap: 10 },
  color: { width: 30, height: 30, borderRadius: 15, borderWidth: 3, borderColor: 'transparent' },
  colorOn: { borderColor: colors.text },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  cell: { width: '23%', alignItems: 'center', gap: 3, paddingVertical: 9, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceRaised },
  cellLabel: { color: colors.secondary, fontSize: 10, fontWeight: '700' },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 18, paddingBottom: 34, gap: 14, borderTopWidth: 1, borderColor: colors.border },
  sheetHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  sheetEyebrow: { color: colors.secondary, fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  sheetTitle: { color: colors.text, fontSize: 18, fontWeight: '800' },
  save: { backgroundColor: colors.blue, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  saveText: { color: 'white', fontSize: 15, fontWeight: '800' },
}));
