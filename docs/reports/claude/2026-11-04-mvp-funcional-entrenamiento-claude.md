# Informe — Functional MVP: ciclo completo de entrenamiento (backend)

**Agente:** Claude · **Fecha:** 4 de noviembre de 2026
**Rama:** `claude/backend-foundation` (worktree `~/GYM/ATHLETE-CLAUDE`) · sin commit, push ni merge.
**Informes previos (no se sobrescriben):** `2026-11-03-backend-foundation-claude.md`, `2026-11-03-backend-funcional-seguridad-claude.md`.

> No se tocó Supabase remoto (sin `db push` ni migraciones remotas), ni la rama de Codex, ni `main`, ni EasyTeacher.
> No se modificaron `@athlete/contracts`, las migraciones SQL, la estructura de sync, SQLCipher ni SecureStore.
> Las pruebas de base de datos se ejecutaron contra un Postgres 16 local y desechable (127.0.0.1:54329).

## 1. Diagnóstico (auditoría antes de modificar)

Línea base: `typecheck` sin errores; 193 pruebas en verde (contracts 14 · domain 46 · data 58 · supabase 69 · integración 6).

### 1.1 Terminado (antes de esta fase)

- Plan → día → ejercicio planificado con series, repeticiones (mín./máx.), descanso, RIR y peso objetivo.
- Sesión: inicio, una en curso a la vez, transiciones `in_progress → completed | discarded`, edición de completadas.
- Series con peso, repeticiones, RIR, RPE y `completedAt`. Historial paginado y detalle.
- Cada escritura y su mutación de outbox van en la misma transacción. Versiones (`revision`), tombstones en cascada,
  coalescencia, conflictos explícitos y pull que nunca pisa cambios pendientes.
- RIR: contrato `0–10` en pasos de `0.5` y `null`; servidor `numeric(3,1)` con la misma regla. Ninguna lógica de
  dominio lo infiere ni lo transforma.

### 1.2 Huecos encontrados (el cliente aceptaba localmente lo que el servidor rechaza)

Una mutación rechazada queda `rejected` en la outbox para siempre: el dato existe en el teléfono y nunca llega al
servidor ni a otros dispositivos. Cada hueco se reprodujo con una prueba que fallaba antes de corregirlo.

| # | Hueco | Restricción del servidor |
|---|---|---|
| H1 | `start()` no comprobaba que `trainingDayId` existiera | FK compuesta `workout_sessions → training_days` |
| H2 | `addExercise()` no comprobaba `trainingDayExerciseId` | FK compuesta `session_exercises → training_day_exercises` |
| H3 | `updateDayExercise()` aceptaba un `exerciseId` inexistente | FK `training_day_exercises → exercises` |
| H4 | `targetRir` aceptaba `1.3` (el contrato no exige pasos de 0.5) | `is_half_step(target_rir)` |
| H5 | `position` sin máximo | `position between 0 and 1000` |
| H6 | `startedAt` sin límites | `workout_sessions_sane_dates` (> 2000-01-01, < ahora + 2 días) |
| H7 | `weightKg`/`targetWeightKg`/`distanceMeters` con cualquier número de decimales | `numeric(6,2)` / `numeric(9,2)` redondea; la copia local divergía para siempre (p. ej. 225 lb → 102.0583 local vs 102.06 servidor) |
| H8 | Iniciar una sesión desde una rutina requería `start` + N × `addExercise` sin atomicidad | — (funcional) |

### 1.3 Duplicado / incompleto fuera del backend (solo lectura de la rama de Codex)

La app móvil (`ATHLETE-CODEX/apps/mobile/src/data/SQLiteTrainingRepository.ts`) implementa **su propia capa de
datos**. No usa `@athlete/contracts`, `@athlete/domain` ni `@athlete/data`: tiene otro esquema, otra outbox
(`sync_outbox` por agregado) y otros nombres. Su comentario indica que los contratos compartidos "aún no existen"
porque las ramas no se han fusionado. Diferencias relevantes:

| Aspecto | App móvil (Codex) | Backend / contratos |
|---|---|---|
| Estado de sesión | `active` / `completed` / `deleted` | `in_progress` / `completed` / `discarded` + tombstone |
| RIR | entero 0–10 | 0–10 en pasos de 0.5 (los enteros son un subconjunto compatible) |
| Repeticiones | 1–200 | 0–1000 |
| Peso | ≤ 1500 kg | ≤ 1000 kg, 2 decimales |
| Rutina | `routines` + `routine_exercises` (series, reps, descanso) | `TrainingPlan` → `TrainingDay` → `TrainingDayExercise` |
| Calentamiento | `is_warmup` | `setType: 'warmup' \| 'working'` |
| Sync | outbox por agregado, sin servidor | outbox por entidad con RPC `sync_push`/`sync_pull` probadas |

