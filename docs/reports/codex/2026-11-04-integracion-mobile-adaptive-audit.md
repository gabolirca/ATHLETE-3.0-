# ATHLETE 3.0 — Auditoría de integración móvil y propuesta Adaptive Training

**Fecha:** 4 de noviembre de 2026  
**Rama auditada:** `codex/mobile-foundation`  
**Fuente backend revisada:** worktree `ATHLETE-CLAUDE`, rama `claude/backend-foundation` (solo lectura).  
**Estado:** diagnóstico y plan; no se cambió código de app/datos, no se abrió una base de usuario, no se ejecutó migración ni se tocó backend/Supabase.

## 1. Diagnóstico de integración

La app todavía opera con una arquitectura local propia. `apps/mobile/app/_layout.tsx` abre `athlete3.db` mediante `SQLiteProvider`, llama a `initializeAthleteDatabase` y envuelve la app en `LocalTrainingProvider`. Este provider obtiene un propietario local y construye `SQLiteTrainingRepository`. Las pantallas consumen la interfaz móvil `TrainingRepository`; el repositorio ejecuta SQL directamente.

Las pantallas que dependen del repositorio local son Inicio, Entrenar, Progreso, Perfil, selección/detalle de ejercicios, creación de rutina, inicio de sesión, sesión activa, historial y detalle de sesión. Nutrición solo muestra un estado vacío. No hay auth ni transporte remoto conectados desde esta app.

La arquitectura encontrada en `ATHLETE-CLAUDE` ya expone `createAthleteData({ db, userId, ids, transport, ... })`, que abre/migra el store y entrega `profile`, `exercises`, `plans`, `sessions`, `cardio`, `body`, `sync` y `close`. La UI debe tratar cada operación como `Result<T>` de `@athlete/contracts`; el package es el único propietario del SQL, outbox y sincronización.

**No es seguro apuntar hoy la factory al archivo existente.** Ambos esquemas informan `PRAGMA user_version = 1`, pero el significado de la versión y las tablas no coincide. `migrateLocalDatabase` ejecuta la migración oficial v1 solo cuando el `user_version` es menor que 1; `CREATE TABLE IF NOT EXISTS` no transforma una tabla previa incompatible. La apertura puede dejar tablas con columnas antiguas y provocar fallos posteriores. La integración debe quedar bloqueada detrás de una migración local aprobada y verificada.

Además, la guía de Claude exige `userId` UUID autenticado y `SyncTransport`; la app actual solo tiene `device:<uuid>` local y no tiene auth/configuración remota. `LocalWorkoutSessionRepository.startFromTrainingDay` existe como extensión concreta, pero aún no forma parte de `WorkoutSessionRepository` en `@athlete/contracts`. Se necesita publicar/revisar ese contrato para que iniciar desde rutina sea una operación tipada y atómica.

El móvil está en Expo SDK 58 / React Native 0.88.1. El comentario del adaptador Expo SQLite de Claude todavía menciona SDK 54; su API estructural debe verificarse en typecheck y ejecución nativa con la versión instalada, especialmente SQLCipher y ciclo de conexión. No basta con que compile el paquete en Node.

## 2. Inventario de SQLite y sincronización

### 2.1 Archivos y versiones localizados

- El nombre del archivo de la app configurada es `athlete3.db` (común para la instalación, no por usuario/ambiente).
- El esquema local Codex es versión `user_version = 1`, implementada en `apps/mobile/src/data/database.ts`.
- El package oficial crea nombres `athlete3-<uuid>.db` en producción y `athlete3-<env>-<uuid>.db` para otros ambientes. Su `LOCAL_SCHEMA_VERSION` actual también es 1; la única migración es v1 y es ejecutada por `createAthleteData` → `LocalStore.open`.
- No hay archivo `.db`, `.sqlite` o WAL persistente dentro de `apps/mobile` ni del checkout revisado; las pruebas crean archivos temporales y los limpian. No inspeccioné el sandbox de datos de una app instalada o simulador, por lo que no puedo confirmar si `athlete3.db` existe allí ni cuántas filas contiene.
- El arranque Codex usa SQLCipher, clave en SecureStore con nombre `athlete3.sqlite.sqlcipher-key.v1`, y propietario local con nombre `athlete3.local-owner.v1`. Los valores secretos no se leyeron. El package oficial recibe la clave mediante `fromExpoSqlite` y nombra el archivo por identidad autenticada. La estrategia que preserve la clave, el archivo y el cambio de identidad debe acordarse antes de conectar la factory.

