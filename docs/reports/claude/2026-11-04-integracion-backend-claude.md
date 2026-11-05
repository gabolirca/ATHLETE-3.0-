# Informe — Integración del backend: `packages/data` como única capa de persistencia

**Agente:** Claude · **Fecha:** 4 de noviembre de 2026 · **Rama:** `claude/backend-foundation`
**Alcance:** auditoría y diseño. **No se migró, copió, borró ni modificó ninguna base de datos.** No se tocó la
rama de Codex (solo lectura), Supabase remoto ni el respaldo de Diario Gym. Sin commits.

Decisión del propietario (4-nov-2026): la persistencia oficial es `packages/data`, consumida por `apps/mobile` a
través de contratos y servicios públicos. Habrá una sola implementación de SQLite y una sola cola de sincronización.
Ninguna base se migra sin aprobación explícita del plan (§6).

Leyenda: **[V]** verificado en código, archivos o pruebas · **[H]** hipótesis o inferencia pendiente de confirmar.

---

## 1. Capas comparadas

| | App móvil (Codex) | `packages/data` (Claude) |
|---|---|---|
| Código | `apps/mobile/src/data/{database.ts, SQLiteTrainingRepository.ts, trainingSchemas.ts}` | `packages/{contracts,domain,data}` |
| Contratos | Zod propios ("provisionales", según su comentario) | `@athlete/contracts` 0.2.0 |
| Archivo | `athlete3.db` (único por dispositivo) | `athlete3-<userId>.db` (uno por usuario y ambiente) |
| Versión de esquema | `PRAGMA user_version = 1` | `PRAGMA user_version = 1` (`LOCAL_SCHEMA_VERSION`) |
| Cifrado | SQLCipher; clave aleatoria en SecureStore `athlete3.sqlite.sqlcipher-key.v1`; verificación de primera instalación frente a base existente (endurecido el 4-nov) | `fromExpoSqlite(raw, { encryptionKey })` aplica `PRAGMA key` **sin verificar** que abra |
| Propietario | `owner_key = 'device:<uuid v4>'` (SecureStore `athlete3.local-owner.v1`) | `user_id` = UUID de `auth.uid()`; `LocalStore.open` exige un UUID y fija la base a ese usuario |
| Identificadores | UUID v4 (`expo-crypto.randomUUID`); ejercicios de muestra con id de texto (`sample-bench-press`) | UUID v7 del cliente; catálogo global con UUID del servidor |
| Sync | `sync_outbox` por **agregado** (`workout_session` + operación `add_set`, `upsert_set`, `complete`…), `local_version`/`server_version`; **sin transporte** | `outbox` por **entidad/fila** (`upsert`/`delete`), `revision` del servidor, motor `SyncEngine` y RPC `sync_push`/`sync_pull` probadas contra Postgres |
| Pruebas | 4 suites Jest | 208 pruebas (unitarias, Postgres local e integración) |

**[V] Colisión crítica.** Las dos capas usan los mismos nombres de tabla (`exercises`, `workout_sessions`,
`session_exercises`, `body_measurements`) con columnas distintas, y las dos marcan `user_version = 1`. Si
`createAthleteData` se abriera sobre `athlete3.db`, `migrateLocalDatabase` vería la versión 1 y **no crearía sus
tablas**. Las consultas fallarían o, peor, leerían columnas que no existen. **Regla:** `packages/data` nunca abre el
archivo heredado como su base; usa un archivo nuevo (`localDatabaseName`) y la migración lee desde una copia (§6).

## 2. Diferencias detalladas

### 2.1 Esquema y semántica

