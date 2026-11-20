import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { AppInput } from './AppInput';
import { Card } from './Card';
import { LoggedSetSchema, type LoggedSetInput } from '@/data/trainingSchemas';
import type { TrainingSet } from '@/data/trainingTypes';
import { colors, themed } from '@/theme/colors';
import { display } from '@/theme/fonts';
import { rirLabel, rirOptions } from './rirOptions';
import { toDisplay, toKg, type WeightUnit } from '@/settings/weightUnits';

/** Lo que hiciste en esta misma serie la vez pasada (guía, no se guarda solo). */
export type PreviousSet = { weightKg: number | null; reps: number | null };

const fmt = (n: number | null) => (n === null ? '—' : String(n));

/** Carga sugerida para hoy (ver `suggestLoad`). */
export type SuggestedSet = { weightKg: number | null; reps: number };

/**
 * Una serie de fuerza. `unit` solo cambia cómo se escribe el peso: siempre se guarda en kg.
 * `bodyweight`: ejercicio con peso corporal; el peso es lastre opcional y basta con las repeticiones.
 * `total`: series del plan, para mostrar "SERIE 2/3".
 */
export function SetEditor({ set, onSave, targetRir = null, previous = null, suggestion = null, unit = 'kg', onUnitChange, bodyweight = false, total = null }: {
  set: TrainingSet; onSave: (input: LoggedSetInput) => Promise<void>; targetRir?: number | null; previous?: PreviousSet | null; suggestion?: SuggestedSet | null;
  unit?: WeightUnit; onUnitChange?: (unit: WeightUnit) => void; bodyweight?: boolean; total?: number | null;
}) {
  const shown = (kg: number | null) => { const v = toDisplay(kg, unit); return v === null ? '' : String(v); };
  const [weight, setWeight] = useState(shown(set.weightKg));
  const [reps, setReps] = useState(set.reps === null ? '' : String(set.reps));
  const [rir, setRir] = useState<number | null>(set.rir);
  const [warmup, setWarmup] = useState(set.isWarmup);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [precise, setPrecise] = useState(false);
  // Campos no controlados (arreglo del teclado de iOS 27): al cambiar el valor desde fuera se remontan con otra key.
  const [inputKey, setInputKey] = useState(0);
  const lastSaved = useRef<LoggedSetInput>({ weightKg: set.weightKg, reps: set.reps, rir: set.rir, isWarmup: set.isWarmup });
  const rirIsOutOfRange = set.rir !== null && (set.rir < 0 || set.rir > 10 || !Number.isInteger(set.rir * 2));
  // Si el valor guardado es inválido, se despliega todo para poder corregirlo.
  const options = rirOptions({ targetRir, current: rir, expanded: expanded || rirIsOutOfRange, precise });

  useEffect(() => {
    lastSaved.current = { weightKg: set.weightKg, reps: set.reps, rir: set.rir, isWarmup: set.isWarmup };
    setWeight(shown(set.weightKg));
    setReps(set.reps === null ? '' : String(set.reps));
    setRir(set.rir);
    setWarmup(set.isWarmup);
    setInputKey((k) => k + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [set.id, set.weightKg, set.reps, set.rir, set.isWarmup, unit]);

  async function persist(nextRir = rir, warmupValue = warmup, values: { weight: string; reps: string } = { weight, reps }) {
    if (saving) return;
    const w = values.weight.trim().replace(',', '.');
    const r = values.reps.trim();
    const parsed = LoggedSetSchema.safeParse({
      weightKg: w === '' ? null : toKg(Number(w), unit),
      reps: r === '' ? null : Number(r),
      rir: nextRir,
      isWarmup: warmupValue,
    });
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? 'Revisa los valores.'); return; }
    if (parsed.data.weightKg === lastSaved.current.weightKg && parsed.data.reps === lastSaved.current.reps && parsed.data.rir === lastSaved.current.rir && parsed.data.isWarmup === lastSaved.current.isWarmup) return;
    setError(''); setSaving(true);
    try { await onSave(parsed.data); lastSaved.current = parsed.data; } catch { setError('No se pudo guardar la serie localmente.'); }
    finally { setSaving(false); }
  }

  /** Llena peso y reps (de la vez pasada o de la sugerencia) y guarda. */
  function fill(values: { weightKg: number | null; reps: number | null }) {
    const next = { weight: shown(values.weightKg), reps: values.reps === null ? '' : String(values.reps) };
    setWeight(next.weight); setReps(next.reps); setInputKey((k) => k + 1);
    void persist(rir, warmup, next);
  }
  const hint = suggestion ?? previous;

  /** − / +: parte de lo escrito o, si está vacío, de la sugerencia / la vez pasada. Solo cambia la pantalla; se guarda con "Serie hecha". */
  function step(field: 'weight' | 'reps', delta: number) {
    if (field === 'weight') {
      const base = weight.trim() === '' ? toDisplay(hint?.weightKg ?? null, unit) ?? 0 : Number(weight.replace(',', '.')) || 0;
      const inc = unit === 'kg' ? 2.5 : 5;
      setWeight(String(Math.max(0, Math.round((base + delta * inc) * 10) / 10)));
    } else {
      const base = reps.trim() === '' ? hint?.reps ?? 0 : Number(reps) || 0;
      setReps(String(Math.max(0, base + delta)));
    }
    setInputKey((k) => k + 1);
  }

  /** Un toque: guarda lo que hay en pantalla; si no escribiste nada, lo sugerido (o lo de la vez pasada). */
  async function done() {
    const next = {
      weight: weight.trim() === '' && hint ? shown(hint.weightKg) : weight,
      reps: reps.trim() === '' && hint?.reps != null ? String(hint.reps) : reps,
    };
    if (next.reps.trim() === '') { setError('Escribe cuántas repeticiones hiciste.'); return; }
    setWeight(next.weight); setReps(next.reps); setInputKey((k) => k + 1);
    await persist(rir, warmup, next);
  }

  function selectRir(value: number | null) {
    setRir(value);
    setError('');
    void persist(value);
  }

  return <Card>
    <View style={styles.header}>
      <Text style={styles.setLabel}>SERIE {set.setIndex + 1}{total && set.setIndex < total ? `/${total}` : ''}</Text>
      {onUnitChange ? <View style={styles.units} accessibilityLabel="Unidad del peso">{(['kg', 'lb'] as const).map((u) =>
        <Pressable key={u} accessibilityRole="button" accessibilityLabel={u === 'kg' ? 'Kilos' : 'Libras'} accessibilityState={{ selected: unit === u }} onPress={() => { if (u !== unit) onUnitChange(u); }} style={[styles.unit, unit === u && styles.unitOn]}>
          <Text style={[styles.unitText, unit === u && styles.unitTextOn]}>{u}</Text></Pressable>)}</View> : null}
      <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: warmup }} onPress={() => { const next = !warmup; setWarmup(next); void persist(rir, next); }} style={[styles.warmup, warmup && styles.warmupActive]}><Text style={[styles.warmupText, warmup && styles.warmupTextActive]}>Calentamiento</Text></Pressable>
    </View>
    <View style={styles.fields}>
      <Stepper label={bodyweight ? `Lastre (${unit}, opcional)` : `Peso (${unit})`} short={bodyweight ? 'LASTRE' : unit === 'kg' ? 'KILOS' : 'LIBRAS'} inputKey={`w-${inputKey}`} value={weight} placeholder={hint ? fmt(toDisplay(hint.weightKg, unit)) : bodyweight ? '0' : '—'}
        keyboardType="decimal-pad" onChange={setWeight} onBlur={() => { void persist(); }} onStep={(d) => step('weight', d)} less={`Menos peso`} more={`Más peso`}/>
      <Stepper label="Repeticiones" short="REPS" inputKey={`r-${inputKey}`} value={reps} placeholder={hint ? fmt(hint.reps) : '—'}
        keyboardType="number-pad" onChange={setReps} onBlur={() => { void persist(); }} onStep={(d) => step('reps', d)} less="Menos repeticiones" more="Más repeticiones"/>
    </View>
    {lastSaved.current.reps === null && !warmup ? <Pressable accessibilityRole="button" accessibilityLabel="Serie hecha" disabled={saving} onPress={() => { void done(); }} style={({ pressed }) => [styles.done, pressed && { opacity: 0.85 }]}>
      <Text style={styles.doneText}>Serie hecha</Text>
    </Pressable> : null}
    {(previous || suggestion) && weight === '' && reps === '' ? <View style={styles.quick}>
      {suggestion && !warmup ? <Pressable accessibilityRole="button" accessibilityLabel={`Usar sugerencia: ${suggestion.weightKg === null ? '' : `${toDisplay(suggestion.weightKg, unit)} ${unit === 'kg' ? 'kilos' : 'libras'} por `}${suggestion.reps}`} onPress={() => fill(suggestion)} style={[styles.repeat, styles.suggest]}>
        <Text style={styles.suggestText}>→ Sugerido · {suggestion.weightKg === null ? `${suggestion.reps} reps` : `${toDisplay(suggestion.weightKg, unit)} ${unit} × ${suggestion.reps}`}</Text>
      </Pressable> : null}
      {previous ? <Pressable accessibilityRole="button" accessibilityLabel={`Igual que la vez pasada: ${fmt(toDisplay(previous.weightKg, unit))} ${unit === 'kg' ? 'kilos' : 'libras'} por ${fmt(previous.reps)}`} onPress={() => fill(previous)} style={styles.repeat}>
        <Text style={styles.repeatText}>↻ Igual que la vez pasada · {previous.weightKg === null ? '' : `${fmt(toDisplay(previous.weightKg, unit))} ${unit} × `}{fmt(previous.reps)}{previous.weightKg === null ? ' reps' : ''}</Text>
      </Pressable> : null}
    </View> : null}
    {warmup ? null : <View style={styles.effortSection}>
      <Text style={styles.effortQuestion}>¿Cuántas repeticiones más podrías haber hecho?</Text>
      <View style={styles.choices} accessibilityLabel="Repeticiones adicionales posibles">
        {options.values.map((value) => {
          const selected = rir === value;
          const isTarget = targetRir === value;
          return <Pressable key={value} disabled={saving} accessibilityRole="button" accessibilityLabel={rirLabel(value) + (isTarget ? ' (objetivo)' : '')} accessibilityState={{ selected, disabled: saving }} onPress={() => selectRir(value)} style={[styles.choice, isTarget && styles.choiceTarget, selected && styles.choiceSelected, saving && styles.choiceDisabled]}>
            <Text style={[styles.choiceValue, selected && styles.choiceValueSelected]}>{value}</Text>
          </Pressable>;
        })}
        {options.canExpand ? <Pressable accessibilityRole="button" accessibilityLabel="Mostrar más opciones" onPress={() => setExpanded(true)} style={styles.choice}><Text style={styles.choiceValue}>{options.values.at(-1)! >= 5 ? '+' : '5+'}</Text></Pressable> : null}
      </View>
      <View style={styles.links}>
        <Text style={styles.effortHint}>{targetRir !== null && targetRir !== undefined ? `Objetivo de la rutina: ${targetRir}` : '0 = no podías hacer ninguna más'}</Text>
        <View style={styles.linkRow}>
          {!options.precise ? <Pressable accessibilityRole="button" onPress={() => setPrecise(true)}><Text style={styles.link}>Más precisión</Text></Pressable> : null}
          {rir !== null ? <Pressable accessibilityRole="button" accessibilityLabel="Sin respuesta" disabled={saving} onPress={() => selectRir(null)}><Text style={styles.link}>Quitar respuesta</Text></Pressable> : null}
        </View>
      </View>
      {rirIsOutOfRange ? <Text accessibilityRole="alert" style={styles.warning}>El valor guardado ({set.rir}) está fuera del rango permitido (0–10). Selecciona un valor para corregirlo.</Text> : null}
    </View>}
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    {saving ? <Text style={styles.saving}>Guardando…</Text> : null}
  </Card>;
}

