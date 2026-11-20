/**
 * Expo aplica solo el plugin de expo-apple-authentication en cuanto el paquete está instalado y agrega la capacidad
 * "Sign in with Apple". El equipo personal (gratis) de Apple no puede firmarla: el build falla con
 * "Provisioning Profile … does not support the Sign In with Apple capability".
 * Mientras EXPO_PUBLIC_APPLE_SIGNIN no sea 1, este plugin la quita (mismo patrón que withoutPushEntitlement).
 */
const { withEntitlementsPlist } = require('expo/config-plugins');

module.exports = function withoutAppleSignIn(config) {
  return withEntitlementsPlist(config, (cfg) => {
    delete cfg.modResults['com.apple.developer.applesignin'];
    return cfg;
  });
};