| Concepto | Codex | `packages/data` / servidor | Conversión |
|---|---|---|---|
| Rutina | `routines(id, name)` + `routine_exercises(sets_target, reps_target, rest_seconds)` | `training_plans` → `training_days` → `training_day_exercises` | 1 rutina → 1 plan `active` + 1 día `training` (posición 0) + N ejercicios planificados (`targetSets`, `targetRepsMin = targetRepsMax = reps`, `targetRestSeconds`) |
| Estado de sesión | `active` · `completed` · `deleted` | `in_progress` · `completed` · `discarded` + `deleted_at` | `active→in_progress`; `completed→completed`; `deleted→deleted_at = tombstoned_at` y `status = completed` si tenía `completed_at`, si no `discarded` |
| Hora y fecha local | solo `started_at` (UTC); sin zona | `started_at`, `time_zone`, `local_date` (obligatorios) | zona = `athlete_local_preferences.timezone`, o la del dispositivo en el momento de migrar; `local_date = localDateOf(...)` **[H: la zona real del entrenamiento se desconoce]** |
| Fin de sesión | `completed_at` | `ended_at` (obligatorio si `completed`) | directo |
| Series | filas creadas **vacías** al iniciar desde rutina; "registrada" = peso o reps no nulos; sin `completedAt` | una serie es lo realmente hecho; `completedAt` marca ejecución | se migran solo las series con algún dato; `completed_at = updated_at` de la serie **[aproximación documentada]**; `position = set_index`; `set_type = is_warmup ? warmup : working` |
| Peso de serie | ≤ 1500 kg, decimales libres | 0–1000 kg, 2 decimales | > 1000 → cuarentena (§6.5); redondeo a 2 decimales registrado en el informe de migración |
| Repeticiones | entero 1–200 | entero 0–1000 | compatible |
| RIR | entero 0–10 | 0–10 en pasos de 0.5 | compatible (subconjunto) |
| Ejercicios | 6 de muestra, id de texto, `muscle_group` como texto | catálogo global (12, UUID, slugs) + personalizados | bench-press, back-squat, romanian-deadlift, lat-pulldown y overhead-press por slug. "Remo sentado" no está en el catálogo → ejercicio personalizado con id derivado |
| Medidas | `body_measurements(type ∈ weight_kg, waist_cm, chest_cm, hip_cm)`, valor ≤ 500 | `body_weights` (20–400 kg) y `body_measurements(site, value_cm ≤ 300)` | `weight_kg → body_weights`; `waist_cm → waist`, `chest_cm → chest`, `hip_cm → hips`; fuera de rango → cuarentena |
| Preferencias | `display_name`, `unit_system`, `preferred_sport`, `timezone` | `Profile` (sin deporte preferido) | todo menos `preferred_sport` → perfil. `preferred_sport` → cuarentena hasta que el contrato tenga deportes (§5) |
| Conflictos | `sync_conflicts` | conflictos en la outbox | se espera vacío (sin transporte) |

### 2.2 Validaciones

| Regla | Codex | Oficial |
|---|---|---|
| Nombre de rutina | 2–60 | 1–120 (plan) |
| Ejercicios por rutina | ≥ 1, series 1–12, descanso 0–900 | objetivos opcionales; series 1–50, descanso 0–3600 |
| Finalizar sin series | prohibido (`WORKOUT_REQUIRES_RECORDED_SET`) | permitido |
| Iniciar con sesión activa | devuelve la activa en silencio | `INVALID_STATE` con `details.activeSessionId` |
| Editar sesión completada | prohibido (`requireActiveSession`) | permitido (especificación §6.4) |

Las tres últimas son **decisiones de producto**, no errores. Propuesta: conservar las reglas oficiales. Si se quiere
impedir "finalizar sin series", que sea una advertencia en la UI y no un bloqueo de datos.

### 2.3 Sincronización

- La outbox de Codex no tiene transporte; ninguna operación ha salido del dispositivo **[V en código]**. Sus
  operaciones por agregado no se corresponden con las RPC del servidor, que esperan filas con `revision`.
- Por eso **no se traduce** la outbox heredada. Tras migrar, cada registro vivo se encola como `upsert` con
  `base_revision = null`, exactamente como si se hubiera creado con `packages/data`. Precondición verificable: en
  la base heredada todo `server_version IS NULL` y ninguna fila de `sync_outbox` está en `acked`/`syncing`. Si no se
  cumple, se aborta y se escala.

### 2.4 Huecos de `packages/data` que bloquean la integración

| # | Hueco | Propuesta |
|---|---|---|
| G1 | **Sin identidad local**: `createAthleteData` exige el UUID de un usuario autenticado; la app funciona hoy sin cuenta | Usar como `userId` local el UUID de `device:<uuid>` (ya está en SecureStore). Añadir en `packages/data` una operación `adoptLocalData(authUserId)` que, en una transacción, reasigne `user_id` y `sync_state.user_id` y cambie de archivo al iniciar sesión. Las mutaciones no llevan `user_id` (lo pone el servidor), así que la outbox sigue siendo válida. **Por implementar y probar** |
| G2 | **Catálogo solo por red**: `applyCatalog` llega con `pullCatalog()`; sin red ni cuenta no hay ejercicios | Incluir en `packages/data` una instantánea del catálogo semilla (mismos UUID y slugs que la migración 0300), aplicada al abrir si `catalog_at` es nulo, y una prueba de integración que la compare con Postgres |
| G3 | **Ciclo de vida de la clave SQLCipher fuera del paquete**: la lógica endurecida vive en la app; el adaptador no verifica | Mover a `packages/data` un `openEncryptedDatabase({ open, secureStore, name })` con puertos (sin importar Expo): primera instalación frente a existente, sin sobrescribir claves, prueba de lectura antes de migrar y errores tipados. La app solo inyecta `expo-sqlite` y `expo-secure-store` |
| G4 | `fromExpoSqlite` documentado para SDK 54; nunca ejecutado en SDK 58 | Validar en el simulador con el ciclo completo (criterio de aceptación) |
| G5 | Sin "deporte(s) principal(es)" en el perfil (decisión: atletas de fuerza **e híbridos**) | Contrato 0.3.0: `Profile.sports: Array<'strength' \| 'running' \| 'swimming' \| 'cycling' \| 'other'>` (lista, no un único valor) |

