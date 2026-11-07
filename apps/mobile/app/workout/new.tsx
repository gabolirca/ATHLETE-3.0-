import { useCallback, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { ActionButton } from '@/components/ActionButton';
import { AppInput } from '@/components/AppInput';
import { DateField } from '@/components/DatePicker';
import { atLocalTime, localDateOfDevice } from '@/lib/localDate';
import { Card } from '@/components/Card';
import { EmptyState } from '@/components/EmptyState';
import { Eyebrow, Label, Title } from '@/components/Typography';
import { Screen, Row } from '@/components/Screen';
import { useTrainingRepository } from '@/data/MobileTrainingContext';
import type { Routine } from '@/data/trainingTypes';
import { colors } from '@/theme/colors';

export default function StartWorkoutScreen() {
  const router = useRouter();
  const repository = useTrainingRepository();
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [error, setError] = useState(false);
  const [activeError, setActiveError] = useState(false);
  const [starting, setStarting] = useState(false);
  const today = localDateOfDevice(new Date());
  const [date, setDate] = useState(today);
  const [time, setTime] = useState('');
  const [timeError, setTimeError] = useState('');
  const past = date !== today;
  useFocusEffect(useCallback(() => {
    let active = true;
    repository?.listRoutines().then((value) => { if (active) setRoutines(value); }).catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [repository]));
  /** Día pasado: exige hora de inicio. Hoy: empieza ahora. */
  function pastStart(): string | null | undefined {
    if (!past) return undefined;
    const m = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
    if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) { setTimeError('Indica a qué hora empezaste (HH:MM, por ejemplo 18:30).'); return null; }
    setTimeError('');
    return atLocalTime(date, Number(m[1]), Number(m[2])).toISOString();
  }

  async function start(routineId?: string) {
    if (!repository) return;
    const startedAt = pastStart();
    if (startedAt === null) return;
    setStarting(true); setError(false); setActiveError(false);
    try { const id = await repository.startWorkout(routineId, startedAt ? { startedAt } : {}); router.replace(`/workout/${id}`); }
    catch (cause) { if (cause instanceof Error && cause.message === 'ACTIVE_WORKOUT_EXISTS') setActiveError(true); else setError(true); setStarting(false); }
  }
  return <Screen>
    <View><Eyebrow>REGISTRO LOCAL · SIN CONEXIÓN DISPONIBLE</Eyebrow><Title>{past ? 'Registrar entrenamiento' : 'Iniciar sesión'}</Title></View>
    <Card>
      <Eyebrow>¿CUÁNDO ENTRENASTE?</Eyebrow>
      <DateField value={date} onChange={(d) => { setDate(d); setTimeError(''); }}/>
      {past ? <AppInput label="Hora de inicio (HH:MM)" defaultValue={time} onChangeText={setTime} placeholder="18:30" keyboardType="numbers-and-punctuation" maxLength={5} autoCorrect={false} spellCheck={false} error={timeError}/>
        : <Text style={s.detail}>Hoy: la sesión empieza ahora. Elige otro día para registrar un entrenamiento que ya hiciste.</Text>}
    </Card>
    {activeError ? <Text accessibilityRole="alert" style={s.error}>Tienes un entrenamiento en curso. Finalízalo o descártalo antes de registrar uno de otro día.</Text> : null}
    <Card accent={colors.blue}><Label>Sesión libre</Label><Text style={s.detail}>Elige ejercicios al comenzar y registra tus series, peso, repeticiones y el esfuerzo de cada serie.</Text><ActionButton onPress={() => start()} loading={starting}>{past ? 'Registrar sesión libre' : 'Comenzar sesión libre'}</ActionButton></Card>
    <Eyebrow>O USA UNA RUTINA</Eyebrow>
    {error ? <Text accessibilityRole="alert" style={s.error}>No pudimos crear la sesión. Tus datos locales se mantienen.</Text> : null}
    {routines.length ? routines.map((routine) => <Card key={routine.id}><Row><View><Label>{routine.name}</Label><Text style={s.detail}>{routine.exercises.length} ejercicios</Text></View><Text style={s.count}>{routine.exercises.length}</Text></Row><ActionButton secondary loading={starting} onPress={() => start(routine.id)}>Iniciar esta rutina</ActionButton></Card>) : <EmptyState icon="clipboard-outline" title="Sin rutinas guardadas" detail="Puedes empezar una sesión libre o crear una rutina en Entrenar." />}
  </Screen>;
}
const s=StyleSheet.create({detail:{color:colors.secondary,fontSize:12,lineHeight:18},count:{color:colors.blue,fontWeight:'800',fontSize:20},error:{color:colors.red,fontSize:12}});
