/**
 * Xcode 27 activa ENABLE_USER_SCRIPT_SANDBOXING con sus "ajustes recomendados" y el script
 * "Bundle React Native code and images" (node) no puede leer el proyecto ni escribir main.jsbundle.
 * Es una protección del proceso de COMPILACIÓN, no de la app instalada.
 * Se fija en NO para que sobreviva a `expo prebuild --clean` (ios/ se genera, no se edita a mano).
 */
const { withXcodeProject } = require('expo/config-plugins');

module.exports = function withScriptSandboxingDisabled(config) {
  return withXcodeProject(config, (cfg) => {
    const configurations = cfg.modResults.pbxXCBuildConfigurationSection();
    for (const entry of Object.values(configurations)) {
      if (entry && typeof entry === 'object' && entry.buildSettings) {
        entry.buildSettings.ENABLE_USER_SCRIPT_SANDBOXING = 'NO';
      }
    }
    return cfg;
  });
};