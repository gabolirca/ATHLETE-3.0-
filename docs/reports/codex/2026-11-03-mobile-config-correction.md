# ATHLETE 3.0 — Corrección de configuración móvil

**Fecha:** 3 de noviembre de 2026  
**Agente:** Codex  
**Rama:** `codex/mobile-foundation`

## Cambios

- `package.json`: añadí React y React DOM `19.1.0` como dependencias centrales del workspace y overrides raíz para impedir copias transitivas incompatibles.
- `apps/mobile/package.json`: declaré `babel-preset-expo@~54.0.12`, alineado con Expo SDK 54. React Native continúa en `0.81.5` y Expo en la línea `~54.0.0`.
- `apps/mobile/app.json`: limité `expo.platforms` a `ios` y `android`. No se añadió `react-native-web`.
- `package-lock.json`: regenerado con npm para reflejar las dependencias y resoluciones únicas.
- `babel.config.js` ya apuntaba a `babel-preset-expo`; ahora el preset está instalado y declarado directamente por la app, por lo que la referencia se resuelve desde el workspace.
- No cambié pantallas ni navegación.

La raíz fija React porque npm resolvía peers opcionales desde `ATHLETE-CODEX/node_modules`, y el lock contenía React `19.3.1` además de la copia de la app `19.1.0`. Expo Router también declara el peer opcional de `react-dom`; fijé ese paquete en `19.1.0` para mantener la pareja React/React DOM coherente. No se instaló React Native Web.

## Verificación ejecutada

- `npm run typecheck`: pasó (`tsc --noEmit`).
- `npm ls react react-dom babel-preset-expo --all`: árbol con React `19.1.0` y React DOM `19.1.0` deduplicados; preset `54.0.12` presente.
- `npx --yes expo-doctor`: pasó, **18/18 checks**, sin incidencias.
- `npx expo start --clear`: Metro alcanzó `Waiting on http://localhost:8082` tras usar puerto 8082 porque la primera instancia de comprobación había retenido 8081. Se detuvo la instancia de verificación al confirmar el arranque.
- `npm audit fix` se ejecutó sin `--force`. El audit posterior continúa reportando **32** vulnerabilidades: 1 baja, 26 moderadas y 5 altas; ninguna crítica.

## Auditoría de vulnerabilidades

El reporte de npm agrupa las alertas en estas dependencias transitivas principales:

- **Altas:** `expo-router` → `query-string` → `decode-uri-component`; `postcss`; `image-size`.
- **Moderadas:** cadena de Expo CLI/configuración y de React Native/codegen, en especial `glob`, `minimatch`, `rimraf`, `@react-native/codegen` y `babel-jest`.
- **Baja:** `deepmerge` dentro de la cadena de configuración de Expo.

### Candidatas sin cambio mayor

El campo `fixAvailable: true` del audit identifica candidatos en `@expo/prebuild-config`, `expo-asset`, `expo-linking`, `image-size` y `react-native-reanimated`. Apliqué `npm audit fix` en modo normal para permitir únicamente resoluciones compatibles; el audit final mantuvo las 32 alertas y esos paquetes permanecen en las versiones que el árbol actual admite. Por tanto, quedan identificados como candidatos de parche/actualización compatible, pero no se consideran corregidos ni se aplicaron overrides manuales inseguros.

### Actualizaciones que requieren cambio incompatible

Para la mayoría de la cadena npm solo ofreció remedios que implican actualizar Expo a `51.0.39`, Expo Router a `58.0.30` o React Native a `0.88.1`. Esos saltos no son compatibles con las restricciones de esta tarea y algunos cambiarían Expo a una versión anterior; no los apliqué. Se requiere una revisión de compatibilidad de SDK y una tarea posterior coordinada para actualizar los paquetes afectados.

## Alcance y siguientes pasos

- Se mantuvo la rama `codex/mobile-foundation`; no se hizo merge.
- No se modificaron archivos de Claude, `packages/contracts`, `packages/domain`, backend ni bases de datos.
- Abrir una tarea aparte para seleccionar actualizaciones de seguridad que conserven un conjunto oficial coherente de versiones Expo SDK 54/RN 0.81.5 y volver a ejecutar el audit.
