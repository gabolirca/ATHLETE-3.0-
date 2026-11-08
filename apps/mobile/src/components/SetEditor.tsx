import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { AppInput } from './AppInput';
import { Card } from './Card';
import { LoggedSetSchema, type LoggedSetInput } from '@/data/trainingSchemas';
import type { TrainingSet } from '@/data/trainingTypes';
import { colors } from '@/theme/colors';
import { rirLabel, rirOptions } from './rirOptions';

/** Lo que hiciste en esta misma serie la vez pasada (guía, no se guarda solo). */
export type PreviousSet = { weightKg: number | null; reps: number | null };

const fmt = (n: number | null) => (n === null ? '—' : String(n));

export function SetEditor({ set, onSave, targetRir = null, previous = null }: { set: TrainingSet; onSave: (input: LoggedSetInput) => Promise<void>; targetRir?: number | null; previous?: PreviousSet | null }) {
  const [weight, setWeight] = useState(set.weightKg === null ? '' : String(set.weightKg));
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
    setWeight(set.weightKg === null ? '' : String(set.weightKg));
    setReps(set.reps === null ? '' : String(set.reps));
    setRir(set.rir);
    setWarmup(set.isWarmup);
    setInputKey((k) => k + 1);
  }, [set.id, set.weightKg, set.reps, set.rir, set.isWarmup]);

  async function persist(nextRir = rir, warmupValue = warmup, values: { weight: string; reps: string } = { weight, reps }) {
    if (saving) return;
    const w = values.weight.trim().replace(',', '.');
    const r = values.reps.trim();
    const parsed = LoggedSetSchema.safeParse({
      weightKg: w === '' ? null : Number(w),
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

  /** "Igual que la vez pasada": copia peso y reps de la misma serie anterior y guarda. */
  function repeatPrevious() {
    if (!previous) return;
    const next = { weight: previous.weightKg === null ? '' : String(previous.weightKg), reps: previous.reps === null ? '' : String(previous.reps) };
    setWeight(next.weight); setReps(next.reps); setInputKey((k) => k + 1);
    void persist(rir, warmup, next);
  }

  function selectRir(value: number | null) {
    setRir(value);
    setError('');
    void persist(value);
  }

  return <Card>
    <View style={styles.header}>
      <Text style={styles.setLabel}>SERIE {set.setIndex + 1}</Text>
      <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: warmup }} onPress={() => { const next = !warmup; setWarmup(next); void persist(rir, next); }} style={[styles.warmup, warmup && styles.warmupActive]}><Text style={[styles.warmupText, warmup && styles.warmupTextActive]}>Calentamiento</Text></Pressable>
    </View>
    <View style={styles.fields}>
      <AppInput key={`w-${inputKey}`} label="Peso (kg)" defaultValue={weight} onChangeText={setWeight} onBlur={() => { void persist(); }} keyboardType="decimal-pad" placeholder={previous ? fmt(previous.weightKg) : '—'} returnKeyType="done" autoCorrect={false} spellCheck={false} />
      <AppInput key={`r-${inputKey}`} label="Repeticiones" defaultValue={reps} onChangeText={setReps} onBlur={() => { void persist(); }} keyboardType="number-pad" placeholder={previous ? fmt(previous.reps) : '—'} returnKeyType="done" autoCorrect={false} spellCheck={false} />
    </View>
    {previous && weight === '' && reps === '' ? <Pressable accessibilityRole="button" accessibilityLabel={`Igual que la vez pasada: ${fmt(previous.weightKg)} kilos por ${fmt(previous.reps)}`} onPress={repeatPrevious} style={styles.repeat}>
      <Text style={styles.repeatText}>↻ Igual que la vez pasada · {fmt(previous.weightKg)} kg × {fmt(previous.reps)}</Text>
    </Pressable> : null}
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

const styles=StyleSheet.create({
  repeat:{alignSelf:'flex-start',paddingVertical:6,paddingHorizontal:10,borderRadius:10,borderWidth:1,borderColor:colors.border,backgroundColor:colors.surfaceRaised},
  repeatText:{color:'#9DBDFF',fontSize:12,fontWeight:'700'},
  header:{flexDirection:'row',alignItems:'center',justifyContent:'space-between'},
  setLabel:{color:colors.secondary,fontSize:10,fontWeight:'800',letterSpacing:1},
  warmup:{minHeight:44,justifyContent:'center',borderRadius:12,borderWidth:1,borderColor:colors.border,paddingHorizontal:12,paddingVertical:8},
  warmupActive:{borderColor:colors.blue,backgroundColor:'#172849'},
  warmupText:{fontSize:11,color:colors.secondary,fontWeight:'700'},
  warmupTextActive:{color:'#9DBDFF'},
  fields:{flexDirection:'row',gap:8},
  effortSection:{gap:8},
  effortQuestion:{color:colors.text,fontSize:14,fontWeight:'800',lineHeight:20},
  effortHint:{color:colors.secondary,fontSize:11,lineHeight:16},
  choices:{flexDirection:'row',flexWrap:'wrap',gap:7,paddingVertical:2},
  choice:{width:42,height:44,borderRadius:12,borderWidth:1,borderColor:colors.border,backgroundColor:colors.surfaceRaised,alignItems:'center',justifyContent:'center'},
  choiceSelected:{borderColor:colors.blue,backgroundColor:'#172849'},
  choiceTarget:{borderColor:colors.green},
  links:{gap:6},
  linkRow:{flexDirection:'row',gap:16},
  link:{color:'#9DBDFF',fontSize:11,fontWeight:'700'},
  choiceDisabled:{opacity:0.55},
  choiceValue:{color:colors.secondary,fontSize:16,fontWeight:'800'},
  choiceValueSelected:{color:'#9DBDFF'},
  warning:{color:'#F4C46A',fontSize:11,lineHeight:16},
  error:{color:colors.red,fontSize:11},
  saving:{color:colors.muted,fontSize:10},
});
