import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { AppInput } from './AppInput';
import { Card } from './Card';
import { LoggedSetSchema, type LoggedSetInput } from '@/data/trainingSchemas';
import type { TrainingSet } from '@/data/trainingTypes';
import { colors } from '@/theme/colors';

const rirValues = Array.from({ length: 21 }, (_, index) => index / 2);

export function SetEditor({ set, onSave }: { set: TrainingSet; onSave: (input: LoggedSetInput) => Promise<void> }) {
  const [weight, setWeight] = useState(set.weightKg === null ? '' : String(set.weightKg));
  const [reps, setReps] = useState(set.reps === null ? '' : String(set.reps));
  const [rir, setRir] = useState<number | null>(set.rir);
  const [warmup, setWarmup] = useState(set.isWarmup);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const lastSaved = useRef<LoggedSetInput>({ weightKg: set.weightKg, reps: set.reps, rir: set.rir, isWarmup: set.isWarmup });
  const rirIsOutOfRange = set.rir !== null && (set.rir < 0 || set.rir > 10 || !Number.isInteger(set.rir * 2));

  useEffect(() => {
    lastSaved.current = { weightKg: set.weightKg, reps: set.reps, rir: set.rir, isWarmup: set.isWarmup };
    setWeight(set.weightKg === null ? '' : String(set.weightKg));
    setReps(set.reps === null ? '' : String(set.reps));
    setRir(set.rir);
    setWarmup(set.isWarmup);
  }, [set.id, set.weightKg, set.reps, set.rir, set.isWarmup]);

  async function persist(nextRir = rir, warmupValue = warmup) {
    if (saving) return;
    const parsed = LoggedSetSchema.safeParse({
      weightKg: weight.trim() === '' ? null : Number(weight),
      reps: reps.trim() === '' ? null : Number(reps),
      rir: nextRir,
      isWarmup: warmupValue,
    });
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? 'Revisa los valores.'); return; }
    if (parsed.data.weightKg === lastSaved.current.weightKg && parsed.data.reps === lastSaved.current.reps && parsed.data.rir === lastSaved.current.rir && parsed.data.isWarmup === lastSaved.current.isWarmup) return;
    setError(''); setSaving(true);
    try { await onSave(parsed.data); lastSaved.current = parsed.data; } catch { setError('No se pudo guardar la serie localmente.'); }
    finally { setSaving(false); }
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
      <AppInput label="Peso (kg)" value={weight} onChangeText={setWeight} onBlur={() => { void persist(); }} keyboardType="decimal-pad" placeholder="—" returnKeyType="done" />
      <AppInput label="Repeticiones" value={reps} onChangeText={setReps} onBlur={() => { void persist(); }} keyboardType="number-pad" placeholder="—" returnKeyType="done" />
    </View>
    <View style={styles.effortSection}>
      <Text style={styles.effortQuestion}>¿Cuántas repeticiones más podrías haber hecho?</Text>
      <Text style={styles.effortHint}>Indica cuántas repeticiones adicionales te quedaban al terminar la serie.</Text>
      <View style={styles.choices} accessibilityLabel="Repeticiones adicionales posibles">
        {rirValues.map((value) => {
          const selected = rir === value;
          const label = value === 0 ? '0 ninguna repetición más' : `${value} ${value === 1 ? 'repetición más' : value === 0.5 ? 'media repetición más' : 'repeticiones más'}`;
          return <Pressable key={value} disabled={saving} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected, disabled: saving }} onPress={() => selectRir(value)} style={[styles.choice, selected && styles.choiceSelected, saving && styles.choiceDisabled]}>
            <Text style={[styles.choiceValue, selected && styles.choiceValueSelected]}>{value}</Text>
          </Pressable>;
        })}
      </View>
      <Pressable disabled={saving} accessibilityRole="button" accessibilityLabel="Sin respuesta" accessibilityState={{ selected: rir === null, disabled: saving }} onPress={() => selectRir(null)} style={[styles.noResponse, rir === null && styles.choiceSelected]}><Text style={[styles.noResponseText, rir === null && styles.choiceValueSelected]}>Sin respuesta</Text></Pressable>
      <Text style={styles.effortHint}>0 = ninguna repetición más · 1 = una repetición más · 2 = dos repeticiones más</Text>
      {rirIsOutOfRange ? <Text accessibilityRole="alert" style={styles.warning}>El valor guardado ({set.rir}) está fuera del rango permitido (0–10). Selecciona un valor para corregirlo.</Text> : null}
    </View>
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    {saving ? <Text style={styles.saving}>Guardando…</Text> : null}
  </Card>;
}

const styles=StyleSheet.create({
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
  choiceDisabled:{opacity:0.55},
  choiceValue:{color:colors.secondary,fontSize:16,fontWeight:'800'},
  choiceValueSelected:{color:'#9DBDFF'},
  noResponse:{minHeight:40,borderRadius:11,borderWidth:1,borderColor:colors.border,backgroundColor:colors.surfaceRaised,alignItems:'center',justifyContent:'center',paddingHorizontal:12},
  noResponseText:{color:colors.secondary,fontSize:12,fontWeight:'700'},
  warning:{color:'#F4C46A',fontSize:11,lineHeight:16},
  error:{color:colors.red,fontSize:11},
  saving:{color:colors.muted,fontSize:10},
});