const styles=themed(() => StyleSheet.create({
  quick:{flexDirection:'row',flexWrap:'wrap',gap:7},
  suggest:{borderColor:colors.green,backgroundColor:colors.greenSoft},
  suggestText:{color:colors.green,fontSize:12,fontWeight:'800'},
  repeat:{alignSelf:'flex-start',paddingVertical:6,paddingHorizontal:10,borderRadius:10,borderWidth:1,borderColor:colors.border,backgroundColor:colors.surfaceRaised},
  repeatText:{color:colors.accentText,fontSize:12,fontWeight:'700'},
  header:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:8},
  units:{flexDirection:'row',borderWidth:1,borderColor:colors.border,borderRadius:10,overflow:'hidden',marginLeft:'auto'},
  unit:{paddingHorizontal:10,paddingVertical:7,minWidth:38,alignItems:'center'},
  unitOn:{backgroundColor:colors.accentSoft},
  unitText:{color:colors.secondary,fontSize:11,fontWeight:'800'},
  unitTextOn:{color:colors.accentText},
  setLabel:{color:colors.secondary,fontSize:10,fontWeight:'800',letterSpacing:1},
  warmup:{minHeight:44,justifyContent:'center',borderRadius:12,borderWidth:1,borderColor:colors.border,paddingHorizontal:12,paddingVertical:8},
  warmupActive:{borderColor:colors.blue,backgroundColor:colors.accentSoft},
  warmupText:{fontSize:11,color:colors.secondary,fontWeight:'700'},
  warmupTextActive:{color:colors.accentText},
  fields:{flexDirection:'row',gap:10},
  done:{minHeight:62,borderRadius:16,backgroundColor:colors.blue,alignItems:'center',justifyContent:'center'},
  doneText:{color:'white',fontSize:26,letterSpacing:0.5,...display},
  effortSection:{gap:8},
  effortQuestion:{color:colors.text,fontSize:14,fontWeight:'800',lineHeight:20},
  effortHint:{color:colors.secondary,fontSize:11,lineHeight:16},
  choices:{flexDirection:'row',flexWrap:'wrap',gap:7,paddingVertical:2},
  choice:{width:42,height:44,borderRadius:12,borderWidth:1,borderColor:colors.border,backgroundColor:colors.surfaceRaised,alignItems:'center',justifyContent:'center'},
  choiceSelected:{borderColor:colors.blue,backgroundColor:colors.accentSoft},
  choiceTarget:{borderColor:colors.green},
  links:{gap:6},
  linkRow:{flexDirection:'row',gap:16},
  link:{color:colors.accentText,fontSize:11,fontWeight:'700'},
  choiceDisabled:{opacity:0.55},
  choiceValue:{color:colors.secondary,fontSize:16,fontWeight:'800'},
  choiceValueSelected:{color:colors.accentText},
  warning:{color:colors.amber,fontSize:11,lineHeight:16},
  error:{color:colors.red,fontSize:11},
  saving:{color:colors.muted,fontSize:10},
}));

