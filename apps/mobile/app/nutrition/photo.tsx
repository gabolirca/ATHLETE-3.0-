import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SMAE_GROUPS, SMAE_GROUP_IDS, describeEquivalents, macrosFromEquivalents, type SmaeGroup } from '@athlete/domain';
import type { MealType } from '@athlete/contracts';
import { ActionButton } from '@/components/ActionButton';
import { Card } from '@/components/Card';
import { Chip } from '@/components/Chip';
import { Screen } from '@/components/Screen';
import { Eyebrow, Title } from '@/components/Typography';
import { localDateOfDevice } from '@/lib/localDate';
import { MEAL_TYPES, formatAmount, suggestMealType } from '@/nutrition/mealForm';
import { useNutrition } from '@/nutrition/mobileNutrition';
import { PhotoAnalysisError, acceptPhotoConsent, analyzeFoodPhoto, dishesFrom, hasPhotoConsent, totals, wasEdited, type Dish, type FoodPhotoResult } from '@/nutrition/photoAnalysis';
import { pickFoodPhoto } from '@/nutrition/pickPhoto';
import { colors } from '@/theme/colors';

type Step = 'consent' | 'choose' | 'analyzing' | 'review';

/**
 * Nutrición Pro: foto → la IA reconoce platillos y porción en equivalentes SMAE → tú ajustas → se guarda.
 * Las kcal y macros salen de la tabla SMAE, no del modelo. La foto no se guarda en ningún lado.
 */
