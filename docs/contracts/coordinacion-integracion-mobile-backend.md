# Coordinación Claude ↔ Codex: rama `integration/mobile-backend`

Autor: Claude · 5-nov-2026 · Estado: **propuesta**. La rama no se ha creado: crearla y combinar ramas requiere la
autorización del propietario.
Fuentes:
- Codex: `docs/reports/codex/2026-11-05-integracion-mobile-claude-data.md` (leído en el worktree de Codex, sin modificarlo);
- Claude: `docs/reports/claude/2026-11-05-cierre-preintegracion-claude.md`.

## 1. Estado de partida (verificado el 5-nov-2026)

| | `claude/backend-foundation` | `codex/mobile-foundation` |
|---|---|---|
| Base | `22503f3` (= `main` = `origin/main`) | `22503f3` |
| Trabajo | Commits locales preparados en esta fase (sin push) | Sin commits: todo en el árbol de trabajo |
| Raíz | `package.json` (workspaces `packages/*`, `supabase/tests`), `package-lock.json`, `.gitignore`, `tsconfig.base.json` | `package.json` (workspaces `apps/mobile`, `packages/*`), `package-lock.json`, `.gitignore` |
| TypeScript | `~6.0.3` (raíz; los paquetes no lo declaran) | Raíz `~5.9.0`; `apps/mobile` `~6.0.3` |

## 2. Orden propuesto

1. Cada agente confirma su trabajo en su rama (Claude: hecho; Codex: pendiente).
2. El propietario crea `integration/mobile-backend` desde `main` (`22503f3`).
3. Se combina primero `claude/backend-foundation`, que trae `packages/`, `supabase/` y los archivos raíz, y después
   `codex/mobile-foundation`.
4. Se resuelven los conflictos de §3 y se regenera el lockfile (§3.3), **en la rama de integración**.
5. Validación conjunta (§5). Solo después se decide el merge a `main`.

## 3. Conflictos esperados y resolución acordada

### 3.1 `package.json` raíz (ambas ramas lo crean)

```json
{
  "name": "athlete-3",
  "private": true,
  "version": "0.0.0",
  "workspaces": ["apps/mobile", "packages/*", "supabase/tests"],
  "engines": { "node": ">=22" },
  "scripts": {
    "mobile": "npm --workspace @athlete/mobile start",
    "ios": "npm --workspace @athlete/mobile run ios",
    "android": "npm --workspace @athlete/mobile run android",
    "typecheck": "npm run typecheck --workspaces --if-present",
    "test": "npm run test -w @athlete/contracts -w @athlete/domain -w @athlete/data -w @athlete/mobile",
    "test:db": "npm run db:reset -w @athlete/supabase-tests && npm run test -w @athlete/supabase-tests && npm run test:integration -w @athlete/data",
    "test:all": "npm test && npm run test:db"
  },
  "devDependencies": { "typescript": "~6.0.3", "vitest": "^4.0.0", "@types/node": "^22.0.0" },
  "overrides": { "react": "19.3.0", "react-dom": "19.3.0", "test-renderer": "1.3.0" }
}
```

- `typecheck` cubre todos los workspaces (`apps/mobile` incluido, con su `tsc --noEmit`).
- `test` ejecuta Jest en la app y Vitest en los paquetes: cada workspace conserva su ejecutor.

### 3.2 `.gitignore` (ambas ramas lo crean): unión de las dos

Se conservan las reglas de secretos de Claude (`.env`, `.env.*`, `!.env.example`, `.pgdata/`) y las de Expo de
Codex (`.expo/`, `web-build/`, `*.log`, `/ios/`, `/android/` en la raíz).

**Atención (decisión de Codex y del propietario):** la versión de Codex ignora `apps/mobile/ios/`. El proyecto iOS
**no** se regenera con `prebuild`: se editó a mano (escenas, `Info.plist`, `UIViewControllerBasedStatusBarAppearance`,
entitlements, `Podfile`). Si se ignora, esos cambios nunca se confirmarán. Propuesta:
- versionar `apps/mobile/ios/`, excepto `Pods/`, `build/` y `.xcode.env.local`;
- o, si se prefiere *Continuous Native Generation*, llevar todos esos cambios a `app.json` y a config plugins antes
  de ignorarlo.

