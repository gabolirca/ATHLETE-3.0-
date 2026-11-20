import { useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ActionButton } from '@/components/ActionButton';
import { AppInput } from '@/components/AppInput';
import { Card } from '@/components/Card';
import { Eyebrow, Title } from '@/components/Typography';
import { Screen } from '@/components/Screen';
import { useAccount } from '@/account/AccountProvider';
import { colors, themed } from '@/theme/colors';

/** Reglas de la contraseña (las mismas que valida Supabase): 8+ caracteres, con letras y números. */
export function passwordChecks(p: string) {
  return { length: p.length >= 8, letters: /[A-Za-z]/.test(p), numbers: /\d/.test(p) };
}

/** Crear (primera vez), recuperar o cambiar la contraseña. Se llega con sesión abierta. */
export default function PasswordScreen() {
  const router = useRouter();
  const account = useAccount();
  const { mode } = useLocalSearchParams<{ mode?: 'create' | 'reset' | 'change' }>();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const checks = passwordChecks(password);
  const valid = checks.length && checks.letters && checks.numbers;
  const title = mode === 'change' ? 'Cambiar contraseña' : mode === 'reset' ? 'Nueva contraseña' : 'Crea tu contraseña';

  async function save() {
    if (busy) return;
    if (password !== confirm) { setError('Las contraseñas no coinciden.'); return; }
    setBusy(true); setError(null);
    const message = await account.setPassword(password);
    setBusy(false);
    if (message) setError(message);
    else setDone(true);
  }

  if (done) return <Screen>
    <View><Eyebrow>TU CUENTA ATHLETE</Eyebrow><Title>¡Listo!</Title></View>
    <Card>
      <Text style={s.text}>Tu contraseña quedó guardada. La próxima vez entras con tu correo y esta contraseña, sin esperar ningún correo.</Text>
      <Text style={s.text}>Para abrir la app más rápido puedes activar el bloqueo con Face ID / huella o un PIN de 6 dígitos en Ajustes.</Text>
      <ActionButton onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}>Continuar</ActionButton>
    </Card>
  </Screen>;

  return <Screen>
    <View><Eyebrow>TU CUENTA ATHLETE</Eyebrow><Title>{title}</Title></View>
    <Card>
      <Text style={s.text}>{mode === 'change' ? 'Escribe tu nueva contraseña.' : 'Con ella entrarás a la app sin esperar un código por correo.'}</Text>
      <AppInput key="pw" label="Contraseña nueva" defaultValue={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" autoCorrect={false} spellCheck={false} autoComplete="new-password" textContentType="newPassword" placeholder="Mínimo 8 caracteres"/>
      <View style={s.checks}>
        <Check ok={checks.length} text="8 caracteres o más"/>
        <Check ok={checks.letters} text="Al menos una letra"/>
        <Check ok={checks.numbers} text="Al menos un número"/>
      </View>
      <AppInput key="pw2" label="Repite la contraseña" defaultValue={confirm} onChangeText={setConfirm} secureTextEntry autoCapitalize="none" autoCorrect={false} spellCheck={false} autoComplete="new-password" textContentType="newPassword" placeholder="Igual que arriba"/>
      {error ? <Text accessibilityRole="alert" style={s.error}>{error}</Text> : null}
      <ActionButton onPress={() => void save()} loading={busy} disabled={!valid || confirm === ''}>Guardar contraseña</ActionButton>
      {mode === 'create' ? <Pressable accessibilityRole="button" onPress={() => router.back()}><Text style={s.link}>Ahora no (la próxima vez entrarás con código)</Text></Pressable> : null}
    </Card>
  </Screen>;
}

function Check({ ok, text }: { ok: boolean; text: string }) {
  return <View style={s.check}><Ionicons name={ok ? 'checkmark-circle' : 'ellipse-outline'} size={16} color={ok ? colors.green : colors.muted}/><Text style={[s.checkText, ok && s.checkOk]}>{text}</Text></View>;
}

const s = themed(() => StyleSheet.create({
  text: { color: colors.secondary, fontSize: 13, lineHeight: 19 },
  checks: { gap: 6 },
  check: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  checkText: { color: colors.muted, fontSize: 12 },
  checkOk: { color: colors.text },
  error: { color: colors.red, fontSize: 12 },
  link: { color: colors.accentText, fontSize: 12, fontWeight: '700', textAlign: 'center', paddingVertical: 8 },
}));
