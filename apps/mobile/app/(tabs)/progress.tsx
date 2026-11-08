import { useCallback, useState } from 'react';
import { RecordCard, RecordsExplainer } from '@/progress/records';
import { useFocusEffect } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ActionButton } from '@/components/ActionButton';
import { AppInput } from '@/components/AppInput';
import { Card } from '@/components/Card';
import { EmptyState } from '@/components/EmptyState';
import { Eyebrow, Label, Title } from '@/components/Typography';
import { Screen, Row } from '@/components/Screen';
import { SectionHeading } from '@/components/SectionHeading';
import { useTrainingRepository } from '@/data/MobileTrainingContext';
import type { BodyMeasurement, ProgressSummary, WeeklyMuscleVolume } from '@/data/trainingTypes';
import { MuscleVolumeRow, VolumeExplainer } from '@/progress/muscleVolume';
import { BodyMeasurementSchema } from '@/data/trainingSchemas';
import { colors } from '@/theme/colors';

const kinds = [
  { id: 'weight_kg', title: 'Peso', unit: 'kg' },
  { id: 'waist_cm', title: 'Cintura', unit: 'cm' },
  { id: 'chest_cm', title: 'Pecho', unit: 'cm' },
  { id: 'hip_cm', title: 'Cadera', unit: 'cm' },
] as const;
type MeasurementKind = typeof kinds[number]['id'];