### 3.3 `package-lock.json`

No se intenta fusionar a mano: se regenera con `npm install` en la rama de integración, una vez resuelto
`package.json`. Los symlinks locales de Codex hacia el worktree de Claude dejan de ser necesarios (los paquetes
estarán en el mismo checkout).

### 3.4 `@athlete/mobile` y `@athlete/*`

Codex ya declaró las dependencias de los tres paquetes (`*` de workspace). Metro necesita resolver código TS de
`packages/*`: Expo SDK 58 lo soporta en monorepos. Hay que verificarlo en el simulador.

## 4. Respuesta a los bloqueos de Codex (informe del 5-nov)

| # | Bloqueo de Codex | Respuesta / propuesta | Responsable |
|---|---|---|---|
| 1 | Handoff estable para elegir el almacén activo, copiar la base anterior (con WAL/SHM), abrir solo la copia e importar | **Aceptado como siguiente trabajo de Claude** (no incluido en esta fase). API propuesta en `@athlete/data`: `resolveActiveStore(fs, secureStore)` → `'legacy' \| 'migrated' \| 'fresh'`, persistido en `athlete3.active-store.v1`; `backupLegacyDatabase(fs, { from, to })` con un puerto de archivos (copia de `.db`/`-wal`/`-shm` + manifiesto SHA-256; nunca abre el original); `migrateLegacyIfNeeded(...)`, que orquesta copia → `openLegacyDatabaseCopy` → `importLegacyStore` → marca `migrated`. Se probará con un sistema de archivos en memoria y en Node; la implementación del puerto con `expo-file-system` es de Codex | Claude (API), Codex (puerto Expo) |
| 2 | Perfil tras importar; conservar identidad y clave sin duplicados | Ya cubierto: `openAthleteData` reutiliza `device:<uuid>` y no toca `athlete3.sqlite.sqlcipher-key.v1`; el importador crea el perfil desde las preferencias solo si no existe; `profile.initialize` es idempotente (si existe, no escribe ni encola). **Orden obligatorio:** importar **antes** de `profile.initialize`; si no, las preferencias heredadas quedan en cuarentena (`profile_already_exists`) en lugar de aplicarse | Codex (orden de arranque) |
| 3 | Paquetes y lockfile reales; sin symlinks externos | §3.3 | Rama de integración |
| 4 | Crear rutina de forma atómica | Propuesta: `plans.createRoutine({ plan, day, exercises[] })` atómico en `@athlete/data`, y en el contrato 0.4.0 si Codex lo acepta. Mientras tanto, la composición `createPlan` → `addDay` → `addDayExercise` deja un plan incompleto si la app se cierra a mitad; se puede completar o borrar con `deletePlan`, sin pérdida de datos | Claude, si Codex lo confirma |
| 5 | Batería de integración en Postgres local; ciclo en simulador desechable | Postgres: `supabase/tests/harness/local-postgres.sh start` y `npm run test:db` (§2 de `docs/architecture/testing.md`). El `ECONNREFUSED` del informe de Codex era la ausencia de servidor en 54329. Simulador: §5 | Ambos |

Ya resuelto en esta fase y señalado por Codex: `CONTRACTS_VERSION` ahora es `'0.3.0'`, y una prueba falla si se
desalinea de `package.json`.

## 5. Validación conjunta (criterios del propietario)

En un **simulador desechable** (nunca el `ATHLETE SDK58 Validation` actual ni su base):
1. Instalación limpia → `openAthleteData` sin cuenta → catálogo visible sin red.
2. Crear, modificar y consultar una rutina; sesión desde la rutina; registrar series con RIR 0 y 0.5; finalizar;
   historial.
3. Cerrar y reabrir la app: datos intactos; cola única (`data.sync.status().pendingCount`).
4. Comprobar el archivo `athlete3-<localUserId>.db`: cabecera distinta de `SQLite format 3` (cifrado real).
5. Importación: base de la capa anterior **generada por la versión actual de la app en ese simulador desechable**
   → copia → import → informe → original intacto (SHA-256).
6. `npm run typecheck`, `npm test`, `npm run test:db` y la comprobación de la guía
   (`npx tsc -p docs/contracts/verificacion/tsconfig.guia.json`) en la rama de integración.
