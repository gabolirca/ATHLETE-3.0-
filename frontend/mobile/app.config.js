/**
 * Extiende app.json con lo que depende del `.env` (Expo lo carga antes de leer este archivo):
 * - Sign in with Apple: solo si EXPO_PUBLIC_APPLE_SIGNIN=1. Necesita la cuenta de pago de Apple Developer
 *   (el equipo personal gratis no puede firmar esa capacidad y el build de iOS fallaría).
 * - Google: el esquema de URL de iOS sale del cliente iOS de Google (al revés: com.googleusercontent.apps.XXXX).
 * Sin esas variables la app compila igual y los botones no aparecen.
 */
module.exports = ({ config }) => {
  const plugins = [...(config.plugins ?? [])];
  const appleOn = process.env.EXPO_PUBLIC_APPLE_SIGNIN === '1';
  plugins.push(appleOn ? 'expo-apple-authentication' : './plugins/withoutAppleSignIn');

  const iosClient = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ?? '';
  if (iosClient.endsWith('.apps.googleusercontent.com')) {
    const prefix = iosClient.replace('.apps.googleusercontent.com', '');
    plugins.push(['@react-native-google-signin/google-signin', { iosUrlScheme: `com.googleusercontent.apps.${prefix}` }]);
  }

  return {
    ...config,
    ios: { ...config.ios, usesAppleSignIn: appleOn },
    plugins,
  };
};