Su outbox **no es compatible** con las RPC del servidor. No se modificó nada en esa rama.

## 2. Cambios (solo `packages/data` y documentación)

| Archivo | Cambio |
|---|---|
| `packages/data/src/repositories/base.ts` | `checkPosition` (0–1000), `checkStartedAt` (regla del servidor) y `toServerScale` (redondeo a la escala `numeric` del servidor, como ya hacía el peso corporal) |
| `packages/data/src/repositories/workout-sessions.ts` | `start` y `startFromTrainingDay` comparten `createSession` (fecha, sesión en curso, duplicado, día existente). `addExercise` valida `trainingDayExerciseId`. Límite de posición en ejercicios y series. Peso/distancia con 2 decimales en `logSet`/`updateSet`. `update` valida un nuevo `startedAt`. **Nuevo `startFromTrainingDay`** (atómico) |
| `packages/data/src/repositories/catalog-profile-plans.ts` | `targetRir` validado con el esquema `Rir` del contrato (pasos de 0.5). Límite de posición en días y ejercicios planificados. `updateDayExercise` valida un `exerciseId` nuevo. `targetWeightKg`/`targetDistanceMeters` con 2 decimales |
| `packages/data/test/unit/training-cycle.test.ts` | 14 pruebas nuevas (§3) |
| `packages/data/test/integration/training-cycle.test.ts` | 1 prueba de extremo a extremo contra Postgres (§3) |
| `docs/contracts/frontend-guide.md` | Sección "Ciclo completo": correspondencia rutina ↔ plan, `startFromTrainingDay`, RIR, reglas previas a escribir y comparación de instantes |
| `docs/architecture/testing.md` | Totales y descripción de la nueva prueba de integración |

`startFromTrainingDay({ id, trainingDayId, startedAt, timeZone, title?, notes? }) → WorkoutSessionDetail`:
- Crea la sesión y un ejercicio de sesión por cada ejercicio planificado vivo, en el orden del plan y enlazado con
  `trainingDayExerciseId`.
- **No crea series**: lo planificado no es lo ejecutado.
- Todo ocurre en una transacción. Si falla (sesión en curso, día o ejercicio eliminado) no queda nada escrito, ni filas
  ni mutaciones.
- Se publica en `@athlete/data` (clase `LocalWorkoutSessionRepository`, visible a través de `createAthleteData`), **no**
  en la interfaz de `@athlete/contracts`.

**Contratos compartidos:** sin cambios. Las reglas H4–H7 se aplican en el repositorio, sin tocar los esquemas Zod,
porque endurecer el contrato requiere coordinarse con Codex (ver §5).

## 3. Pruebas

### 3.1 Resultados reales

```
npm run typecheck                       → 0 errores (contracts, domain, data, supabase-tests)
npm test                                → contracts 14 ✓ · domain 46 ✓ · data 72 ✓ (58 + 14 nuevas)
npm run test:db (Postgres 16 local)     → supabase 69 ✓ · data integración 7 ✓ (6 + 1 nueva)
Total: 208 (antes 193)
```

### 3.2 Qué cubren las nuevas

| Requisito | Prueba |
|---|---|
| Ciclo 1–8 en SQLite | Rutina con objetivos → `startFromTrainingDay` → 5 series (calentamiento + RIR `2`, `0.5`, `0`, `10`, `null`) → `complete` → historial (4 series efectivas, volumen exacto) |
| Finalizar no altera series | Instantánea cruda de `session_exercises`, `strength_sets` y sus mutaciones de outbox, leída del archivo SQLite antes y después de `complete`: idénticas, incluidos `updated_at` y `revision` |
| Persistencia tras cerrar/abrir | Se cierra la base y se reabre: detalle, historial, series por ejercicio y rutina idénticos; outbox pendiente conservada. Una sesión en curso iniciada desde el día se recupera con `getActive` |
| RIR válido / inválido | Acepta `0, 0.5, 1, 2, 4.5, 9.5, 10, null`. Rechaza `-1, -0.5, 10.5, 11, 2.3, 0.25, NaN, ∞, '2', true` con `VALIDATION_FAILED` y sin escribir |
| RIR 0 ≠ null | `updateSet`: `rir: 0` se conserva, ausente no cambia, `null` borra |
| RIR almacenado | Columna `rir` con `typeof = real`; el payload de la mutación lleva `0.5` y `0` tal cual |
| RIR objetivo | `targetRir` `1.3`/`2.25` → `VALIDATION_FAILED`; `0` válido |
| Integridad | H1–H7 (referencias, posiciones, fechas, precisión) |
| Atomicidad | Si un ejercicio planificado fue eliminado: `NOT_FOUND`, sin sesión, sin ejercicios, sin mutaciones nuevas |
| Servidor y otro dispositivo | Ciclo completo → `syncNow` con 0 pendientes, 0 conflictos y 0 rechazos → en Postgres la columna `rir` = `[null, 2, 0.5, 0, 10]`, `target_rir = 1.5`, pesos `102.06`. La tablet ve los mismos valores, historial y objetivos. Un segundo sync no cambia la copia del teléfono |

