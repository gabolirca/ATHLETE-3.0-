import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { ActionButton } from '@/components/ActionButton';
import { AppInput } from '@/components/AppInput';
import type { ProgramBlock, ProgramBlockInput } from '@/data/trainingTypes';
import { Choices, Sheet, sheetStyles as st } from './Sheet';

export const FORMAT_OPTIONS = [
  { value: 'sets', label: 'Series' }, { value: 'rounds', label: 'Rondas' }, { value: 'amrap', label: 'AMRAP' }, { value: 'emom', label: 'EMOM' },
  { value: 'for_time', label: 'Por tiempo' }, { value: 'intervals', label: 'Intervalos' }, { value: 'continuous', label: 'Continuo' },
] as const;
const RPE_OPTIONS = [5, 6, 7, 8, 9].map((n) => ({ value: n, label: `RPE ${n}` }));
export const FORMAT_HELP: Record<ProgramBlockInput['format'], string> = {
  sets: 'Series × repeticiones de cada ejercicio (fuerza clásica).',
  rounds: 'Repite el circuito N rondas, con descanso entre rondas.',
  amrap: 'Tantas rondas como puedas en el tiempo. Se anotan rondas + reps.',
  emom: 'Cada minuto, durante el tiempo indicado.',
  for_time: 'Termina lo antes posible. Se anota tu tiempo.',
  intervals: 'Repeticiones de distancia o tiempo (4 × 50 m, 6 × 400 m).',
  continuous: 'Un esfuerzo seguido (zona 2, 800 m suaves, movilidad).',
};

/** Validación del bloque: AMRAP y EMOM necesitan duración; rondas necesita cuántas. */
export function parseBlockForm(v: { name: string; format: ProgramBlockInput['format']; rounds: string; minutes: string; rest: string; rpe: number | null }): { ok: true; value: ProgramBlockInput } | { ok: false; error: string } {
  if (v.name.trim().length < 2) return { ok: false, error: 'Escribe un nombre para el bloque.' };
  const int = (x: string) => (x.trim() === '' ? null : Number(x.trim()));
  const rounds = int(v.rounds), minutes = int(v.minutes), rest = int(v.rest);
  for (const n of [rounds, minutes, rest]) if (n !== null && (!Number.isInteger(n) || n < 0)) return { ok: false, error: 'Usa números enteros.' };
  if ((v.format === 'amrap' || v.format === 'emom') && !minutes) return { ok: false, error: 'Indica cuántos minutos dura el bloque.' };
  if (v.format === 'rounds' && !rounds) return { ok: false, error: 'Indica cuántas rondas.' };
  return { ok: true, value: {
    name: v.name, format: v.format, rounds: v.format === 'rounds' ? rounds : null,
    timeCapSeconds: v.format === 'amrap' || v.format === 'emom' || v.format === 'for_time' ? (minutes ? minutes * 60 : null) : null,
    restSeconds: v.format === 'rounds' ? rest : null, targetRpe: v.rpe, notes: null,
  } };
}

export function BlockSheet({ visible, block, onClose, onSave, onDelete }: {
  visible: boolean; block: ProgramBlock | null; onClose: () => void; onSave: (v: ProgramBlockInput) => Promise<void>; onDelete?: () => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [format, setFormat] = useState<ProgramBlockInput['format']>('sets');
  const [rounds, setRounds] = useState('');
  const [minutes, setMinutes] = useState('');
  const [rest, setRest] = useState('');
  const [rpe, setRpe] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [key, setKey] = useState(0);
  useEffect(() => {
    if (!visible) return;
    setName(block?.name ?? ''); setFormat(block?.format ?? 'sets'); setRounds(block?.rounds ? String(block.rounds) : '');
    setMinutes(block?.timeCapSeconds ? String(Math.round(block.timeCapSeconds / 60)) : ''); setRest(block?.restSeconds ? String(block.restSeconds) : '');
    setRpe(block?.targetRpe ?? null); setError(''); setKey((k) => k + 1);
  }, [visible, block]);
  const num = { keyboardType: 'number-pad' as const, autoCorrect: false, spellCheck: false };
  return <Sheet visible={visible} title={block ? 'Editar bloque' : 'Nuevo bloque'} onClose={onClose}>
    <AppInput key={`n-${key}`} label="Nombre" defaultValue={name} onChangeText={setName} placeholder="Ej. B · Circuito" maxLength={120} autoCapitalize="sentences"/>
    <Text style={st.label}>FORMATO</Text>
    <Choices label="Formato" options={FORMAT_OPTIONS} value={format} onChange={setFormat}/>
    <Text style={st.hint}>{FORMAT_HELP[format]}</Text>
    <View style={st.row}>
      {format === 'rounds' ? <View style={st.flex}><AppInput key={`r-${key}`} label="Rondas" defaultValue={rounds} onChangeText={setRounds} {...num} maxLength={3}/></View> : null}
      {format === 'rounds' ? <View style={st.flex}><AppInput key={`d-${key}`} label="Descanso entre rondas (s)" defaultValue={rest} onChangeText={setRest} {...num} maxLength={4}/></View> : null}
      {format === 'amrap' || format === 'emom' || format === 'for_time' ? <View style={st.flex}><AppInput key={`m-${key}`} label={format === 'for_time' ? 'Tope (min, opcional)' : 'Duración (min)'} defaultValue={minutes} onChangeText={setMinutes} {...num} maxLength={3}/></View> : null}
    </View>
    <Text style={st.label}>ESFUERZO OBJETIVO (OPCIONAL)</Text>
    <Choices label="RPE" options={RPE_OPTIONS} value={rpe} onChange={(v) => setRpe(rpe === v ? null : v)}/>
    {error ? <Text accessibilityRole="alert" style={st.error}>{error}</Text> : null}
    <ActionButton loading={busy} onPress={async () => {
      const parsed = parseBlockForm({ name, format, rounds, minutes, rest, rpe });
      if (!parsed.ok) { setError(parsed.error); return; }
      setBusy(true);
      try { await onSave(parsed.value); onClose(); } catch { setError('No se pudo guardar el bloque.'); } finally { setBusy(false); }
    }}>{block ? 'Guardar bloque' : 'Agregar bloque'}</ActionButton>
    {block && onDelete ? <Pressable accessibilityRole="button" onPress={async () => { setBusy(true); try { await onDelete(); onClose(); } finally { setBusy(false); } }}><Text style={st.danger}>Quitar bloque y sus ejercicios</Text></Pressable> : null}
  </Sheet>;
}