### 2.2 Esquema móvil Codex actual — versión 1

| Tabla | Columnas actuales |
|---|---|
| `exercises` | `id`, `name`, `muscle_group`, `equipment`, `origin`, `created_at` |
| `routines` | `id`, `owner_key`, `name`, `created_at`, `updated_at`, `local_version`, `server_version`, `sync_status`, `tombstoned_at` |
| `routine_exercises` | `id`, `routine_id`, `exercise_id`, `sort_order`, `sets_target`, `reps_target`, `rest_seconds` |
| `workout_sessions` | `id`, `owner_key`, `routine_id`, `state`, `started_at`, `completed_at`, `updated_at`, `local_version`, `server_version`, `sync_status`, `tombstoned_at` |
| `session_exercises` | `id`, `session_id`, `exercise_id`, `sort_order`, `sets_target`, `reps_target`, `rest_seconds` |
| `workout_sets` | `id`, `session_exercise_id`, `set_index`, `weight_kg`, `reps`, `rir`, `is_warmup`, `updated_at` |
| `body_measurements` | `id`, `owner_key`, `measurement_type`, `value`, `unit`, `measured_at`, `local_version`, `server_version`, `sync_status`, `tombstoned_at` |
| `athlete_local_preferences` | `owner_key`, `display_name`, `unit_system`, `preferred_sport`, `timezone`, `updated_at` |
| `sync_outbox` | `id`, `client_mutation_id`, `owner_key`, `aggregate_type`, `aggregate_id`, `operation`, `local_version`, `base_server_version`, `payload_json`, `status`, `attempt_count`, `last_error_code`, `created_at` |
| `sync_conflicts` | `id`, `owner_key`, `aggregate_type`, `aggregate_id`, `local_version`, `server_version`, `local_snapshot_json`, `remote_snapshot_json`, `detected_at`, `resolution` |

Las rutinas se persisten por separado de las sesiones. `workout_sets.rir` es `INTEGER` con CHECK 0–10; `reps` admite 1–200 y `weight_kg` hasta 1500. `state` usa `active/completed/deleted`. La outbox está orientada a agregados y tiene estados `pending/syncing/failed/conflict/acked`.

### 2.3 Esquema oficial `@athlete/data` — versión 1

La base oficial genera las tablas de negocio desde `ENTITIES`; todas las entidades sincronizables comparten `id`, `user_id`, `created_at`, `updated_at`, `deleted_at`, `revision`. Las columnas de negocio declaradas son:

| Tabla | Columnas de negocio |
|---|---|
| `profiles` | `display_name`, `height_cm`, `initial_weight_kg`, `experience_level`, `goals`, `time_zone`, `unit_system`, `load_unit`, `week_starts_on` |
| `exercises` | `slug`, `name`, `modality`, `load_type`, `primary_muscle_group_ids`, `secondary_muscle_group_ids`, `equipment_ids`, `instructions`, `archived_at` |
| `training_plans` | `name`, `description`, `status`, `starts_on`, `ends_on` |
| `training_days` | `plan_id`, `position`, `name`, `kind`, `notes` |
| `training_day_exercises` | `training_day_id`, `exercise_id`, `position`, `target_sets`, `target_reps_min`, `target_reps_max`, `target_weight_kg`, `target_rir`, `target_rest_seconds`, `target_duration_seconds`, `target_distance_m`, `notes` |
| `workout_sessions` | `status`, `training_day_id`, `title`, `started_at`, `ended_at`, `time_zone`, `local_date`, `source`, `notes` |
| `session_exercises` | `session_id`, `exercise_id`, `training_day_exercise_id`, `position`, `notes` |
| `strength_sets` | `session_exercise_id`, `position`, `set_type`, `weight_kg`, `reps`, `rir`, `rpe`, `rest_seconds`, `duration_seconds`, `distance_m`, `completed_at`, `notes` |
| `cardio_sessions` | `activity`, `training_day_id`, `started_at`, `time_zone`, `local_date`, `duration_seconds`, `distance_m`, `rounds`, `reps`, `rpe`, `avg_heart_rate_bpm`, `max_heart_rate_bpm`, `swim_pool_type`, `swim_pool_length_m`, `swim_laps`, `swim_stroke`, `source`, `notes` |
| `body_weights` | `measured_at`, `time_zone`, `local_date`, `weight_kg`, `input_unit`, `source`, `notes` |
| `body_measurements` | `measured_at`, `time_zone`, `local_date`, `site`, `value_cm`, `input_unit`, `source`, `notes` |

