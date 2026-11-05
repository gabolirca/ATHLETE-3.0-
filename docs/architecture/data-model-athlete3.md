# Modelo de datos implementado — esquema `athlete3` (v1, local)

**Estado:** Implementado en migraciones locales y probado. No desplegado.
**Autor:** Claude · **Fecha:** 3 de noviembre de 2026
**Desarrolla:** `docs/architecture/data-model.md` (propuesta inicial). Desviaciones justificadas en §5.

## 1. Esquemas

- `athlete3`: tablas y RPC que consume la app (expuesto en Data API).
- `athlete3_private`: helpers, secuencia de cambios, roles, mutaciones aplicadas y límites de frecuencia (no expuesto).
- Nada en `public`. Ningún trigger sobre `auth.users`.

## 2. Columnas comunes de toda tabla sincronizable

| Columna | Tipo | Regla |
|---|---|---|
| `id` | uuid PK | Generado por el cliente (UUIDv7). Inmutable |
| `user_id` | uuid → `auth.users` ON DELETE CASCADE | `auth.uid()` asignado por trigger. Inmutable |
| `created_at`, `updated_at` | timestamptz | Servidor |
| `deleted_at` | timestamptz | Tombstone definitivo |
| `revision` | bigint | 1 al crear, +1 por cambio. UPDATE exige la revisión actual |
| `change_seq` | bigint | Secuencia global; cursor de pull. Índice `(user_id, change_seq)` |
| `last_mutation_id` | uuid | Mutación de sync que produjo el cambio |

Todas las tablas: RLS forzado; políticas select/insert/update por propietario; sin DELETE.

## 3. Tablas

| Tabla | Propósito | Relaciones | Restricciones clave |
|---|---|---|---|
| `profiles` | Perfil y preferencias (`id = user_id = auth.uid()`) | 1:1 `auth.users` | estatura 50–272 cm, peso 20–400 kg, nivel enum, ≤ 10 objetivos de ≤ 200 car., zona IANA válida, `unit_system`, `load_unit`, `week_starts_on` 0–6; no eliminable |
| `muscle_groups`, `equipment` | Catálogo global | — | slug único; solo lectura |
| `exercises` | Global (`user_id` null, slug) o personalizado | arrays de grupos/equipamiento validados por trigger | slug solo en globales; modalidad y tipo de carga enum; archivado con `archived_at` |
| `training_plans` | Programa | — | fechas inicio ≤ fin; estado draft/active/archived |
| `training_days` | Día del programa (entrenamiento/descanso) | FK compuesta → plan | posición 0–1000 |
| `training_day_exercises` | Objetivos planificados | FK compuesta → día; FK → ejercicio visible | reps mín ≤ máx; RIR 0–10 en pasos de 0.5 |
| `workout_sessions` | Sesión de fuerza ejecutada | FK compuesta opcional → día planificado | `local_date = (started_at AT TIME ZONE time_zone)::date`; fin ≥ inicio; completada ⇒ fin; transiciones `in_progress → completed/discarded`; **una en curso por usuario** (índice único parcial) |
| `session_exercises` | Ejercicio dentro de la sesión | FK compuesta → sesión; FK → ejercicio visible | sin contenido nuevo si la sesión está descartada |
| `strength_sets` | Serie | FK compuesta → ejercicio de sesión | peso 0–1000 kg, reps 0–1000, RIR 0–10 y RPE 1–10 en pasos de 0.5, warmup/working |
| `cardio_sessions` | Cardio (carrera, caminata, natación, bici, remo, circuito, híbrido) | FK compuesta opcional → día | duración 1–86 400 s, distancia > 0, FC 25–250 y media ≤ máxima, detalles de natación solo en natación; ritmo no almacenado |
| `body_weights` | Peso corporal | — | 20–400 kg; unidad de entrada kg/lb; procedencia |
| `body_measurements` | Medidas corporales | — | sitio enum; 0–300 cm; unidad de entrada cm/in |
| `athlete3_private.user_roles` | Roles administrativos | → `auth.users` | Solo servidor |
| `athlete3_private.sync_mutations` | Idempotencia (mutaciones aplicadas) | → `auth.users` | PK `mutation_id` |
| `athlete3_private.rate_limit_buckets` | Límite por usuario y operación | → `auth.users` | Solo vía función |

Cascada de tombstones (servidor y cliente): plan → días → ejercicios del día; sesión → ejercicios → series.

## 4. RPC expuestas (`authenticated`)

| Función | Uso |
|---|---|
| `athlete3.sync_push(p_device_id uuid, p_mutations jsonb)` | Aplica ≤ 100 mutaciones; resultado por mutación: `applied`/`duplicate`/`conflict`/`rejected` |
| `athlete3.sync_pull(p_cursor text, p_limit int)` | Cambios propios con `change_seq > cursor`, incluye tombstones |
| `athlete3.catalog_snapshot()` | Catálogo global para uso sin conexión |
| `athlete3.ensure_profile(p_time_zone, p_display_name)` | Inicialización idempotente del perfil (alternativa online) |
| `athlete3.current_user_is_admin()` | Consulta del propio rol |

## 5. Desviaciones respecto a `data-model.md`

| Propuesta | Implementado | Motivo |
|---|---|---|
| `sets` | `strength_sets` | Separar explícitamente fuerza de cardio (especificación §6.5) |
| `swim_sessions` | Columnas `swim_*` en `cardio_sessions` | Una natación es una sesión cardio más unos pocos campos; evita una tabla 1:1 |
| `memberships` | `athlete3_private.user_roles` | Roles no modificables por el usuario; membresías multiusuario fuera del MVP |
| `sync_state`, `sync_operations` | `athlete3_private.sync_mutations` + estado en SQLite | El cursor es por dispositivo y vive en el cliente |
| `nutrition_days`, `meal_entries`, `daily_checkins`, `recommendations`, `model_versions` | No implementadas | Fuera del alcance pedido en esta fase; contratos de nutrición existen |

## 6. Réplica local (SQLite)

Mismas tablas y columnas (snake_case) + `outbox`, `sync_state`, `muscle_groups`, `equipment`. Versionado con
`PRAGMA user_version`. Una prueba de integración verifica que las columnas escribibles locales coinciden exactamente
con `athlete3_private.sync_writable_columns` del servidor.