/** Número grande con − / + (se lee a un metro y se usa con una mano sudada). Sigue siendo un campo: se puede escribir. */
function Stepper({ label, short, value, placeholder, inputKey, keyboardType, onChange, onBlur, onStep, less, more }: {
  label: string; short: string; value: string; placeholder: string; inputKey: string; keyboardType: 'decimal-pad' | 'number-pad';
  onChange: (v: string) => void; onBlur: () => void; onStep: (delta: number) => void; less: string; more: string;
}) {
  return <View style={st.box}>
    <Text style={st.label}>{short}</Text>
    <AppInput key={inputKey} label="" accessibilityLabel={label} defaultValue={value} onChangeText={onChange} onBlur={onBlur} keyboardType={keyboardType}
      placeholder={placeholder} returnKeyType="done" autoCorrect={false} spellCheck={false} style={st.input}/>
    <View style={st.row}>
      <Pressable accessibilityRole="button" accessibilityLabel={less} onPress={() => onStep(-1)} style={({ pressed }) => [st.btn, pressed && st.pressed]}><Text style={st.btnText}>−</Text></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={more} onPress={() => onStep(1)} style={({ pressed }) => [st.btn, pressed && st.pressed]}><Text style={st.btnText}>+</Text></Pressable>
    </View>
  </View>;
}
const st = themed(() => StyleSheet.create({
  box: { flex: 1, backgroundColor: colors.surfaceRaised, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 10, gap: 6, alignItems: 'stretch' },
  label: { color: colors.secondary, fontSize: 12, fontWeight: '700', letterSpacing: 1, textAlign: 'center' },
  input: { minHeight: 64, borderWidth: 0, backgroundColor: 'transparent', textAlign: 'center', fontSize: 52, paddingHorizontal: 0, ...display },
  row: { flexDirection: 'row', gap: 8 },
  btn: { flex: 1, minHeight: 48, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  pressed: { backgroundColor: colors.accentSoft, borderColor: colors.blue },
  btnText: { color: colors.text, fontSize: 26, fontWeight: '700' },
}));
