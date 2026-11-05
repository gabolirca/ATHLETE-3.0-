# Status bar en iOS 27: UIViewControllerBasedStatusBarAppearance

Fecha: 2026-11-04 · Worktree `ATHLETE-CODEX` · rama `codex/mobile-foundation` · sin commit ni push.

## Problema

Metro mostraba: `StatusBar has no effect because UIViewControllerBasedStatusBarAppearance is NO in Info.plist.`

Con la clave en `NO`, `RCTStatusBarManager` (RN 0.88.1) llama a `-[UIApplication setStatusBarStyle:animated:]`. Las apps compiladas con el SDK de iOS 27 ya no pueden usar esa API: UIKit la convierte en no-op. Por eso RN emite la advertencia y `expo-status-bar` deja de tener efecto.

## Cambios

| Archivo | Cambio |
|---|---|
| `apps/mobile/ios/ATHLETE/Info.plist` | `UIViewControllerBasedStatusBarAppearance`: `false` → `true` |
| `apps/mobile/app.json` | `expo.ios.infoPlist.UIViewControllerBasedStatusBarAppearance: true`, para que un `prebuild` futuro no vuelva a poner el `false` de la plantilla de Expo (`@expo/config-plugins`, `withIosBaseMods`) |

No se modificó código JS, ni la navegación, SQLite/SQLCipher, SecureStore o Supabase. No se ejecutó `prebuild`.

## Cómo queda el control del status bar

- `app/_layout.tsx` usa `<StatusBar style="light" />` de `expo-status-bar` en dos sitios: el árbol normal y la pantalla de error de datos locales. No hay otros usos de `StatusBar` de React Native ni llamadas nativas.
- Con la clave en `YES`, `RCTStatusBarManager` solo actualiza `RCTStatusBarAppearance`. `ExpoRootViewController` (expo-modules-core) devuelve ese valor en `preferredStatusBarStyle`, `prefersStatusBarHidden` y `preferredStatusBarUpdateAnimation`. Ya no se usa ninguna API de `UIApplication`.
- `react-native-screens` solo toma el control si una pantalla define `statusBarStyle`. Ninguna lo hace, así que el control queda en `expo-status-bar`.
- Diseño: `UIUserInterfaceStyle = Dark`, `UIStatusBarStyle = UIStatusBarStyleDefault` (contenido claro al arrancar en modo oscuro) y `style="light"` en JS. El aspecto es el mismo que antes: texto claro sobre negro/grafito.

## Validación

- `plutil -lint ios/ATHLETE/Info.plist`: OK. El `Info.plist` del `.app` compilado tiene la clave en `true`.
- `npx expo config --type introspect`: tras aplicar los plugins, la clave resuelve a `true` y `UIStatusBarStyle` sigue en `UIStatusBarStyleDefault`.
- `npx tsc --noEmit`: OK.
- `npx jest --runInBand`: 5 suites, 23 pruebas correctas.
- `xcodebuild` Debug con la firma por defecto del simulador (`ATHLETE SDK58 Validation`, iOS 27.2, Xcode 27.2): `BUILD SUCCEEDED`.
- Runtime: la app se instaló sobre la existente (se conservan los datos) y se arrancó con Metro. El bundle cargó sin ningún `WARN` ni `ERROR`, y la advertencia de StatusBar desapareció. La captura muestra el status bar claro sobre fondo oscuro y los datos locales intactos.

## Advertencias residuales (fuera de alcance)

- Avisos de Swift 6 en pods de terceros (p. ej. `ExpoSQLite`: "must restate inherited '@unchecked Sendable' conformance"). No vienen de código propio ni afectan al funcionamiento.
- Aviso de Expo modules: "The @ExpoModule class 'CoreModule' … is internal". Es de `expo-modules-core`.
- No se validó en un dispositivo físico; hace falta configurar un `DEVELOPMENT_TEAM`.
- `expo-status-bar` en Android no cambia con esta corrección.

## Validar localmente

```sh
cd ~/GYM/ATHLETE-CODEX/apps/mobile
npx tsc --noEmit && npx jest --runInBand
npx expo run:ios --device "ATHLETE SDK58 Validation"   # firma correcta por defecto
# No compilar con CODE_SIGNING_ALLOWED=NO: rompe SecureStore/Keychain en el simulador.
```
