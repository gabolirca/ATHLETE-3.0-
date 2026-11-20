import { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ActionButton } from '@/components/ActionButton';
import { AppInput } from '@/components/AppInput';
import { Card } from '@/components/Card';
import { Eyebrow, Title } from '@/components/Typography';
import { Screen } from '@/components/Screen';
import { useAccount } from '@/account/AccountProvider';
import { appleEnabled, googleEnabled } from '@/account/socialSignIn';
import { colors, themeMode, themed } from '@/theme/colors';

type Step = 'password' | 'email' | 'code';

/**
 * Entrar: correo + contraseña. La primera vez (o si olvidó la contraseña) entra con un código al correo y, al
 * verificarlo, crea su contraseña. Apple / Google arriba cuando la compilación los tiene configurados.
 *
 * Los campos de texto son NO controlados (defaultValue + onChangeText): en iOS 27, devolver `value` al campo nativo
 * en cada tecla hacía que el teclado recalculara su estado (se perdía lo escrito o se quedaban activas las mayúsculas).
 */
export default function LoginScreen() {
  const router = useRouter();
  const account = useAccount();
  const [step, setStep] = useState<Step>('password');
  const [forgot, setForgot] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [social, setSocial] = useState<'apple' | 'google' | null>(null);
  const [apple, setApple] = useState(false);
  const google = googleEnabled();

  useEffect(() => {
    let alive = true;
    void appleEnabled().then((on) => { if (alive) setApple(on); });
    return () => { alive = false; };
  }, []);

  function go(next: Step, isForgot = forgot) { setStep(next); setForgot(isForgot); setError(null); setCode(''); }

  async function withProvider(provider: 'apple' | 'google') {
    if (busy || social) return;
    setSocial(provider); setError(null);
    const r = await account.signInWithProvider(provider);
    setSocial(null);
    if (r.ok) router.back();
    else if (r.message) setError(r.message);
  }

  async function signIn() {
    if (busy) return;
    setBusy(true); setError(null);
    const message = await account.signInWithPassword(email, password);
    setBusy(false);
    if (message) setError(message);
    else router.back();
  }

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
    const r = await account.verifyCode(email, code);
    setBusy(false);
    if (!r.ok) { setError(r.message); return; }
    if (r.needsPassword || forgot) router.replace({ pathname: '/account/password', params: { mode: forgot ? 'reset' : 'create' } } as never);
    else router.back();
  }

  const showSocial = step === 'password' && (apple || google);

  return <Screen>
    <View><Eyebrow>TU CUENTA ATHLETE</Eyebrow><Title>{step === 'password' ? 'Iniciar sesión' : forgot ? 'Recuperar acceso' : 'Primera vez'}</Title></View>

    {showSocial ? <View style={s.social}>
      {apple ? <AppleButton disabled={social !== null} onPress={() => void withProvider('apple')}/> : null}
      {google ? <Pressable accessibilityRole="button" accessibilityLabel="Continuar con Google" disabled={social !== null} onPress={() => void withProvider('google')} style={({ pressed }) => [s.google, pressed && s.pressed]}>
        {social === 'google' ? <ActivityIndicator color="#1F1F1F"/> : <><Ionicons name="logo-google" size={20} color="#1F1F1F"/><Text style={s.googleText}>Continuar con Google</Text></>}
      </Pressable> : null}
      <View style={s.orRow}><View style={s.orLine}/><Text style={s.orText}>o con tu correo</Text><View style={s.orLine}/></View>
    </View> : null}

    {step === 'password' ? <Card>
      <AppInput key="email" label="Correo electrónico" defaultValue={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} spellCheck={false} autoComplete="email" placeholder="tu@correo.com"/>
      <AppInput key="password" label="Contraseña" defaultValue={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" autoCorrect={false} spellCheck={false} autoComplete="current-password" textContentType="password" placeholder="Tu contraseña" onSubmitEditing={() => void signIn()}/>
      {error ? <Text accessibilityRole="alert" style={s.error}>{error}</Text> : null}
      <ActionButton onPress={() => void signIn()} loading={busy} disabled={email.trim() === '' || password === ''}>Entrar</ActionButton>
      <Pressable accessibilityRole="button" onPress={() => go('email', true)}><Text style={s.link}>Olvidé mi contraseña</Text></Pressable>
    </Card> : null}

    {step === 'password' ? <Pressable accessibilityRole="button" onPress={() => go('email', false)} style={s.first}>
      <Ionicons name="mail-outline" size={20} color={colors.accentText}/>
      <View style={s.flex}><Text style={s.firstTitle}>¿Primera vez o aún no tienes contraseña?</Text><Text style={s.text}>Entra con un código a tu correo y ahí mismo creas tu contraseña.</Text></View>
      <Ionicons name="chevron-forward" size={18} color={colors.secondary}/>
    </Pressable> : null}

    {step === 'email' ? <Card>
      <Text style={s.text}>{forgot ? 'Te enviaremos un código para que entres y pongas una contraseña nueva.' : 'Te enviaremos un código de un solo uso. Si aún no tienes cuenta, se crea al verificarlo. Después creas tu contraseña.'}</Text>
      <AppInput key="email-code" label="Correo electrónico" defaultValue={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} spellCheck={false} autoComplete="email" placeholder="tu@correo.com"/>
      {error ? <Text accessibilityRole="alert" style={s.error}>{error}</Text> : null}
      <ActionButton onPress={() => void sendCode()} loading={busy} disabled={email.trim() === ''}>Enviarme un código</ActionButton>
      <Pressable accessibilityRole="button" onPress={() => go('password', false)}><Text style={s.link}>Ya tengo contraseña</Text></Pressable>
    </Card> : null}

    {step === 'code' ? <Card>
      <Text style={s.text}>Escribe el código que enviamos a <Text style={s.strong}>{email.trim().toLowerCase()}</Text>. Revisa también la carpeta de spam.</Text>
      <AppInput key="code" label="Código" defaultValue={code} onChangeText={setCode} keyboardType="number-pad" autoCorrect={false} spellCheck={false} autoComplete="one-time-code" textContentType="oneTimeCode" maxLength={10} placeholder="123456"/>
      {error ? <Text accessibilityRole="alert" style={s.error}>{error}</Text> : null}
      <ActionButton onPress={() => void verify()} loading={busy} disabled={code.trim().length < 6}>Verificar e iniciar sesión</ActionButton>
      <Pressable accessibilityRole="button" onPress={() => go('email')}><Text style={s.link}>Cambiar correo o pedir otro código</Text></Pressable>
    </Card> : null}

    <Text style={s.note}>Tus entrenamientos se guardan primero en este teléfono. Al iniciar sesión se respaldan en tu cuenta y se sincronizan cuando hay conexión.</Text>
  </Screen>;
}

