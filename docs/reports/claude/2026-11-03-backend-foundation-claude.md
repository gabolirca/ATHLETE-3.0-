# Informe — Fundación de backend: `packages/contracts` y `packages/domain`

**Agente:** Claude
**Fecha:** 3 de noviembre de 2026
**Rama:** `claude/backend-foundation` (worktree `~/GYM/ATHLETE-CLAUDE`)
**Commit base:** `22503f3` — "Documentos para los agentes en donde tomarán las especificaciones"

## 1. Verificaciones previas (confirmadas)

- Remoto `origin` = `https://github.com/gabolirca/ATHLETE-3.0-.git`.
- Rama `claude/backend-foundation`, árbol limpio al empezar, mismo commit que `main`.
- El repositorio tiene tres worktrees: `~/GYM/ATHLETE` (`main`), `~/GYM/ATHLETE-CLAUDE` (esta rama)
  y `~/GYM/ATHLETE-CODEX` (`codex/mobile-foundation`, sin cambios a la fecha). Se trabajó solo en el de Claude.
- Leídos: especificación, ADR-0001, ADR-0002, `data-model.md`, `schema-isolation.md`, `docs/contracts/README.md`
  y el diagnóstico de Codex.
- **Hallazgo:** `docs/reports/claude/2026-11-03-diagnostico-backend-claude.md` está **vacío** (0 bytes).
  No se sobrescribió (regla de la carpeta); conviene que el propietario confirme si falta subir su contenido.

## 2. Plan de implementación

| Paso | Contenido | Estado |
|---|---|---|
| 1 | Raíz mínima del monorepo: `package.json` (npm workspaces), `tsconfig.base.json`, `.gitignore` | Hecho |
| 2 | `packages/contracts` 0.1.0: esquemas Zod y tipos por dominio, errores, sync, puertos de repositorio | Hecho (borrador) |
| 3 | `packages/domain`: lógica pura con pruebas | Hecho |
| 4 | ADR-0003 (propuesta): IDs, versionado, SQLite ↔ Supabase, push/pull, conflictos, tombstones | Hecho (propuesta) |
| 5 | Revisión cruzada de contratos con Codex | Pendiente |
| 6 | `packages/data`: SQLite (expo-sqlite) + outbox + motor de sync con transporte simulado | Siguiente, tras 5 |
| 7 | `supabase/` local: migraciones `athlete3` + pruebas RLS con dos usuarios, solo en entorno local | Bloqueado: requiere aprobación |
| 8 | Conexión a proyecto remoto | Bloqueado: identidad del proyecto y reconciliación de historial |

Los pasos 7 y 8 no se tocaron: no hay migraciones, no se consultó ni modificó ningún proyecto Supabase,
no se tocó `apps/mobile/`, EasyTeacher ni datos de Diario Gym v2.

## 3. Archivos creados

```
package.json                      npm workspaces (packages/*), scripts typecheck/test
package-lock.json                 generado por npm install
tsconfig.base.json                TS estricto (noUncheckedIndexedAccess, verbatimModuleSyntax)
.gitignore                        node_modules, dist, .env*, supabase/.temp
docs/decisions/0003-persistencia-y-sincronizacion.md
docs/reports/claude/2026-11-03-backend-foundation-claude.md   (este informe)
packages/contracts/{package.json,tsconfig.json,README.md,CHANGELOG.md}
packages/contracts/src/{index,common,errors,profile,exercises,programs,sessions,sets,cardio,body,nutrition,sync,repositories}.ts
packages/contracts/test/contracts.test.ts
packages/domain/{package.json,tsconfig.json,README.md}
packages/domain/src/{index,units,time,strength,records,cardio,session,sync,analytics}.ts
packages/domain/test/{fixtures,units,time,strength,records,cardio,session,sync,analytics}.test.ts
```

Ningún archivo existente fue modificado.

## 4. Decisiones técnicas

Detalle y alternativas en ADR-0003. Resumen:

1. **Monorepo npm workspaces** (sin pnpm instalado; npm es el gestor con menos fricción para Expo).
   Los paquetes exportan el código TypeScript fuente (`main: src/index.ts`): Metro y Vitest lo consumen
   sin paso de build. Solo se incluyó `packages/*`; Codex añadirá `apps/*` al crear la app.
2. **TypeScript 5.9** (no 7.x) por compatibilidad con el ecosistema Expo actual. **Zod 4**, **Vitest 4**.
3. **Contratos en `camelCase`**, independientes de tablas. El mapeo a `snake_case` irá en `packages/data`.
4. **Entidad vs entrada:** lecturas (`WorkoutSession`) separadas de entradas (`StartSessionInput`…).
   En actualizaciones, campo ausente = no cambiar; `null` = borrar el valor.
5. **Propiedad:** `userId` nunca forma parte de una entrada; lo asigna el adaptador desde la sesión.
6. **Procedencia** (`DataSource`: manual, imported, estimated, ai_generated, device) en sesiones,
   cardio, mediciones corporales y comidas (especificación §10).
7. **Sesión de fuerza incremental** (iniciar → añadir ejercicio → registrar serie → completar/descartar),
   no una sola llamada con todo anidado, para soportar autoguardado y recuperación.
   Estados `in_progress → completed | discarded`; las completadas siguen siendo editables.
   Una sola sesión en curso por usuario.
8. **Serie efectiva** = `working` + `completedAt` no nulo + no eliminada + reps > 0. El calentamiento
   nunca cuenta. `completedAt = null` modela series preparadas (p. ej. precargadas del plan) aún no hechas:
   **la UI debe enviar `completedAt` al marcar una serie como hecha.**
