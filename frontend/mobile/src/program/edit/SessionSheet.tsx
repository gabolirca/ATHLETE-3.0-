import { useEffect, useState } from 'react';
import { Pressable, Text } from 'react-native';
import { ActionButton } from '@/components/ActionButton';
import { AppInput } from '@/components/AppInput';
import type { ProgramDay, SessionModality } from '@/data/trainingTypes';
import { MODALITY, WEEKDAYS } from '../format';
import { Choices, Sheet, sheetStyles as st } from './Sheet';

export const WEEKDAY_OPTIONS = WEEKDAYS.map((d, i) => ({ value: i + 1, label: d.slice(0, 3) }));
export const MODALITY_OPTIONS = (['strength', 'conditioning', 'swim', 'run', 'bike', 'row', 'mobility'] as const).map((m) => ({ value: m, label: MODALITY[m].label }));

/**
 * Crear o editar una sesión del programa: nombre, día y modalidad. Al editar también se puede duplicar a otro día o quitar.
 */
export function SessionSheet({ visible, day, onClose, onSave, onDuplicate, onDelete }: {
  visible: boolean; day: ProgramDay | null; onClose: () => void;
  onSave: (v: { name: string; weekday: number; modality: SessionModality }) => Promise<void>;
  onDuplicate?: (weekday: number) => Promise<void>; onDelete?: () => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [weekday, setWeekday] = useState(1);
  const [modality, setModality] = useState<SessionModality>('strength');
  const [copyTo, setCopyTo] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [key, setKey] = useState(0);
  useEffect(() => {
    if (!visible) return;
    setName(day?.name ?? ''); setWeekday(day?.weekday ?? 1); setModality(day?.modality ?? 'strength'); setCopyTo(null); setError(''); setKey((k) => k + 1);
  }, [visible, day]);
  const run = async (fn: () => Promise<void>) => { setBusy(true); try { await fn(); onClose(); } catch { setError('No se pudo guardar. Intenta de nuevo.'); } finally { setBusy(false); } };
  return <Sheet visible={visible} title={day ? 'Editar sesión' : 'Nueva sesión'} onClose={onClose}>
    <AppInput key={`n-${key}`} label="Nombre" defaultValue={name} onChangeText={setName} placeholder="Ej. Natación suave" maxLength={120} autoCapitalize="sentences"/>
    <Text style={st.label}>DÍA</Text>
    <Choices label="Día" options={WEEKDAY_OPTIONS} value={weekday} onChange={setWeekday}/>
    <Text style={st.label}>MODALIDAD</Text>
    <Choices label="Modalidad" options={MODALITY_OPTIONS} value={modality} onChange={setModality}/>
    {error ? <Text accessibilityRole="alert" style={st.error}>{error}</Text> : null}
    <ActionButton loading={busy} onPress={() => {
      if (name.trim().length < 2) { setError('Escribe un nombre de al menos 2 letras.'); return; }
      void run(() => onSave({ name, weekday, modality }));
    }}>{day ? 'Guardar cambios' : 'Agregar sesión'}</ActionButton>
    {day && onDuplicate ? <>
      <Text style={st.label}>DUPLICAR A OTRO DÍA</Text>
      <Choices label="Duplicar a" options={WEEKDAY_OPTIONS} value={copyTo} onChange={setCopyTo}/>
      {copyTo ? <ActionButton secondary loading={busy} onPress={() => void run(() => onDuplicate(copyTo))}>{`Duplicar al ${WEEKDAYS[copyTo - 1]!.toLowerCase()}`}</ActionButton> : null}
    </> : null}
    {day && onDelete ? <Pressable accessibilityRole="button" onPress={() => void run(onDelete)}><Text style={st.danger}>Quitar esta sesión</Text></Pressable> : null}
  </Sheet>;
}