También hay tablas de catálogo `muscle_groups`, `equipment`, `outbox` y `sync_state`. La outbox oficial tiene mutaciones por entidad (`mutation_id`, `entity`, `entity_id`, `op`, `base_revision`, `payload`, estado, intentos, resultado remoto, etc.) y el motor único implementa push/pull, backoff y conflictos. La entidad de nutrición existe en contratos, pero está excluida del esquema `ENTITIES` y `createAthleteData` no devuelve repositorio `nutrition` en esta revisión.

### 2.4 Diferencias de datos y reglas

| Tema | Móvil actual | Contracts / `packages/data` revisados |
|---|---|---|
| Identidad/propiedad | `owner_key` local tipo `device:<uuid>` | `user_id` UUID de sesión autenticada |
| Rutina | `routines` + `routine_exercises` | `training_plans` → `training_days` → `training_day_exercises` |
| Estado de sesión | `active/completed/deleted` | `in_progress/completed/discarded` + `deleted_at` |
| Serie/calendario | `workout_sets`, `set_index`, `is_warmup` | `strength_sets`, `position`, `set_type`, `completed_at`, también RPE/descanso/cardio |
| RIR de serie | Entero 0–10; SQLite `INTEGER`; UI solo presenta enteros | Contrato `Rir`: 0–10 en pasos de 0.5, `null` permitido; SQLite oficial `REAL` |
| Repeticiones | 1–200, null | 0–1000, null |
| Peso | 0–1500 kg | 0–1000 kg; `packages/data` guarda a 2 decimales |
| Objetivos de rutina | Series 1–12, reps 1–200, descanso 0–900 s | `targetSets` 1–50, reps 1–1000, descanso 0–3600 s; min/max |
| RIR objetivo | No existe | contrato limita 0–10; `packages/data` aplica pasos de 0.5 (el schema Zod de `targetRir` en contracts no expresa aún `multipleOf`) |
| Outbox | `sync_outbox` agregada y estados propios; no está conectada al servidor | `outbox` por mutación/entidad compatible con RPC `sync_push`/`sync_pull` |
| Perfil y cuerpo | preferencias locales y medidas limitadas | perfil versionado, peso y medidas normalizados con unidad, fecha local y zona horaria |
| Nutrición | ninguna | contratos `MealEntry`, pero falta repositorio/esquema/fachada desde `createAthleteData` |

La guía funcional de Claude confirma valores RIR `[0, 0.5, …, 10]` y diferencia estrictamente `0` de `null`. No hay que ampliar unilateralmente contratos: solicitar que el contrato de `targetRir` refleje la misma regla de medios puntos y validar la versión que finalmente se integra. La interfaz debe mostrar también medios puntos y conservar `null` como “sin registro”.

## 3. Inventario de pantallas y flujos

