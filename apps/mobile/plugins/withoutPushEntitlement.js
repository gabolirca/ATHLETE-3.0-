/**
 * expo-notifications agrega el permiso de notificaciones PUSH (aps-environment). ATHLETE solo usa notificaciones
 * LOCALES (fin de descanso), que no lo necesitan, y el equipo personal de Apple no puede firmar apps con push:
 * el build falla con "Provisioning Profile … does not support the Push Notifications capability".
 * Este plugin lo quita para que sobreviva a `expo prebuild`. Si algún día hay push real, se elimina este plugin.
 */
const { withEntitlementsPlist } = require('expo/config-plugins');

module.exports = function withoutPushEntitlement(config) {
  return withEntitlementsPlist(config, (cfg) => {
    delete cfg.modResults['aps-environment'];
    return cfg;
  });
};