9. **No se almacenan derivados** (ritmo, velocidad, volumen, e1RM, récords): se calculan en `domain`.
10. **e1RM:** Epley por defecto, Brzycki opcional, null por encima de 12 repeticiones (configurable).
    Es una estimación, nunca una medición.
11. **Fechas:** se guarda instante + zona horaria + `localDate` calculada con `Intl` en la zona del atleta.
12. **Unidades canónicas** kg/m/s/cm; peso y medidas corporales guardan además `inputUnit`.
    La preferencia de carga (`loadUnit`) es independiente de `unitSystem`.
13. **Errores:** códigos estables, mensaje seguro, `retryable` por defecto según código, `details`
    estructurado sin SQL ni stack. Los repositorios devuelven `Result<T>` en lugar de lanzar.
14. **Sync:** mutaciones con `mutationId` (idempotencia), `baseRevision` (conflictos), `op: delete`
    como tombstone, pull por cursor que nunca pisa cambios locales pendientes, resolución explícita
    `keep_local` / `keep_remote`.
15. **Sin `packages/validation`:** ADR-0002 §6 ya sitúa los esquemas Zod en `contracts`; un paquete
    aparte duplicaría. Se propone formalmente en ADR-0003 §3.

## 5. Pruebas realizadas

```
npm run typecheck   → contracts y domain sin errores (tsc --noEmit, modo estricto)
npm test            → contracts: 1 archivo, 14 pruebas OK
                      domain:    8 archivos, 46 pruebas OK
```

Cobertura funcional destacada:
- Fecha local: 22:30 en Ciudad de México ≠ día UTC; zonas por delante de UTC; cambios de horario; bisiestos.
- Volumen sin calentamientos ni series sin datos; volumen null si no hay carga; ejercicios eliminados excluidos.
- e1RM por fórmula y límites; récords con empate (gana el primero) y récords nuevos por sesión.
- Transiciones de sesión, horas con distinto desplazamiento, sesión activa única, reordenamiento.
- Sync: `defer_pending` protege cambios locales, ecos/stale ignorados, tombstones, `duplicate` como éxito,
  detección de conflictos, backoff, resoluciones.
- Contratos: instantes sin zona rechazados, zonas IANA, RIR/RPE en pasos de 0.5, reglas de natación y FC,
  fechas de plan, regla payload/delete, tamaño de lote, `parseInput` → `VALIDATION_FAILED`.

No hay pruebas de base de datos, RLS, SQLite ni integración: no existe todavía esa capa (pasos 6–7).

## 6. Problemas encontrados

1. **Informe de diagnóstico de Claude vacío** (§1).
2. **npm 10.9.9:** el primer `npm install` sin lockfile falló con `Cannot read properties of null (reading 'edgesOut')`
   al resolver las dependencias opcionales de Vitest 4. Se generó el lockfile con `npm install --legacy-peer-deps`;
   a partir de ahí `npm install` normal funciona. No se añadió `.npmrc` para no afectar la instalación de Expo.
3. **Contradicciones a resolver (no se eligió en silencio, ADR-0001):**
   - Ubicación de los tipos generados de Supabase (`contracts` según `docs/contracts/README.md §4` y Codex;
     `packages/data` según esta propuesta). ADR-0003 §5.1.
   - Forma del contrato de sesión: anidada (borrador de Codex) vs incremental (esta propuesta). ADR-0003 §5.2.
   - Nombres de tablas: el diagnóstico de Codex usa `training_sessions`/`session_sets`; se siguió
     `data-model.md` (`workout_sessions`, `session_exercises`, `sets`).
4. **Requisitos no definidos en la especificación**, resueltos de forma provisional y marcados en el código:
   catálogo de objetivos (texto libre), configuración de privacidad/consentimientos (entidad aparte, pendiente),
   calendario y bloques de entrenamiento (pendientes), inicio de semana (lunes, parametrizable),
   rangos de RIR (0–10) y RPE (1–10), fotografías corporales (fuera del borrador), `daily_checkins`,
   `recommendations` y `model_versions` (no incluidos: fuera del MVP o sin alcance aprobado).
5. **Riesgo técnico del cursor de pull** con secuencias y transacciones concurrentes (ADR-0003 §2.6).
6. **Proyecto Supabase:** no se asumió disponible ni se consultó. `npdrjhbkilicuieecbgd` sigue sin aprobación
   documental (ADR-0002 §3). El proyecto de Diario Gym v2 no se considera disponible.

## 7. Siguientes pasos

1. **Codex:** revisar `packages/contracts` (especialmente `sessions`, `sets`, `repositories`, `errors`) y
   responder a ADR-0003 §5. Tras el acuerdo, publicar `0.2.0` o `1.0.0` en el CHANGELOG.
2. **Propietario:** decidir las cuestiones abiertas de ADR-0003 §5 y aprobar o rechazar la ADR;
   confirmar el contenido del informe de diagnóstico vacío.
3. **Claude:** `packages/data` con repositorios SQLite + outbox + motor de sync contra un `SyncTransport`
   en memoria, con pruebas offline y de sincronización (sin red ni Supabase).
4. **Claude, con aprobación:** `supabase/` local (CLI local, nunca remoto): migraciones `athlete3`,
   RLS, `sync_push`/`sync_pull`, pruebas de aislamiento entre dos usuarios y prueba de paridad de `local_date`.
5. Añadir lint/format y CI (ADR-0002 §9) cuando Codex fije la configuración de la app, para compartirla.