## 3. Propuesta: `packages/data` como única fuente oficial

1. **Propiedad:** Claude mantiene `packages/contracts` (con revisión de Codex), `packages/domain` y `packages/data`,
   que incluye esquema local, migraciones locales, outbox, sync, cifrado y la migración desde la capa heredada.
   Codex mantiene la UI y una capa delgada de adaptación de vista (hooks), **sin SQL**.
2. **Punto de entrada único:** `createAthleteData` (o un `openAthleteData` que sume G1–G3), creado una vez en un
   proveedor de React. La UI no importa `expo-sqlite` salvo para inyectarlo.
3. **Retirada de la capa heredada:** primero deja de escribirse (solo lectura para la migración); luego se elimina
   el código. El archivo `athlete3.db` se conserva hasta que el propietario apruebe su retiro (§6.7).
4. **Una sola outbox:** la de `packages/data`. La de Codex no se transporta ni se reutiliza.
5. **Monorepo:** al fusionar ramas, `package.json` raíz con `workspaces: ["apps/*", "packages/*", "supabase/tests"]`.
   Pendiente desde el informe del 3-nov: conflicto de archivos raíz entre ramas. Hoy Codex está en TS 6.0 /
   React 19.3 y los paquetes en TS 5.9: hay que alinear la versión de TypeScript.

## 4. Contratos a promover a `@athlete/contracts` 0.3.0

| Cambio | Decisión | Justificación | Compatibilidad |
|---|---|---|---|
| `WorkoutSessionRepository.startFromTrainingDay(input) → WorkoutSessionDetail` | **Promover** | Ya implementado y probado (atómico). Sustituye a `startWorkout(routineId)` de Codex | Aditivo |
| `TrainingDayExercise.targetRir` con `multipleOf(0.5)` | **Promover** | El servidor ya lo exige; hoy solo lo valida el repositorio | Endurece. Sin datos afectados: Codex no tiene RIR objetivo |
| `position` ≤ 1000 en días, ejercicios planificados, ejercicios de sesión y series | **Promover** | Igual que el servidor (`between 0 and 1000`) | Endurece; ningún flujo real se acerca al límite |
| Estados de sesión `in_progress \| completed \| discarded` + `deletedAt` | **Se mantienen**; Codex adapta (§2.1) | Ya son contrato y servidor | Sin cambio |
| `weightKg` 0–1000, `reps` 0–1000, entero | **Se mantienen** | `reps = 0` es un dato real (intento fallido) | Sin cambio |
| Precisión de `weightKg`/`distanceMeters` (2 decimales) | **Documentar** en el contrato (JSDoc); se normaliza en `packages/data` | Un `multipleOf(0.01)` rechazaría conversiones desde lb | Sin cambio de esquema |
| No crear series vacías al iniciar desde rutina | **Decisión de contrato** | Una serie vacía no es un dato; ensucia el historial, la sync y cualquier modelo (ver informe del modelo, §4) | Codex muestra los objetivos del plan como guía |
| `Profile.sports` (G5) y deportes/actividades para híbridos | **Proponer** | Decisión del propietario: fuerza + híbridos | Aditivo |

Cada cambio se registra en `CHANGELOG.md` y requiere revisión de Codex (ADR-0001, regla 4). **Ninguno se aplicó
todavía.**

## 5. Inventario de bases SQLite existentes (4-nov-2026, solo lectura)

Método: se listaron los contenedores de datos de todos los simuladores (`CoreSimulator/Devices/*`) con bundle que
contenga `athlete`. Solo se leyeron tamaños, fechas y los primeros 15 bytes (cabecera). **No se abrió ni descifró
ninguna base.**

