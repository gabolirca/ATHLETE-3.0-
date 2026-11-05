# Integridad del camino de escritura oficial (móvil) — Claude, 2026-11-05

Rama de trabajo: `codex/mobile-foundation` (worktree `ATHLETE-CODEX`). **Sin commit.** No se tocó backend, contratos, git, bases reales ni Supabase.

## 1. Decisión y justificación
`newInstallations: 'official'` envía toda instalación nueva al almacén oficial a través de `OfficialTrainingRepository`.
Se priorizó cerrar los defectos de integridad de ese camino antes que cualquier funcionalidad nueva.

## 2. Problemas resueltos
| # | Problema | Evidencia | Arreglo |
|---|---|---|---|
| 1 | Series con `position` duplicada | Con `@athlete/data` real + SQLite: borrador automático de `getWorkout` + `addSet` → posiciones `[0,0]` | `saveSet` ya no envía `position`; el backend asigna `nextPosition` (`LogSetInput.position` es opcional, contracts `sets.ts:58`). Resultado: `[0,1]` |
| 2 | Android respaldaba la base cifrada sin su clave | `app.json` sin `allowBackup` (contrato §3.7) | `"allowBackup": false` + prueba de configuración |
| 3 | `startNewStore` sin manejo de error | Un `ActiveStoreError` dejaba una promesa rechazada sin manejar y la UI no mostraba nada | El provider nunca rechaza; expone `actionError`, que la pantalla de recuperación muestra; se limpia con `retry` |
| 4 | `startNewStore` sin protección contra doble ejecución | Doble toque → dos llamadas al paquete | Ejecución única (`useRef` de la promesa en curso) |
| 5 | `newId` cambiaba de identidad con cada cambio de contexto | `OfficialTrainingProvider` depende de `newId` → recreaba el repositorio y perdía los borradores de series | `newId` estable a nivel de módulo |

## 3. Archivos modificados (`apps/mobile/`)
- `src/data/OfficialTrainingRepository.ts`: arreglo 1.
- `src/data/AthleteDataProvider.tsx`: arreglos 3, 4 y 5 (sobre el trabajo sin commit de Codex).
- `app/_layout.tsx`: muestra `actionError` en `StorageRecoveryView` (sobre el trabajo sin commit de Codex).
- `app.json`: arreglo 2.
- `src/data/AthleteDataProvider.test.tsx`: pruebas 10–12 (sobre el trabajo sin commit de Codex).
- Nuevos:
  - `src/data/OfficialTrainingRepository.integration.test.ts`: adaptador + `@athlete/data` real sobre `node:sqlite`.
  - `src/appConfig.test.ts`.

**Respaldo** del trabajo sin commit de Codex antes de estos cambios, verificado byte a byte:
`~/GYM/_revision-claude/wip-codex-original-2026-11-05/`.

## 4. Cambios arquitectónicos
- **Nuevo:** `AthleteDataState.actionError`.
- **Cambia la semántica:** `startNewStore()` ya no rechaza.
- **Primera prueba móvil con la capa de datos real** (no mocks): exige Node ≥ 22.13 por `node:sqlite`.

## 5. Pruebas ejecutadas (clon desechable: Linux, Node 22.23, npm 11)
- **Typecheck:** 5/5 workspaces.
- **Suites:**

  | Suite | Pruebas |
  |---|---|
  | contracts | 19 |
  | domain | 46 |
  | data | 123 |
  | mobile | 64 (antes 57) |
  | Supabase local, Postgres 17 | 72 |
  | integración | 10 |

  Las suites de Supabase e integración son de la misma sesión, sin cambios de backend.
- **Prueba de regresión.** Con el código original fallan:
  - integración "dos borradores" (`[0,0]`);
  - provider 10, 11 y 12 (12: 4 identidades de `newId` frente a 1).

  La prueba "serie tras borrar otra" pasa también con el código viejo: es un invariante, no una regresión.

## 6. Pruebas pendientes (no validado)
- **Nada se validó en simulador ni en dispositivo.** Las pruebas usan Jest, mocks de Expo y `node:sqlite`.
- Manifiesto final de Android con `allowBackup="false"` (requiere `expo prebuild` en un entorno desechable).
- SQLCipher real, SecureStore y `expoDatabaseFiles` (rutas `file://`, copia de `-wal`/`-shm`) en iOS y Android.

## 7. Riesgos detectados no resueltos
- **Migración legacy sin conectar:** `migrateLegacyStore` no se llama en ningún lugar (contrato §3.4).
- **Fallo legacy sin salida:** cuando la capa legacy no se puede abrir, no se ofrece `startNewStore({ legacyFailureCode })` (contrato §3.6).
- **Dependencia no declarada:** `expo-file-system` se importa sin estar en `apps/mobile/package.json` (llega como dependencia transitiva de `expo`).
- **`createRoutine` no es atómica:** usa compensación con `deletePlan`. Una interrupción a la mitad deja mutaciones en la outbox.
- **`syncStatus` engañoso:** se deriva de `revision`, así que muestra "synced" aunque haya ediciones locales pendientes después del primer sync.
- **N+1 de lectura:** `findPlannedExercise` lee todos los planes por cada ejercicio.
- **Duplicación:** `docs/reference/backend/*` son copias idénticas del backend. No deben versionarse.
- **Integración:** `integration/mobile-backend` no existe; el móvil compila contra `ATHLETE-CLAUDE` mediante symlinks.
- **Identificador:** `bundleIdentifier`/`package` siguen siendo `com.athlete.mobile`.

## 8. Siguiente paso recomendado
1. Consolidar en un solo worktree y rama de integración (requiere autorización).
2. Validación nativa en un simulador desechable de lo listado en §6.