| Pantalla/ruta | Estado funcional actual | Dependencia/pendiente al integrar |
|---|---|---|
| Inicio `/` | Resumen semanal, actividad y acceso a iniciar/continuar sesión. | Cambiar a lectura `data.sessions`/`data.sync`; sin identidad autenticada actual. |
| Entrenar `/train` | Lista rutinas, catálogo muestra, historial y sesión libre. | Sustituir catálogo sample; modelar plan/día y estado `Result`. |
| Crear rutina `/routines/new` | Nombre, selección de ejercicios, series/reps/descanso; escritura SQLite. | Traducir rutina a plan+día+ejercicios con UUID y resultados. |
| Iniciar `/workout/new` | Inicia libre o por rutina. | Extensión `startFromTrainingDay` aún no en interfaz compartida; no crear inicio parcial sin acordar atomicidad. |
| Sesión `/workout/[sessionId]` | Añade ejercicio/serie, guarda peso/reps/esfuerzo y finaliza. | Mapeo a `session_exercises`/`strength_sets`; hoy sólo RIR entero y calentamiento bool, falta marcado `completedAt` explícito por serie. |
| Catálogo `/exercises/[exerciseId]` | Detalle básico del catálogo de muestra e inicio con ejercicio. | Catálogo oficial con `modality`, grupos/equipo; adaptar IDs y errores. |
| Historial `/history` y detalle | Consulta sesiones y valores persistidos. | Historial nuevo paginado/cursor; `WorkoutSessionSummary` no es igual al modelo UI actual. |
| Progreso `/progress` | Volumen, récords y mediciones básicas calculados desde SQLite local. | Mover cálculos a `@athlete/domain`; sumar sesiones de fuerza/cardio con unidades y fuente reales. |
| Nutrición `/nutrition` | Estado vacío honesto; no registra comida. | Contracts tiene `NutritionRepository`, pero factory/data aún no lo exponen. |
| Perfil `/profile` | Guarda nombre, unidades y deporte solo local; no hay login. | Migrar a `data.profile`; definir auth y campos del perfil. La preferencia `preferredSport` no coincide uno a uno con `Profile`. |

## 4. Propuesta de experiencia Adaptive Training

La navegación debe evolucionar de “fuerza como producto completo” a una vista integral sin ocultar flujos por disciplina.

1. **Inicio integral:** fecha y estado del día, sesión activa, acceso “Registrar recuperación” y tarjetas de actividades recientes de fuerza/cardio. Mostrar métricas solo si hay datos reales; cada tarjeta indica periodo, unidad y origen.
2. **Check-in rápido (30–45 s):** horas de sueño (incrementos de 15 min o selector), calidad del sueño (1–5 + “prefiero omitir”), energía (1–5), recuperación percibida (1–5). Permitir guardar parcialmente y omitir cualquier respuesta. Requiere contratos nuevos para sueño/recuperación.
3. **Alimentación sencilla:** botón “Registrar comida”, tipo (desayuno/comida/cena/snack), hora y nota breve o descripción; nutrientes permanecen opcionales y nunca se estiman sin fuente. Reutiliza el modelo `MealEntry` cuando `nutrition` forme parte de `createAthleteData`.
4. **Evolución del rendimiento:** vistas por ejercicio y disciplina con cargas/repeticiones, volumen, duración/distancia/ritmo y récords provenientes de datos reales; filtros de fecha claros y estado “aún no hay suficientes registros”. Evitar comparar medidas incompatibles sin unidad o contexto.
5. **Recomendaciones futuras:** reservar un espacio UI marcado como no disponible hasta que exista un modelo validado. Cuando se implemente, cada propuesta debe incluir carga sugerida, incertidumbre/contexto si el modelo la produce, datos considerados, periodo y explicación legible (“se propone porque…”); nunca aplicar cambios automáticamente a una rutina.
6. **Trazabilidad:** separar registros manuales, importados, de dispositivo y estimados (`source`); una predicción futura debe etiquetarse como propuesta generada, con fecha y explicación. No rellenar días faltantes ni mostrar ejemplos como si fueran resultados.

**Bloqueadores de contratos:** sueño, calidad, energía y recuperación no aparecen en los contratos consultados. Comida tiene contrato, pero `createAthleteData` no expone su repositorio y el esquema local oficial no declara esas entidades. Se requiere coordinación con Claude antes de implementar persistencia de estos flujos. No se propone IA ni recomendación automática en esta fase.

## 5. Plan de integración con `createAthleteData`