| Ubicación | Archivo | Tamaño | Cabecera | Contenido |
|---|---|---|---|---|
| Simulador "ATHLETE SDK58 Validation" (`89B574BC…`), `com.athlete.mobile`, contenedor `527625A0…` | `Documents/SQLite/athlete3.db` | 131 072 B | no es `SQLite format 3` → cifrada **[V]** | Esquema de Codex v1 (por código). **[H]** datos de prueba de validación: la app mostraba 1 sesión completada y "20 pendientes" a las 17:49 |
| ídem | `athlete3.db-wal` | 123 632 B | cifrada | **contiene transacciones confirmadas aún no volcadas** al `.db` |
| ídem | `athlete3.db-shm` | 32 768 B | — | índice del WAL |
| ídem | `Library/Caches/…/Cache.db`, `HTTPStorages/…` | — | texto plano | caché HTTP de iOS, no son datos de la app |

- No hay contenedores de identificadores anteriores (`com.anonymous.athlete-3`).
- **[V]** El contenedor `7E0A8B8E…` observado antes ese mismo día ya no existe: la app se reinstaló en algún
  momento. Esto confirma que desinstalar borra la base y la clave del llavero.
- **No inventariado:** dispositivos físicos. El propietario debe confirmar si la app se instaló en algún iPhone con
  datos reales. Hasta entonces, se trata cualquier base como si pudiera contener datos reales.

## 6. Diseño de la migración local (no ejecutada; requiere aprobación)

### 6.1 Principios

- **La base original nunca se escribe.** Se lee desde una copia.
- **Transaccional:** toda la escritura en la base nueva ocurre en una sola transacción; si algo falla, no queda nada.
- **Verificable:** conteos y sumas de control entre origen y destino, y un informe persistido.
- **Reversible:** hasta que el propietario lo apruebe, la app puede volver a la capa heredada sin perder lo que
  había antes de migrar.
- **Idempotente:** se identifica por el hash de la copia de origen; repetirla no duplica datos.

### 6.2 Pasos

1. **Precondiciones:**
   - la clave heredada existe y abre la base (verificación de `database.ts`);
   - `user_version = 1`;
   - todo `server_version IS NULL`;
   - la outbox no tiene filas en `acked` ni `syncing`.

   Si algo falla, se aborta con un error tipado y sin escribir nada.
2. **Respaldo:**
   - con la conexión heredada abierta: `PRAGMA wal_checkpoint(TRUNCATE)`. Es una operación normal de SQLite que vuelca
     el WAL al `.db` sin cambiar datos. Si se prefiere no tocar ni eso, se copian los tres archivos juntos;
   - se cierra la conexión;
   - se copian `athlete3.db`, `-wal` y `-shm` a `Documents/SQLite/backups/legacy-<timestamp>/`, con `manifest.json`
     (SHA-256 de cada archivo, tamaños, `user_version`, conteos por tabla).

   La copia sigue cifrada con la misma clave, que **no se toca**.
3. **Lectura:** se abre la **copia** con la clave heredada y se lee todo en memoria (volumen esperado: cientos de
   filas).
4. **Transformación:**
   - funciones puras en `packages/data/src/legacy/` según §2.1;
   - ids derivados deterministas (UUID v5 con espacio de nombres fijo) para las entidades que no existían, como el día
     de cada rutina o el ejercicio personalizado "Remo sentado";
   - se conservan todos los UUID heredados.
5. **Escritura:**
   - se abre la base nueva (`localDatabaseName(userId)`) con su **propia clave nueva** en
     `athlete3.sqlcipher-key.<nombre-de-base>.v1`, mediante el flujo G3;
   - en una transacción: filas, outbox (`upsert` por cada registro vivo), `legacy_quarantine` y
     `sync_state.legacy_migration = {sourceSha256, counts, migratedAt, appVersion}`.
6. **Verificación**, dentro de la misma transacción, antes del `COMMIT`:
   - conteos por entidad (origen − descartados − cuarentena = destino);
   - suma de `weight_kg × reps` y número de series con RIR no nulo, idénticos;
   - todos los ids heredados presentes.

   Si algo no coincide → `ROLLBACK`.
7. **Conmutación:** solo tras el `COMMIT`, la app guarda `athlete3.active-store = new` (valor no secreto) y abre
   `packages/data`. La capa heredada queda en solo lectura.

### 6.3 SQLCipher y SecureStore