/** Botón oficial de Apple (lo exigen sus guías); se carga solo en iOS con Sign in with Apple activo. */
function AppleButton({ onPress, disabled }: { onPress: () => void; disabled: boolean }) {
  if (Platform.OS !== 'ios') return null;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Apple = require('expo-apple-authentication') as typeof import('expo-apple-authentication');
  return <View pointerEvents={disabled ? 'none' : 'auto'} style={disabled ? s.pressed : undefined}>
    <Apple.AppleAuthenticationButton
      buttonType={Apple.AppleAuthenticationButtonType.CONTINUE}
      buttonStyle={themeMode === 'light' ? Apple.AppleAuthenticationButtonStyle.BLACK : Apple.AppleAuthenticationButtonStyle.WHITE}
      cornerRadius={14}
      style={s.apple}
      onPress={onPress}
    />
  </View>;
}

const s = themed(() => StyleSheet.create({
  social: { gap: 12 },
  apple: { width: '100%', height: 52 },
  google: { height: 52, borderRadius: 14, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#DADCE0', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  googleText: { color: '#1F1F1F', fontSize: 17, fontWeight: '600' },
  pressed: { opacity: 0.6 },
  orRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 },
  orLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  orText: { color: colors.muted, fontSize: 12 },
  first: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderRadius: 18, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  firstTitle: { color: colors.text, fontSize: 14, fontWeight: '700' },
  flex: { flex: 1, gap: 2 },
  text: { color: colors.secondary, fontSize: 13, lineHeight: 19 },
  strong: { color: colors.text, fontWeight: '700' },
  error: { color: colors.red, fontSize: 12 },
  link: { color: colors.accentText, fontSize: 13, fontWeight: '700', textAlign: 'center', paddingVertical: 8 },
  note: { color: colors.muted, fontSize: 11, lineHeight: 16 },
}));