export default function FoodPhotoScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ date?: string }>();
  const nutrition = useNutrition();
  const today = localDateOfDevice(new Date());
  const date = params.date ?? today;
  const [step, setStep] = useState<Step | null>(null);
  const [error, setError] = useState('');
  const [result, setResult] = useState<FoodPhotoResult | null>(null);
  const [dishes, setDishes] = useState<Dish[]>([]);
  const [adding, setAdding] = useState<number | null>(null);
  const [mealType, setMealType] = useState<MealType>(suggestMealType(new Date()));
  const [saving, setSaving] = useState(false);

  useEffect(() => { void hasPhotoConsent().then((ok) => setStep(ok ? 'choose' : 'consent')); }, []);

  async function take(source: 'camera' | 'library') {
    setError('');
    try {
      const photo = await pickFoodPhoto(source);
      if (!photo) return;
      if ('denied' in photo) { setError(source === 'camera' ? 'Sin permiso de cámara. Actívalo en Ajustes del iPhone.' : 'Sin permiso de fotos. Actívalo en Ajustes del iPhone.'); return; }
      setStep('analyzing');
      const r = await analyzeFoodPhoto(photo.base64);
      if (!r.es_comida || r.platillos.length === 0) { setStep('choose'); setError('No reconocimos comida en la foto. Intenta con otra más cerca del plato.'); return; }
      setResult(r); setDishes(dishesFrom(r)); setStep('review');
    } catch (e) {
      setStep('choose');
      setError(e instanceof PhotoAnalysisError ? e.message : 'No se pudo analizar la foto. Intenta de nuevo.');
    }
  }

  function change(i: number, g: SmaeGroup, delta: number) {
    setDishes((cur) => cur.map((d, j) => {
      if (j !== i) return d;
      const next = Math.max(0, Math.min(20, (d.equivalents[g] ?? 0) + delta));
      const eq = { ...d.equivalents };
      if (next === 0) delete eq[g]; else eq[g] = next;
      return { ...d, equivalents: eq };
    }));
  }

  async function save() {
    if (!nutrition || !result) return;
    const kept = dishes.filter((d) => Object.keys(d.equivalents).length > 0);
    if (!kept.length) { setError('Deja al menos un platillo con porción.'); return; }
    setSaving(true); setError('');
    const t = totals(kept);
    const now = new Date();
    const consumedAt = date === today ? now : new Date(`${date}T14:00:00`);
    try {
      await nutrition.logMeal({
        consumedAt: consumedAt.toISOString(), timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC', mealType,
        description: kept.map((d) => d.portion ? `${d.name} (${d.portion})` : d.name).join(', ').slice(0, 500),
        energyKcal: t.kcal, proteinG: t.proteinG, carbsG: t.carbsG, fatG: t.fatG, source: 'ai_generated',
        notes: `Estimado por foto con equivalentes SMAE: ${kept.map((d) => describeEquivalents(d.equivalents)).join(' | ')}`.slice(0, 2000),
        aiEstimate: { ...result, editado: wasEdited(result, kept) },
      });
      router.back();
    } catch { setError('No se pudo guardar la comida. Intenta de nuevo.'); }
    finally { setSaving(false); }
  }

  if (step === null) return <Screen><ActivityIndicator color={colors.blue}/></Screen>;
  const t = totals(dishes);
  return <Screen>
    <View><Eyebrow>NUTRICIÓN PRO</Eyebrow><Title>Comida por foto</Title></View>

    {step === 'consent' ? <Card>
      <Text style={s.body}>Toma una foto de tu plato y la IA reconoce qué hay y cuánto, en equivalentes del SMAE. Las calorías y macros los calculamos con la tabla SMAE.</Text>
      <Text style={s.body}>• La foto se manda a un servicio de IA solo para reconocerla y <Text style={s.bold}>no se guarda</Text> en ningún lado.</Text>
      <Text style={s.body}>• Es una estimación: revisa y ajusta las porciones antes de guardar.</Text>
      <Text style={s.body}>• Necesita internet y tu cuenta iniciada.</Text>
      <ActionButton onPress={async () => { await acceptPhotoConsent(); setStep('choose'); }}>Entendido, continuar</ActionButton>
    </Card> : null}

    {step === 'choose' ? <Card>
      <ActionButton onPress={() => void take('camera')}>📷 Tomar foto</ActionButton>
      <ActionButton secondary onPress={() => void take('library')}>Elegir de la galería</ActionButton>
      <Text style={s.hint}>Tip: foto desde arriba, con todo el plato y algo de referencia (cubiertos, vaso).</Text>
    </Card> : null}

    {step === 'analyzing' ? <Card><ActivityIndicator color={colors.blue}/><Text style={s.center}>Reconociendo tu platillo…</Text></Card> : null}

    {step === 'review' && result ? <>
      <Card accent={result.confianza === 'alta' ? colors.green : result.confianza === 'baja' ? colors.red : colors.blue}>
        <Text style={s.conf}>Confianza {result.confianza}</Text>
        {result.nota ? <Text style={s.hint}>{result.nota}</Text> : null}
      </Card>
      {dishes.map((d, i) => <Card key={`${d.name}-${i}`}>
        <View style={s.row}><View style={s.flex}><Text style={s.dish}>{d.name}</Text>{d.portion ? <Text style={s.hint}>{d.portion}</Text> : null}</View>
          <Text style={s.kcal}>{macrosFromEquivalents(d.equivalents).kcal} kcal</Text></View>
        {SMAE_GROUP_IDS.filter((g) => d.equivalents[g]).map((g) => <View key={g} style={s.eqRow}>
          <Text style={s.eqLabel}>{SMAE_GROUPS[g].label}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel={`Menos ${SMAE_GROUPS[g].label} en ${d.name}`} onPress={() => change(i, g, -0.5)} style={s.step}><Text style={s.stepText}>−</Text></Pressable>
          <Text style={s.eqNum}>{d.equivalents[g]}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel={`Más ${SMAE_GROUPS[g].label} en ${d.name}`} onPress={() => change(i, g, 0.5)} style={s.step}><Text style={s.stepText}>+</Text></Pressable>
        </View>)}
        {adding === i ? <View style={s.chips}>{SMAE_GROUP_IDS.filter((g) => !d.equivalents[g] && g !== 'libres').map((g) =>
          <Chip key={g} label={SMAE_GROUPS[g].label} selected={false} onPress={() => { change(i, g, 1); setAdding(null); }}/>)}</View> : null}
        <View style={s.links}>
          <Pressable accessibilityRole="button" onPress={() => setAdding(adding === i ? null : i)}><Text style={s.link}>{adding === i ? 'Cerrar' : '＋ Agregar grupo'}</Text></Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={`Quitar ${d.name}`} onPress={() => setDishes((cur) => cur.filter((_, j) => j !== i))}><Text style={s.remove}>Quitar platillo</Text></Pressable>
        </View>
      </Card>)}
      <Card accent={colors.green}>
        <Eyebrow>TOTAL (TABLA SMAE)</Eyebrow>
        <Text style={s.total}>{t.kcal} kcal</Text>
        <Text style={s.hint}>Proteína {formatAmount(t.proteinG)} g · Carbohidratos {formatAmount(t.carbsG)} g · Grasa {formatAmount(t.fatG)} g</Text>
      </Card>
      <View style={s.chips}>{MEAL_TYPES.map((m) => <Chip key={m.key} label={m.label} icon={m.icon} selected={mealType === m.key} onPress={() => setMealType(m.key)}/>)}</View>
      <ActionButton onPress={() => void save()} loading={saving}>Guardar comida</ActionButton>
      <ActionButton secondary onPress={() => { setResult(null); setDishes([]); setStep('choose'); }}>Otra foto</ActionButton>
    </> : null}

    {error ? <Text accessibilityRole="alert" style={s.error}>{error}</Text> : null}
  </Screen>;
}

const s = StyleSheet.create({
  body: { color: colors.text, fontSize: 14, lineHeight: 20 }, bold: { fontWeight: '800' },
  hint: { color: colors.secondary, fontSize: 12, lineHeight: 17 }, center: { color: colors.secondary, textAlign: 'center', marginTop: 8 },
  conf: { color: colors.text, fontSize: 15, fontWeight: '800', textTransform: 'capitalize' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 }, flex: { flex: 1 },
  dish: { color: colors.text, fontSize: 17, fontWeight: '800' }, kcal: { color: colors.text, fontSize: 15, fontWeight: '800' },
  eqRow: { flexDirection: 'row', alignItems: 'center', gap: 8 }, eqLabel: { flex: 1, color: colors.secondary, fontSize: 13 },
  eqNum: { color: colors.text, fontSize: 15, fontWeight: '800', minWidth: 28, textAlign: 'center' },
  step: { width: 36, height: 36, borderRadius: 10, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceRaised },
  stepText: { color: colors.text, fontSize: 18, fontWeight: '800' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  links: { flexDirection: 'row', justifyContent: 'space-between' }, link: { color: '#9DBDFF', fontSize: 12, fontWeight: '800' }, remove: { color: colors.red, fontSize: 12, fontWeight: '700' },
  total: { color: colors.text, fontSize: 28, fontWeight: '800' },
  error: { color: colors.red, fontSize: 12, lineHeight: 18 },
});