1. **Alinear artefactos:** acordar cómo incorporar `@athlete/contracts`, `@athlete/domain` y `@athlete/data` a la raíz/workspace consumida por `apps/mobile`, con versiones exactas y Expo/RN soportados. En los worktrees revisados están en repositorios separados y no son dependencias instaladas en Codex.
2. **Cerrar contratos antes del adapter:** revisar `startFromTrainingDay`, RIR de `targetRir`, soporte de nutrición en la factory y operaciones que necesita la UI. No ampliar contratos en esta rama por cuenta propia.
3. **Separar provider de UI:** reemplazar `LocalTrainingProvider` por un provider de `AthleteData` cuyo bootstrap abra Expo SQLite + SecureStore existente, autentique, adapte `fromExpoSqlite`, cree `SupabaseSyncTransport`, llame a `createAthleteData` una vez y exponga únicamente los servicios oficiales. Manejar estados `opening/auth/loading/error/ready`; cerrar la instancia correctamente al desmontar/cambiar cuenta.
4. **Adaptar pantallas:** introducir hooks/casos de uso delgados que conviertan `Result<T>` en estados de carga, vacío, error y éxito; ningún componente importa SQLite/Supabase ni crea repositorios propios. Reemplazar `Routine` por plan+día y modelos de sesión por contratos oficiales; generar IDs con el `IdGenerator` oficial; usar fecha ISO con offset y zona IANA.
5. **Resolver persistencia antigua antes de abrir la factory sobre datos existentes:** no reutilizar `athlete3.db` directamente, renombrar archivo, reescribir claves ni inicializar encima del esquema v1. Leer el plan de migración de la sección 6; solicitar aprobación explícita del propietario antes de mover datos.
6. **Una sincronización:** eliminar del runtime móvil el acceso a `SQLiteTrainingRepository` y sus métodos `markOutbox*`; toda escritura crea una mutación en el outbox oficial. Suscripción de estado de sync, reintentos y conflictos derivan de `data.sync`. No portar ni operar una segunda outbox.
7. **Integrar login/configuración separadamente:** la factory requiere user UUID y transporte. Probar con ambiente de desarrollo configurado y autenticación de prueba; no cambiar Supabase remoto ni exponer credenciales. La base se selecciona por UUID/ambiente conforme al contrato acordado.

## 6. Propuesta de migración local (no ejecutada; requiere aprobación)

La migración no debe comenzar hasta que el propietario apruebe el plan y exista acceso autorizado a la base real que se preservará.

### Preflight y respaldo

1. Con la app cerrada, inventariar en el dispositivo/simulador `athlete3.db`, `athlete3.db-wal`, `athlete3.db-shm`, tamaño, fecha, `user_version`, `sqlite_master`, tablas, columnas, conteos y rangos. Repetir para cada dispositivo que pueda tener datos. El reporte no debe incluir claves ni payloads personales.
2. Verificar apertura con SQLCipher y la clave actualmente resuelta por el nombre SecureStore existente, sin cambiarla. Si la clave falta, no coincide o el archivo no abre, parar: no generar otra clave ni llamar a `createAthleteData`.
3. Hacer una copia cifrada verificable de la base y sidecars con la app cerrada (o mecanismo de backup SQLite/SQLCipher consistente). Conservar el original inmutable. Validar que la copia abre con la misma clave, registra integridad y conteos iguales. Resguardar SecureStore a través del mecanismo de plataforma acordado; nunca exportar la clave al informe.

### Mapeo a revisar con el dueño

- Rutina → `TrainingPlan` + `TrainingDay` + `TrainingDayExercise`; `sets_target` → `target_sets`; reps exactas → min=max; descanso conserva segundos.
- Sesión `active/completed` → `in_progress/completed`; `deleted`/tombstone → borrado lógico. Revisar sesión incompleta y timestamps/zone al derivar `local_date`.
- `is_warmup` → `set_type`; `set_index` → `position`; `rir` entero/`null` se preserva numéricamente; no convertir cero a `null`. Peso/reps fuera de rango nuevo se reportan y aíslan, nunca se recortan silenciosamente.
- Mantener IDs UUID válidos de los registros de usuario si no colisionan. Los IDs semilla `sample-*` no son UUID y no pueden insertarse como catálogo oficial: resolver por catálogo/slugs con una tabla de correspondencia aprobada; ejercicios sin coincidencia se preservan en origen y se reportan para revisión.
- El propietario anónimo `device:<uuid>` no equivale a `user_id`. Solo importar al usuario autenticado elegido explícitamente por el dueño.
- No copiar `sync_outbox` como cola activa. Traducir el estado final de los registros a mutaciones oficiales por medio de `createAthleteData`/repositorios para que exista una sola cola. Mantener en el respaldo original IDs/estados de la outbox anterior para auditoría; no afirmar que registros `acked` antiguos estén sincronizados con el servidor.
- Preferencias de deporte y medidas se transforman solo con mapeo/unidades aprobados. Las preferencias sin correspondencia se conservan en el archivo original hasta decisión.

