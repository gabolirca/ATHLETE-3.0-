# Migración Expo SDK 54 → 58

Fecha: 2026-11-04  
Worktree: `ATHLETE-CODEX`  
Estrategia: migración incremental en el proyecto existente, conservando `apps/mobile/ios`; no se ejecutó `expo prebuild`.

## Estado y alcance

Migración aplicada hasta Expo SDK 58.0.23, React Native 0.88.1 y React 19.3.0. Se alinearon dependencias y peers desde `apps/mobile` con `npx expo install --fix`; se actualizó `package-lock.json`. El root conserva solo los overrides de React/renderer para evitar dos árboles de React en el workspace.

Se mantuvieron Expo Router, `expo-sqlite` con SQLCipher y `expo-secure-store`. La clave de cifrado continúa guardándose en SecureStore y la app aplica `PRAGMA key` al abrir SQLite. No se cambió el esquema ni se ejecutó una migración de datos de usuario.

La carpeta iOS existente se adaptó manualmente: AppDelegate usa `ExpoReactNativeFactoryProvider`; se agregó `SceneDelegate` y `UIApplicationSceneManifest`; se actualizó el deployment target a iOS 16.4 en app, Xcode y CocoaPods. CocoaPods se reinstaló y `Podfile.lock` ahora apunta a Expo 58 y RN 0.88.1. La preferencia `ios.buildReactNativeFromSource` quedó activada en `Podfile.properties.json`, y el Podfile pasa explícitamente `RCT_USE_RN_DEP=0` y `RCT_USE_PREBUILT_RNCORE=0` para evitar el fallo de headers del XCFramework detectado al compilar con Xcode 27.2.

## Validaciones

- `npm run typecheck`: correcto.
- `npm test -- --runInBand`: 4 suites, 11 pruebas correctas.
- `npx expo-doctor`: 20/20.
- `plutil -lint ios/ATHLETE/Info.plist`: correcto.
- `npx pod-install`: correcto; ExpoSQLite 58.0.15, ExpoSecureStore 58.0.2, React 0.88.1.
- `xcodebuild` Debug para el simulador iPhone 18 Pro / iOS 27.2 (Xcode 27.2): correcto (`XCODEBUILD_STATUS=0`).
- Instalación y arranque en el simulador limpio `ATHLETE SDK58 Validation`: correctos; `simctl launch` inició `com.athlete.mobile` (PID 34910).
- El build inicial con core precompilado falló por falta del modulemap/headers React que exige RN 0.88; al compilar RN desde fuentes, el build terminó bien. SQLCipher se confirmó en flags del compilador (`SQLITE_HAS_CODEC=1`, `sqlcipher_extra_init`).

## Regresión necesaria antes de distribuir

1. En un dispositivo o simulador actualizado desde la versión instalada: iniciar sesión, abrir rutina, registrar/editar series, cerrar y reabrir; confirmar que entrenamientos existentes sobreviven.
2. Confirmar lectura/escritura de la base SQLCipher con la clave existente en SecureStore, y comportamiento ante SecureStore bloqueado o dato ausente (no borrar/recrear en silencio una base no descifrable).
3. Probar deep links de Expo Router en primer plano y con la app cerrada; la entrega de URLs ahora la gestiona el lifecycle de escenas de Expo.
4. Probar permisos, navegación tabs/stack, teclado/forms, splash, estado de red y sesión Supabase en entorno de desarrollo; esta migración no modifica Supabase.
5. Hacer una prueba de regresión en una copia de base de datos real antes de publicar. No desinstalar la app de producción como método de prueba, ya que borraría contenedor/llavero local.

## Rollback

Revertir solo los archivos de migración en este worktree mediante revisión de `git diff`/`git status`, restaurando `package.json`, `package-lock.json`, config Expo, fuentes nativas y `ios/Podfile.lock` desde el punto previo. Después reinstalar dependencias con el lock previo y ejecutar `pod install` con el Podfile anterior. No restaurar `node_modules` de forma parcial entre SDKs. Hay copias locales previas en `/private/tmp/athlete-package-lock-sdk56-backup-20261104`, `/private/tmp/athlete-mobile-node-modules-sdk56-backup-20261104`, `/private/tmp/athlete-node-modules-sdk58-preclean-20261104`, `/private/tmp/athlete-mobile-node-modules-sdk58-preclean-20261104` y `/private/tmp/athlete-package-lock-sdk58-preclean-20261104`.

No se hizo commit ni push. No se modificaron Supabase ni el worktree Claude. Los archivos e informes preexistentes se conservaron.

## Referencias oficiales

- [Expo: actualizar un SDK](https://docs.expo.dev/workflow/upgrading-expo-sdk-walkthrough/)
- [Expo SDK 58](https://expo.dev/changelog/sdk-58)
- [Compatibilidad de versiones Expo](https://docs.expo.dev/versions/latest/)
- [Expo Router: migración SDK 57 → 58](https://docs.expo.dev/router/migrate/sdk-57-to-58/)
- [Expo: ciclo de vida de escenas iOS](https://github.com/expo/fyi/blob/main/ios-scene-lifecycle.md)
- [Expo SQLite](https://docs.expo.dev/versions/latest/sdk/sqlite/)
- [Expo SecureStore](https://docs.expo.dev/versions/latest/sdk/securestore/)
- [Expo: pruebas unitarias](https://docs.expo.dev/develop/unit-testing/)
