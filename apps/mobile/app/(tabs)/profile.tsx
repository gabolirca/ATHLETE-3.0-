import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ActionButton } from '@/components/ActionButton';
import { AppInput } from '@/components/AppInput';
import { Card } from '@/components/Card';
import { Eyebrow, Label, Title } from '@/components/Typography';
import { Screen, Row } from '@/components/Screen';
import { AccountCard } from '@/account/AccountCard';
import { useTrainingRepository } from '@/data/MobileTrainingContext';
import type { LocalAthletePreferences } from '@/data/trainingTypes';
import { LocalAthletePreferencesSchema } from '@/data/trainingSchemas';
import { colors } from '@/theme/colors';

const sports = [
  { id: 'strength', title: 'Fuerza' }, { id: 'hybrid', title: 'Híbrido' },
  { id: 'running', title: 'Carrera' }, { id: 'swimming', title: 'Natación' },
] as const;
const officialSports = [
  { id: 'strength', title: 'Fuerza' }, { id: 'running', title: 'Carrera' }, { id: 'swimming', title: 'Natación' },
  { id: 'cycling', title: 'Ciclismo' }, { id: 'rowing', title: 'Remo' },
  { id: 'functional_fitness', title: 'Fitness funcional' }, { id: 'other', title: 'Otra' },
] as const;

export default function ProfileScreen() {
  const repository = useTrainingRepository();
  const [prefs, setPrefs] = useState<LocalAthletePreferences>({ displayName: '', unitSystem: 'metric', preferredSport: 'strength', timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC' });
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const refresh = useCallback(() => { repository?.getPreferences().then((value) => { setPrefs(value); setError(''); }).catch(() => setError('No pudimos leer las preferencias locales.')); }, [repository]);
  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));

  async function save() {
    if (!repository) return;
    const parsed = LocalAthletePreferencesSchema.safeParse(prefs);
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? 'Revisa las preferencias.'); return; }
    setLoading(true); setError(''); setSaved(false);
    try { await repository.savePreferences(parsed.data); setSaved(true); }
    catch { setError('No se pudo guardar el perfil local.'); }
    finally { setLoading(false); }
  }
  function update<K extends keyof LocalAthletePreferences>(key: K, value: LocalAthletePreferences[K]) { setPrefs((current) => ({ ...current, [key]: value })); setSaved(false); }

  return <Screen>
    <View><Eyebrow>DATOS LOCALES</Eyebrow><Title>Perfil</Title></View>
    <Card><Eyebrow>INFORMACIÓN PERSONAL</Eyebrow><AppInput label="Nombre para mostrar (opcional)" value={prefs.displayName} onChangeText={(value) => update('displayName', value)} placeholder="Tu nombre" maxLength={60}/><Text style={s.note}>Se guarda en este dispositivo y se respalda en tu cuenta si inicias sesión.</Text></Card>
    <Card><Eyebrow>PREFERENCIAS DEPORTIVAS</Eyebrow><Label>{prefs.sports ? 'Disciplinas que practicas' : 'Actividad preferida'}</Label><View style={s.options}>{(prefs.sports ? officialSports : sports).map((sport) => {
      const selected = prefs.sports ? prefs.sports.includes(sport.id as typeof officialSports[number]['id']) : prefs.preferredSport === sport.id;
      return <SelectChip key={sport.id} selected={selected} title={sport.title} onPress={() => {
        if (prefs.sports) {
          const current = prefs.sports;
          const next = selected ? current.filter((value) => value !== sport.id) : [...current, sport.id as typeof officialSports[number]['id']];
          update('sports', next);
        } else update('preferredSport', sport.id as typeof prefs.preferredSport);
      }}/>;
    })}</View>{prefs.sports ? <Text style={s.note}>Selecciona todas las disciplinas que practicas. No se infiere una disciplina híbrida.</Text> : null}</Card>
    <Card><Eyebrow>CONFIGURACIÓN</Eyebrow><Label>Sistema de unidades</Label><View style={s.options}><SelectChip title="Métrico" selected={prefs.unitSystem === 'metric'} onPress={() => update('unitSystem', 'metric')}/><SelectChip title="Imperial" selected={prefs.unitSystem === 'imperial'} onPress={() => update('unitSystem', 'imperial')}/></View><View style={s.divider}/><Row><Label>Zona horaria del dispositivo</Label></Row><Text style={s.timezone}>{prefs.timezone}</Text></Card>
    {error ? <Text accessibilityRole="alert" style={s.error}>{error}</Text> : null}
    {saved ? <Text style={s.saved}>Preferencias guardadas localmente.</Text> : null}
    <ActionButton onPress={save} loading={loading}>Guardar preferencias</ActionButton>
    <AccountCard />
  </Screen>;
}

function SelectChip({ title, selected, onPress }: { title: string; selected: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ selected }} onPress={onPress} style={[s.chip, selected && s.chipSelected]}><Text style={[s.chipText, selected && s.chipTextSelected]}>{title}</Text></Pressable>;
}

const s=StyleSheet.create({note:{color:colors.secondary,fontSize:11,lineHeight:17},options:{flexDirection:'row',flexWrap:'wrap',gap:7},chip:{borderWidth:1,borderColor:colors.border,borderRadius:12,paddingHorizontal:12,paddingVertical:9,backgroundColor:colors.surfaceRaised},chipSelected:{borderColor:colors.blue,backgroundColor:'#172849'},chipText:{color:colors.secondary,fontSize:11,fontWeight:'700'},chipTextSelected:{color:'#A9C4FF'},divider:{height:1,backgroundColor:colors.border,marginVertical:4},timezone:{color:colors.text,fontSize:13},error:{color:colors.red,fontSize:12},saved:{color:colors.green,fontSize:12,fontWeight:'700'}});