export default function ProgressScreen() {
  const repository = useTrainingRepository();
  const [summary, setSummary] = useState<ProgressSummary | null>(null);
  const [volume, setVolume] = useState<WeeklyMuscleVolume | null>(null);
  const [loadingError, setLoadingError] = useState(false);
  const [kind, setKind] = useState<MeasurementKind>('weight_kg');
  const [value, setValue] = useState('');
  const [inputKey, setInputKey] = useState(0);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const refresh = useCallback(async () => {
    if (!repository) return;
    try { setSummary(await repository.getProgress()); setLoadingError(false); } catch { setLoadingError(true); }
    repository.getWeeklyMuscleVolume().then(setVolume).catch(() => setVolume(null));
  }, [repository]);
  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));

  async function addMeasurement() {
    if (!repository) return;
    const parsed = BodyMeasurementSchema.safeParse({ type: kind, value: Number(value), measuredAt: new Date().toISOString() });
    if (!parsed.success) { setFormError(parsed.error.issues[0]?.message ?? 'Revisa la medición.'); return; }
    setSaving(true); setFormError('');
    try { await repository.addBodyMeasurement(parsed.data); setValue(''); setInputKey((k) => k + 1); await refresh(); }
    catch { setFormError('No se pudo guardar la medición local.'); }
    finally { setSaving(false); }
  }
  async function removeMeasurement(item: BodyMeasurement) {
    await repository?.tombstoneBodyMeasurement(item.id);
    await refresh();
  }
  const selectedKind = kinds.find((item) => item.id === kind)!;
  const chartMax = Math.max(...(summary?.dailyVolumeKg.map((item) => item.volumeKg) ?? [0]));

  if (loadingError) return <Screen><Title>Progreso</Title><EmptyState icon="alert-circle-outline" title="No pudimos cargar tus datos" detail="Los registros locales siguen en el dispositivo." action="Reintentar" onAction={() => void refresh()}/></Screen>;
  return <Screen>
    <View><Eyebrow>REGISTROS DE ESTE DISPOSITIVO</Eyebrow><Title>Progreso</Title></View>
    <Card><Row><View><Eyebrow>VOLUMEN DE FUERZA · 7 DÍAS</Eyebrow><Text style={s.number}>{Math.round(summary?.weeklyVolumeKg ?? 0).toLocaleString('es-MX')} <Text style={s.unit}>kg·reps</Text></Text></View><View><Eyebrow>SESIONES</Eyebrow><Text style={s.metric}>{summary?.sessionsThisMonth ?? 0}<Text style={s.unit}> este mes</Text></Text></View></Row>
      {chartMax > 0 ? <View style={s.chart}>{summary?.dailyVolumeKg.map((day, index) => <View key={`${day.label}-${index}`} style={s.barColumn}><View style={[s.bar, { height: Math.max(5, Math.round((day.volumeKg / chartMax) * 94)), backgroundColor: day.volumeKg ? colors.blue : colors.graphite }]} /><Text style={s.day}>{day.label}</Text></View>)}</View> : <Text style={s.note}>Registra sesiones con peso y repeticiones para ver tu volumen. Las series de calentamiento no se cuentan.</Text>}
    </Card>
    <SectionHeading title="Volumen por músculo · 7 días"/>
    {volume && volume.totalSets > 0
      ? <Card>{volume.items.map((item) => <MuscleVolumeRow key={item.muscle} item={item} scaleMax={Math.max(22, ...volume.items.map((m) => m.sets))}/>)}<VolumeExplainer/></Card>
      : <EmptyState icon="body-outline" title="Aún no hay series esta semana" detail="Registra series de trabajo y verás cuántas lleva cada músculo frente a una referencia general."/>}
    <SectionHeading title="Récords"/>
    {summary?.records.length ? <><RecordsExplainer/>{summary.records.map((record) => <RecordCard key={record.exerciseId} record={record}/>)}</> : <EmptyState icon="trophy-outline" title="Aún no hay récords" detail="Los récords aparecen cuando guardas una serie con peso. No estimamos valores faltantes."/>}
    <SectionHeading title="Mediciones corporales"/>
    <Card><Eyebrow>GUARDAR MEDICIÓN LOCAL</Eyebrow><View style={s.kinds}>{kinds.map((item) => <Pressable key={item.id} accessibilityRole="button" accessibilityState={{ selected: kind === item.id }} onPress={() => { setKind(item.id); setFormError(''); }} style={[s.kind, kind === item.id && s.kindActive]}><Text style={[s.kindText, kind === item.id && s.kindTextActive]}>{item.title}</Text></Pressable>)}</View>
      <AppInput key={`medida-${inputKey}`} label={`Valor (${selectedKind.unit})`} defaultValue="" onChangeText={setValue} autoCorrect={false} spellCheck={false} keyboardType="decimal-pad" placeholder="Escribe una medición"/>
      {formError ? <Text accessibilityRole="alert" style={s.error}>{formError}</Text> : null}
      <ActionButton onPress={addMeasurement} loading={saving}>Guardar medición</ActionButton>
      <Text style={s.note}>Se guarda en tu teléfono y, si iniciaste sesión, se respalda en tu cuenta.</Text>
    </Card>
    {summary?.measurements.length ? summary.measurements.map((item) => <Card key={item.id}><Row><View><Label>{kinds.find((entry) => entry.id === item.type)?.title ?? 'Medición'}</Label><Text style={s.note}>{new Date(item.measuredAt).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })}</Text></View><Text style={s.record}>{item.value} {item.unit}</Text><Pressable accessibilityRole="button" accessibilityLabel="Eliminar medición" onPress={() => void removeMeasurement(item)}><Text style={s.delete}>×</Text></Pressable></Row></Card>) : <EmptyState icon="body-outline" title="Sin mediciones registradas" detail="Agrega el primer peso o medida para empezar un historial real."/>}
  </Screen>;
}

const s=StyleSheet.create({number:{color:colors.text,fontSize:27,fontWeight:'800',marginTop:5},metric:{color:colors.text,fontSize:20,fontWeight:'800',marginTop:5},unit:{fontSize:11,color:colors.secondary,fontWeight:'500'},chart:{height:130,flexDirection:'row',alignItems:'flex-end',justifyContent:'space-between',gap:7,paddingTop:15},barColumn:{flex:1,alignItems:'center',justifyContent:'flex-end',gap:7,height:120},bar:{width:'75%',borderRadius:5},day:{fontSize:8,color:colors.secondary,fontWeight:'700'},note:{color:colors.secondary,fontSize:10,lineHeight:15},record:{color:colors.text,fontSize:16,fontWeight:'800'},kinds:{flexDirection:'row',gap:5},kind:{flex:1,borderWidth:1,borderColor:colors.border,borderRadius:10,paddingVertical:9,alignItems:'center'},kindActive:{borderColor:colors.blue,backgroundColor:'#172849'},kindText:{fontSize:10,color:colors.secondary,fontWeight:'700'},kindTextActive:{color:'#9DBDFF'},error:{color:colors.red,fontSize:11},delete:{color:colors.red,fontSize:22,paddingHorizontal:5}});