### 3.3 Las pruebas detectan fallos (sabotaje deliberado y revertido)

- `rir: i.rir || null` (convierte 0 en null) → fallan 4 pruebas.
- `complete()` reescribe las series de la sesión → falla la prueba de "finalizar no altera".
- Sin redondeo a la escala del servidor → falla la prueba de integración (`102.058…` local vs `102.06` servidor).

Tras revertir, todo vuelve a estar en verde.

## 4. Estado honesto por funcionalidad

| Funcionalidad | Backend (`@athlete/*`) | En la app real |
|---|---|---|
| Crear rutina, ejercicios, series/reps/descanso objetivo | ✅ probado local + servidor | ⏳ la app usa su propia capa |
| Iniciar sesión (libre o desde rutina) | ✅ (`startFromTrainingDay` 🟡 fuera del contrato) | ⏳ |
| Registrar series con peso, reps y RIR | ✅ | ⏳ |
| Finalizar sin alterar series | ✅ | ⏳ |
| Historial y recuperación tras reinicio | ✅ (SQLite en Node) | ⏳ no validado en Expo SQLite + SQLCipher |
| Sync del ciclo a otro dispositivo | ✅ contra Postgres local con stub de auth | 🟡 sin PostgREST/GoTrue reales (requiere Docker) |

El ciclo está **terminado en el backend**. **No** está terminado de punta a punta: la app todavía no consume
`@athlete/data`, y el adaptador `fromExpoSqlite` no se ha ejecutado sobre la base SQLCipher en un dispositivo o simulador.

## 5. Pendientes, riesgos y coordinación con Codex

| # | Pendiente / riesgo | Prioridad | Responsable |
|---|---|---|---|
| 1 | Unificar la capa de datos: la app debe usar `createAthleteData` (+ `fromExpoSqlite` sobre la conexión SQLCipher existente) en lugar de `SQLiteTrainingRepository`. Mientras haya dos capas, la outbox de la app no puede sincronizar con el servidor | Alta | Codex + Claude |
| 2 | Migración de datos locales de la capa de Codex al esquema de `@athlete/data`. **No se hizo nada**: requiere aprobación, porque implica transformar datos del usuario | Alta | Decisión del propietario |
| 3 | Promover al contrato (0.3.0): `startFromTrainingDay` en `WorkoutSessionRepository`; `targetRir` con `multipleOf(0.5)`; `position` ≤ 1000. Hoy se aplican en `@athlete/data` y el servidor; el contrato es más permisivo | Media | Claude propone, Codex revisa |
| 4 | Validar `fromExpoSqlite` + SQLCipher + SecureStore con el ciclo completo en el simulador | Alta | Codex + Claude |
| 5 | Ejecutar las suites contra `supabase start` (Postgres 17 + PostgREST + GoTrue reales) | Alta | Claude (requiere Docker) |
| 6 | Cardio: `distance_m` (`numeric(9,2)`) no se redondea localmente; mismo riesgo de divergencia que H7. Fuera del alcance de esta fase | Media | Claude |
| 7 | Formato de instantes: `Z` (local) vs `+00:00` (servidor) para el mismo instante. La UI debe comparar con `Date.parse` (documentado). Normalizar al aplicar el pull sería un cambio en sync: no se hizo | Baja | Claude |
| 8 | `checkStartedAt` usa el reloj del dispositivo; con un reloj muy adelantado o atrasado, el servidor puede rechazar igualmente (`rejectedCount > 0`) | Baja | — |
| 9 | La UI con RIR entero (Codex) es compatible; si se ofrecen medios pasos, el backend ya los admite | — | Codex decide |

## 6. Cómo reproducir

```sh
cd ~/GYM/ATHLETE-CLAUDE
npm run typecheck && npm test
# Postgres desechable local: ver docs/architecture/testing.md §2
DATABASE_URL=postgresql://postgres@127.0.0.1:54329/postgres npm run test:db
```
