import { useState } from 'react';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ActionButton } from '@/components/ActionButton';
import { AppInput } from '@/components/AppInput';
import { Card } from '@/components/Card';
import { Eyebrow, Title } from '@/components/Typography';
import { Screen } from '@/components/Screen';
import { useAccount } from '@/account/AccountProvider';
import { colors } from '@/theme/colors';

/**
 * Los campos de texto son NO controlados (defaultValue + onChangeText): en iOS 27, devolver `value` al campo nativo
 * en cada tecla hacía que el teclado recalculara su estado (se perdía lo escrito o se quedaban activas las mayúsculas).
 * El estado de React solo lee lo que escribe el usuario.
 */
export default function LoginScreen() {
  const router = useRouter();
  const account = useAccount();
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function sendCode() {
    if (busy) return;
    setBusy(true); setError(null);
    const message = await account.requestCode(email);
    setBusy(false);
    if (message) setError(message);
    else setStep('code');
  }

  async function verify() {
    if (busy) return;
    setBusy(true); setError(null);
    const message = await account.verifyCode(email, code);
    setBusy(false);
    if (message) setError(message);
    else router.back();
  }

  return <Screen>
    <View><Eyebrow>RESPALDO EN LA NUBE</Eyebrow><Title>Iniciar sesión</Title></View>
    {step === 'email' ? <Card>
      <Text style={s.text}>Te enviaremos un código de un solo uso. Si aún no tienes cuenta, se crea al verificarlo. No necesitas contraseña.</Text>
      <AppInput key="email" label="Correo electrónico" defaultValue={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} spellCheck={false} autoComplete="email" placeholder="tu@correo.com"/>
      {error ? <Text accessibilityRole="alert" style={s.error}>{error}</Text> : null}
      <ActionButton onPress={() => void sendCode()} loading={busy} disabled={email.trim() === ''}>Enviarme un código</ActionButton>
    </Card> : <Card>
      <Text style={s.text}>Escribe el código que enviamos a <Text style={s.strong}>{email.trim().toLowerCase()}</Text>. Revisa también la carpeta de spam.</Text>
      <AppInput key="code" label="Código" defaultValue={code} onChangeText={setCode} keyboardType="number-pad" autoCorrect={false} spellCheck={false} autoComplete="one-time-code" textContentType="oneTimeCode" maxLength={10} placeholder="123456"/>
      {error ? <Text accessibilityRole="alert" style={s.error}>{error}</Text> : null}
      <ActionButton onPress={() => void verify()} loading={busy} disabled={code.trim().length < 6}>Verificar e iniciar sesión</ActionButton>
      <Pressable accessibilityRole="button" onPress={() => { setStep('email'); setCode(''); setError(null); }}><Text style={s.link}>Cambiar correo o pedir otro código</Text></Pressable>
    </Card>}
    <Text style={s.note}>Tus entrenamientos se guardan primero en este teléfono. Al iniciar sesión se respaldan en tu cuenta y se sincronizan cuando hay conexión. Apple y Google estarán disponibles próximamente.</Text>
  </Screen>;
}

const s = StyleSheet.create({
  text: { color: colors.secondary, fontSize: 13, lineHeight: 19 },
  strong: { color: colors.text, fontWeight: '700' },
  error: { color: colors.red, fontSize: 12 },
  link: { color: '#9DBDFF', fontSize: 12, fontWeight: '700', textAlign: 'center', paddingVertical: 8 },
  note: { color: colors.muted, fontSize: 11, lineHeight: 16 },
});
