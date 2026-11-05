# ATHLETE 3.0 — Cimientos de la aplicación móvil

**Fecha:** 3 de noviembre de 2026  
**Agente:** Codex  
**Rama:** `codex/mobile-foundation`  
**Base:** `22503f3` (`Documentos para los agentes en donde tomarán las especificaciones`)

## Alcance implementado

- Workspace npm inicial y aplicación Expo en `apps/mobile/`.
- React Native, TypeScript, Expo Router y rutas agrupadas en cinco tabs.
- Inicio, Entrenar, Progreso, Nutrición y Perfil con contenido demostrativo.
- Tema oscuro compartido con tokens de color y componentes reutilizables para tarjetas, tipografía, encabezados, filas y contenedor de pantalla.
- Configuración iOS y Android desde Expo, orientación vertical y tema oscuro.
- No se conectaron backend, autenticación ni persistencia. No se editaron `packages/contracts`, `packages/domain`, bases de datos ni otras aplicaciones.

## Archivos añadidos

- `package.json`
- `.gitignore`, `package-lock.json`
- `apps/mobile/package.json`, `app.json`, `tsconfig.json`, `babel.config.js`, `expo-env.d.ts`, `README.md`
- `apps/mobile/app/_layout.tsx`
- `apps/mobile/app/(tabs)/_layout.tsx`, `index.tsx`, `train.tsx`, `progress.tsx`, `nutrition.tsx`, `profile.tsx`
- `apps/mobile/src/components/Screen.tsx`, `Typography.tsx`, `Card.tsx`, `SectionHeading.tsx`
- `apps/mobile/src/theme/colors.ts`
- `docs/reports/codex/2026-11-03-mobile-foundation.md`

## Decisiones

- Se usa Expo SDK 54 con Expo Router 6 y workspaces npm. Las versiones se expresan en `package.json`; el lockfile se generará al instalar dependencias.
- Se conserva la paleta documentada: negro `#090B10`, azul `#1769FF`, rojo `#EF3340` y grafito `#252B36`; se añaden tonos de superficie, texto y estado para jerarquía y contraste.
- El azul indica acción y datos activos; el rojo queda disponible para alertas, sin usarlo como decoración de contenido.
- La navegación de las cinco áreas utiliza tabs persistentes y cada pantalla mantiene sus datos simulados locales.
- El checkout indicado por la solicitud (`~/GYM/ATHLETE`) es de solo lectura en este entorno. La rama solicitada ya estaba activa en `/Users/gabolirca/GYM/ATHLETE-CODEX`, checkout del mismo remoto y commit base; los cambios se hicieron allí, que es el workspace autorizado para escritura.

## Pruebas y verificaciones

- Confirmado remoto `https://github.com/gabolirca/ATHLETE-3.0-.git`, base `22503f3`, rama `codex/mobile-foundation` y estado inicial limpio.
- Leídos especificación, ADR-0001, ADR-0002, modelo de datos, aislamiento y diagnóstico previo.
- `npm install --ignore-scripts --fetch-retries=0 --fetch-timeout=20000` falló dentro del sandbox con `ENOTFOUND registry.npmjs.org`.
- La instalación autorizada con red terminó y generó `package-lock.json` (758 paquetes).
- `npm run typecheck` terminó correctamente (`tsc --noEmit`).
- `EXPO_NO_TELEMETRY=1 npx expo config --type public` terminó correctamente y reportó plataformas iOS, Android y web.
- `EXPO_NO_TELEMETRY=1 npx expo install --check` indicó que las dependencias coinciden con el mapa local de Expo; la herramienta advirtió que la validación puede ser poco fiable sin conexión.
- `git diff --check` terminó sin errores.
- No se abrió la app en simulador; no se hizo verificación visual en dispositivos.

## Problemas encontrados

- La instalación reportó 32 vulnerabilidades en el árbol resuelto (1 low, 26 moderate, 5 high). No se aplicó `npm audit fix` para evitar cambios automáticos no revisados; requiere inspección de dependencias.
- La rama ya existía y estaba ocupada por el checkout autorizado `ATHLETE-CODEX`; `ATHLETE` se mantuvo intacto.

## Siguientes pasos

1. Completar la instalación, generar y versionar `package-lock.json`.
2. Correr typecheck y corregir cualquier error de tipos.
3. Revisar la experiencia en simuladores iOS y Android, incluida navegación, safe areas y tamaños compactos.
4. Validar con producto los datos simulados y los flujos de creación/registro antes de conectar contratos compartidos.
5. Añadir persistencia local según el trabajo de arquitectura; no conectar Supabase en esta fase.
