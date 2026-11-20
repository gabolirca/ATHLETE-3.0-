/**
 * Xcode 27 compila los módulos de Swift en modo "explícito" (SWIFT_ENABLE_EXPLICIT_MODULES). Con el Pod de
 * expo-sqlite (que trae su propio sqlite3.h de SQLCipher) falla al precompilar el módulo:
 *   "module '_Builtin_stdarg' is needed but has not been provided, and implicit use of module files is disabled"
 * Se apaga ese modo en los Pods (y en la app) para volver a los módulos implícitos de siempre.
 * Es un ajuste de compilación: no cambia el comportamiento ni la seguridad de la app.
 * Va en un plugin para que sobreviva a `expo prebuild --clean` (ios/ se genera, no se edita a mano).
 */
const { withPodfile, withXcodeProject } = require('expo/config-plugins');

const MARK = '# athlete3: sin explicit modules (Xcode 27 + expo-sqlite)';

function patchPodfile(contents) {
  if (contents.includes(MARK)) return contents;
  const hook = /post_install do \|installer\|\n/;
  if (!hook.test(contents)) throw new Error('withPodsExplicitModulesDisabled: el Podfile no tiene post_install');
  return contents.replace(hook, (m) => `${m}    ${MARK}
    installer.pods_project.targets.each do |target|
      target.build_configurations.each do |build_config|
        build_config.build_settings['SWIFT_ENABLE_EXPLICIT_MODULES'] = 'NO'
      end
    end
`);
}

module.exports = function withPodsExplicitModulesDisabled(config) {
  config = withPodfile(config, (cfg) => {
    cfg.modResults.contents = patchPodfile(cfg.modResults.contents);
    return cfg;
  });
  return withXcodeProject(config, (cfg) => {
    for (const entry of Object.values(cfg.modResults.pbxXCBuildConfigurationSection())) {
      if (entry && typeof entry === 'object' && entry.buildSettings) entry.buildSettings.SWIFT_ENABLE_EXPLICIT_MODULES = 'NO';
    }
    return cfg;
  });
};

module.exports.patchPodfile = patchPodfile;