### Ejecución reversible propuesta

La fuente permanece intacta. Crear una **base destino separada** con nombre oficial por usuario/ambiente; no abrir el destino sobre `athlete3.db`. El API público actual no expone importación masiva ni una transacción que abarque este mapeo; no se debe resolver escribiendo SQL desde la app. Claude debe proporcionar en `@athlete/data` un importador versionado, idempotente y transaccional (expuesto por la fachada oficial o API pública de migración), con ledger de IDs origen/destino, conteos y checksums no sensibles. Por cada grupo (planes, sesiones/series, medidas) verificar conteos, relaciones, nulls, RIR, tiempos y lecturas vía repositorios oficiales. Un fallo hace rollback del lote destino y deja original y backup disponibles.

El cambio de la app al destino se hace solo después de todas las verificaciones. El rollback consiste en volver a seleccionar el archivo original sin borrarlo; la base oficial creada se conserva para investigar o se descarta solo tras aprobación separada. En bases SQLite distintas no existe una transacción atómica común: la garantía es transacción por lote en destino + fuente inmutable + ledger idempotente + conmutación reversible, no una falsa atomicidad entre dos archivos.

## 7. Pruebas y criterios de aceptación

### Antes de habilitar la integración

- Contratos coordinados y misma versión de `@athlete/contracts` en app y backend; RIR de series y objetivos permite exactamente 0–10 en pasos de 0.5 y `null`; `0` no se confunde con `null`.
- El build importa únicamente `createAthleteData`/servicios públicos para datos; cero imports de `expo-sqlite` desde repositorios/componentes, cero SQL en pantallas y una sola outbox.
- Pruebas de unidad para mapeo plan↔rutina, series, estados, Result/error codes, IDs y tratamiento de `null`; pruebas de componentes/navegación para loading/empty/error/success y registro durante sesión.
- Ciclo de entrenamiento contra `packages/data`: plan → sesión → serie con RIR `0`, `0.5`, `1`, `10`, `null` → completar → historial → cerrar/reabrir la misma base y verificar detalle, plan y outbox.
- Pruebas offline/retry/idempotencia, conflicto y resolución, pull de otro dispositivo; no se acepta una pantalla que indique sincronizado antes de ack servidor.
- Migración con fixtures de cada versión/esquema fuente y base vacía/no vacía, interrupción en cada fase, doble ejecución idempotente, IDs no-UUID, entidades huérfanas y rangos no compatibles. Verificar que fallos no alteran original ni backup y que restauración abre con SQLCipher.
- iOS Simulator: build de Expo SDK 58, adaptador Expo SQLite de Claude, SecureStore existente, SQLCipher, autenticación de prueba, sesión offline, cierre completo de app, relanzamiento, sincronización, historial y rollback al archivo original.

### Criterios de release

1. Una única capa oficial de persistencia y una única cola.
2. Crear/consultar planes y registrar/finalizar/consultar sesiones usando contratos compartidos.
3. Datos y outbox sobreviven cierre/reapertura nativa en iOS Simulator con SQLCipher/SecureStore.
4. Contratos y rangos iguales en app/data/backend; `RIR` UI admite pasos de 0.5 y diferencia `0`/`null`.
5. Migración solo con aprobación; fuente intacta, backup restaurable, validaciones completas y error que detiene la conmutación.
6. Nutrición, sueño y recuperación no muestran formularios funcionales hasta existir repositorios/contratos expuestos por la factory.
7. Ningún dato ficticio, predicción o recomendación presentado como resultado real.

## 8. Estado de esta revisión

Se revisaron en modo lectura los archivos fuente de los dos worktrees y la guía/informe de backend del 4 de noviembre. No se ejecutaron pruebas, no se abrió o modificó ninguna base, no se leyeron valores de SecureStore, no hubo llamadas a Supabase, y no se cambiaron archivos del backend. El trabajo de código móvil debe empezar después de revisar esta propuesta; la migración de datos necesita aprobación explícita posterior del propietario.