- Claves **independientes** para la base heredada y la nueva. Ninguna se sobrescribe: se crea solo si falta y la base
  correspondiente está vacía (regla ya probada en `database.ts`).
- La clave heredada se conserva mientras exista `athlete3.db` o un respaldo suyo.
- **Riesgo [V]:** la clave vive en el llavero, que se borra al desinstalar. Un respaldo cifrado sin su clave es
  irrecuperable. Para un respaldo fuera del dispositivo hay que decidir cómo exportar la clave, por ejemplo cifrada
  con una frase del usuario. Queda fuera de este plan y pendiente del propietario.

### 6.4 Identificadores y estado de sincronización

- UUID heredados conservados: rutina → plan, sesión, ejercicio de sesión, serie y medida.
- `user_id` local = UUID de `device:<uuid>` (G1); al iniciar sesión se ejecuta `adoptLocalData`.
- Outbox nueva generada desde las filas; la heredada se conserva en la copia, como evidencia.
- Registros heredados eliminados: se migran con `deleted_at` y **sin** mutación. Nunca llegaron al servidor; es la
  misma semántica que `LocalStore.remove`.

### 6.5 Cuarentena

Lo que no cumple el contrato oficial no se descarta ni se corrige en silencio. Se guarda en
`legacy_quarantine(entity, legacy_id, reason, raw_json)` dentro de la base nueva y se muestra en el informe. Por
ejemplo: peso > 1000 kg, peso corporal fuera de 20–400, `preferred_sport` o un ejercicio sin correspondencia. Las
series vacías se cuentan, pero no se guardan.

### 6.6 Recuperación

| Fallo | Efecto | Recuperación |
|---|---|---|
| Antes del `COMMIT` | ninguno: `ROLLBACK`; la app sigue con la capa heredada | reintentar tras corregir |
| Cierre de la app durante la escritura | la transacción no se confirma; `active-store` no cambia | reintento automático al abrir |
| Datos incorrectos detectados después | la base heredada está intacta | volver a `active-store = legacy`. Lo creado después de migrar se exporta desde la base nueva antes de volver |
| Pérdida de la clave nueva | la base nueva no abre (`database-key-missing`) | se vuelve a migrar desde la heredada (sigue intacta) |

### 6.7 Retiro de la base heredada

Solo con aprobación explícita del propietario y tras un periodo de convivencia acordado (propuesta: 2 versiones de
la app). Primero se borra el `.db` heredado y después su clave, conservando el respaldo mientras se decida.

### 6.8 Pruebas obligatorias antes de aprobar

En `packages/data` (Node, SQLite real):
- base heredada sintética con cada caso de §2.1: series vacías, eliminados, valores fuera de rango, zona ausente;
- migración correcta, idempotente y con verificación;
- fallo inyectado en cada paso (sin efecto);
- base nueva que sincroniza contra Postgres sin `rejected`.

En el simulador:
- migrar una base generada por la versión actual de la app;
- recorrer el ciclo completo;
- cerrar y reabrir;
- comprobar que la base heredada y su respaldo siguen intactos (SHA-256).

## 7. Criterios de aceptación del propietario: estado

| Criterio | Estado |
|---|---|
| Una sola capa de persistencia en la app | ⏳ requiere la integración de Codex + G1–G3 |
| Crear, modificar y consultar rutinas | ✅ en `packages/data` (pruebas). ⏳ en la app |
| Registrar y finalizar entrenamientos | ✅ en `packages/data`. ⏳ en la app |
| Persistencia tras cerrar y reabrir | ✅ en Node. ⏳ en simulador con `packages/data` |
| Cola de sincronización única | ⏳ |
| Contratos iguales en móvil y backend | ⏳ tras la 0.3.0 y la integración |
| Errores de migración no destruyen el original | 📐 diseñado (§6); sin implementar |
| SQLCipher y SecureStore funcionando | ✅ en la capa heredada (validado el 4-nov). ⏳ con `packages/data` |
| Ciclo completo validado en iOS Simulator | ⏳ |

## 8. Orden propuesto

1. Aprobación del propietario de este plan (§6) y de los cambios de contrato (§4).
2. Claude: G1–G3 + contratos 0.3.0 + módulo `legacy/` con sus pruebas (sin ejecutarlo sobre datos reales).
3. Codex: integración de la UI con `createAthleteData` según `docs/contracts/guia-integracion-codex.md`, detrás del
   indicador `active-store`.
4. Validación conjunta en el simulador con una base heredada de prueba.
5. Aprobación del propietario → migración en dispositivos con datos.
