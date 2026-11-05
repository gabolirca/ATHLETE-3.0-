# ADR-0003 — Contratos, dominio, persistencia local y sincronización

**Estado:** Propuesta (pendiente de revisión por Codex y aprobación del propietario)
**Fecha:** 3 de noviembre de 2026
**Autor:** Claude
**Relacionado:** ADR-0001, ADR-0002, `docs/architecture/data-model.md`, `docs/architecture/schema-isolation.md`, `docs/contracts/README.md`

> Esta ADR no autoriza migraciones, despliegues ni cambios en ningún proyecto Supabase.
> Describe cómo se conectarán los paquetes locales con SQLite y, en el futuro, con Supabase.

## 1. Contexto

La especificación exige una app local-first (§9): sesiones offline, autoguardado, recuperación de
sesiones incompletas, sincronización idempotente, tombstones y conflictos explícitos. `data-model.md §2`
pide documentar en una ADR técnica la generación de UUID y el versionado de registros.

## 2. Decisión propuesta

### 2.1 Capas y dependencias

```
apps/mobile (Codex)          pantallas, hooks, TanStack Query, Zustand
        │  consume interfaces
        ▼
packages/contracts           Zod + tipos + errores + puertos (interfaces de repositorio y sync)
        ▲            ▲
        │            │ implementa
packages/domain      packages/data (futuro, Claude)
lógica pura          ├─ sqlite/    repositorios sobre expo-sqlite + outbox
                     ├─ sync/      motor de sincronización (push/pull) independiente de la UI
                     └─ supabase/  SyncTransport + tipos generados de `athlete3`
```

- `domain` depende solo de `contracts`. Sin React Native, Supabase, SQLite ni reloj/aleatoriedad
  implícitos (el reloj y los ids se inyectan con los puertos `Clock` e `IdGenerator`).
- `data` depende de `contracts` y `domain`. Es el único paquete que conoce nombres de tablas.
- La UI nunca toca SQLite ni Supabase: usa los repositorios de `contracts/src/repositories.ts`.
- Los tipos generados por `supabase gen types` vivirán en `packages/data/src/supabase/` (ver §5, punto 1).

### 2.2 Identificadores

- UUID generados **en el cliente** para todo registro sincronizable, de modo que se puedan crear offline
  y que el reintento de una creación sea idempotente.
- Propuesta: **UUIDv7** (ordenable por tiempo → mejor localidad en índices B-tree de Postgres y SQLite).
  Postgres no lo exige: la columna es `uuid` y acepta cualquier versión. Los contratos validan UUID genérico.
- Catálogos globales (ejercicios, grupos musculares, equipamiento) usan UUID fijos + `slug` estable,
  sembrados por migración.

### 2.3 Versionado de registros

Cada tabla sincronizable de `athlete3` llevará:

| Columna | Tipo | Quién la escribe | Propósito |
|---|---|---|---|
| `id` | `uuid` PK | cliente | identidad estable |
| `user_id` | `uuid` not null → `auth.users` | servidor (`auth.uid()`) | propiedad y RLS |
| `created_at`, `updated_at` | `timestamptz` | servidor | auditoría |
| `deleted_at` | `timestamptz` null | servidor al aplicar `delete` | tombstone |
| `revision` | `bigint` not null | servidor (+1 por mutación aplicada) | detección de conflictos |
| `change_seq` | `bigint` not null | servidor (secuencia en `athlete3_private`) | cursor de pull |
| `last_mutation_id` | `uuid` null | servidor | reconocer ecos propios |

Índice `(user_id, change_seq)` en cada tabla sincronizable.

En SQLite se replican las columnas de negocio con los mismos nombres `snake_case`, más `revision`
(la última conocida del servidor; null si nunca sincronizó). El mapeo `camelCase ↔ snake_case` se hace
en `packages/data`, y cada fila leída se valida con el esquema Zod antes de salir del repositorio.

### 2.4 Escrituras locales (autoguardado)

1. El repositorio valida la entrada (`parseInput`) y las reglas de dominio (`assertTransition`,
   `validateSessionTimes`, `assertCanStart`…).
2. En **una sola transacción SQLite** escribe la fila y añade una `SyncMutation` a la tabla `outbox`.
3. Devuelve el resultado sin esperar la red. Una sesión en curso sobrevive al cierre de la app
   porque cada serie ya está en SQLite (`WorkoutSessionRepository.getActive`).

### 2.5 Push (idempotente)

- La outbox se envía en orden FIFO (respeta padre → hijo: sesión → ejercicio → serie), en lotes de ≤ 100.
- Servidor, por mutación y dentro de una transacción:
  1. Si `mutation_id` ya figura en `athlete3.sync_mutations` → devuelve el resultado guardado (`duplicate`).
  2. Si `isConflict(baseRevision, revisionActual)` → `conflict` con el registro del servidor.
  3. Si no, valida el payload, aplica, incrementa `revision`, asigna `change_seq`, registra la mutación → `applied`.
  4. Validación o autorización fallida → `rejected` con `AppError` seguro.
- Cliente: `outboxActionFor(result)` decide `acknowledge` / `conflict` / `reject`. Fallos de red →
  reintento con `retryDelayMs` (exponencial con tope de 5 min).
- **Transporte recomendado:** función RPC de Postgres `athlete3.sync_push(jsonb)` con `SECURITY INVOKER`,
  de modo que RLS siga aplicando y todo el lote sea transaccional. Edge Function solo si se necesita
  lógica que no deba vivir en SQL. Pendiente de aprobación (§5, punto 3).

### 2.6 Pull (incremental, nunca destructivo)

- `sync_pull(cursor, limit)` devuelve cambios con `change_seq > cursor` del usuario autenticado, ordenados.
- El cliente aplica cada cambio con `decideRemoteApply`:
  - con mutaciones locales pendientes para ese registro → `defer_pending` (no se toca);
  - revisión remota ≤ local → `skip_stale` (incluye los ecos de las propias mutaciones);
  - tombstone → `apply_tombstone` (se guarda aunque el registro no exista localmente);
  - resto → `apply`.
- Nunca se reemplaza la base local completa con una descarga (especificación §9).
- **Riesgo conocido a resolver antes de implementar:** con una secuencia simple, una transacción que
  obtuvo un `change_seq` menor puede confirmarse después de que un pull haya leído uno mayor, y ese cambio
  se perdería para el cursor. Opciones: leer solo hasta `pg_snapshot_xmin(pg_current_snapshot())`
  usando `xid8` por fila, o una ventana de seguridad. Se decidirá en la ADR de implementación del servidor.

### 2.7 Conflictos

- Detección por revisión de registro completo (no hay "último en escribir gana" silencioso).
- Resolución explícita (`ConflictResolution`): `keep_local` reenvía con nuevo `mutationId` y
  `baseRevision = serverRevision`; `keep_remote` adopta el registro del servidor.
- Para un MVP de un solo atleta los conflictos serán raros (dos dispositivos editando la misma serie).
  La fusión por campo queda fuera del MVP.

### 2.8 Borrados

- El cliente nunca borra físicamente: `op = 'delete'` → `deleted_at` en servidor y en local.
- Borrar una sesión genera tombstones para sus ejercicios y series en la misma transacción local.
- Ejercicios con historial se archivan (`archived_at`), no se borran.
- La purga física de tombstones antiguos requiere una política aprobada (retención y dispositivos inactivos).

### 2.9 Fechas

- Se guarda el instante real (`started_at`, `timestamptz`) **y** la zona horaria de la sesión.
- `local_date` lo calcula el cliente con `localDateOf(instant, timeZone)` y se almacena.
- El servidor deberá validar `local_date = (started_at AT TIME ZONE time_zone)::date`; una prueba de
  paridad comprobará que coincide con `domain/time.ts` (data-model §6: los cálculos deben coincidir).

### 2.10 Unidades

- Cargas en kg, distancias en metros, duraciones en segundos, medidas en cm.
- Peso y medidas corporales guardan además la unidad de entrada (`input_unit`), como pide §6.6.
- Ritmo, velocidad, volumen, e1RM y récords **no se almacenan**: se derivan en `domain`. Si en el futuro
  se materializan en Postgres, deberán probarse contra las mismas funciones.

### 2.11 Supabase (futuro, sin ejecutar)

- Esquemas `athlete3` (expuesto en Data API) y `athlete3_private` (no expuesto), según `schema-isolation.md`.
- RLS en todas las tablas personales; políticas por operación con `user_id = (select auth.uid())`.
- `anon` sin acceso a datos personales; `service_role` nunca en el cliente.
- Perfil: función idempotente de inicialización invocada por la app tras iniciar sesión; sin triggers sobre `auth.users`.
- Nada de esto se implementa hasta confirmar documentalmente el proyecto destino y reconciliar su historial de migraciones.

## 3. Alternativas consideradas

| Alternativa | Motivo para no elegirla ahora |
|---|---|
| Last-write-wins por `updated_at` | Pierde datos en silencio y depende de relojes de dispositivo. Contradice §9. |
| PowerSync / ElectricSQL / WatermelonDB sync | Añaden servicio o dependencia mayor; pueden reevaluarse si el motor propio resulta costoso. |
| IDs `bigserial` del servidor | Impiden crear registros offline sin mapeo de ids temporales. |
| Escritura directa desde la UI a Supabase con RLS | Rompe local-first y el requisito de repositorios (ADR-0002 §2). |
| Paquete `packages/validation` separado | Duplicaría los esquemas Zod que ADR-0002 §6 ya ubica en `contracts`. |

## 4. Consecuencias

- La app funciona íntegramente sin red; la sincronización es un proceso de fondo.
- Hay que mantener dos esquemas físicos (SQLite y Postgres) alineados: lo cubrirán pruebas de contrato
  en `packages/data` que validen filas de ambos lados con los mismos esquemas Zod.
- El servidor necesita una tabla de mutaciones aplicadas con política de retención.

## 5. Cuestiones abiertas (requieren decisión)

1. Ubicación de los tipos generados de Supabase: `docs/contracts/README.md §4` los menciona en contratos
   y el diagnóstico de Codex propone `packages/contracts/src/database.types.ts`. Esta ADR propone
   `packages/data` para que la app no dependa de nombres de tablas (`docs/contracts/README.md §1`).
2. Forma del contrato de sesión: el diagnóstico de Codex propone `CreateSessionInput` con ejercicios y
   series anidados en una sola llamada; esta propuesta usa operaciones incrementales (iniciar, añadir
   ejercicio, registrar serie, completar) porque el autoguardado serie a serie lo exige.
3. Transporte de sync: RPC `SECURITY INVOKER` (recomendado) o Edge Function.
4. Solución al hueco de cursores de §2.6.
5. ¿Se adopta UUIDv7?
6. Inicio de semana (lunes por defecto, configurable) y fórmula de e1RM (Epley por defecto; Brzycki disponible).

## 6. Actualización — 3 de noviembre de 2026 (implementación local)

El propietario declaró obligatoria la arquitectura offline-first (SQLite operativo, outbox, idempotencia,
versiones, tombstones, conflictos explícitos). Esta ADR se implementó en local con las siguientes concreciones:

- §5.3 Transporte: **RPC `SECURITY INVOKER`** (`athlete3.sync_push`, `athlete3.sync_pull`, `athlete3.catalog_snapshot`).
- §5.4 Hueco de cursores: resuelto con un **bloqueo consultivo por usuario** (`pg_advisory_xact_lock`) tomado por
  `sync_push` y por el trigger común en toda escritura. Por usuario, el orden de `change_seq` coincide con el de
  commit, y el pull solo lee filas del propio usuario.
- §5.5 UUIDv7: implementado en `createUuidV7Generator` (aleatoriedad inyectada).
- Bloqueo optimista también para escrituras directas (UPDATE sin la revisión actual → `CONFLICT`).
- La outbox fusiona ediciones aún no enviadas, envía como máximo una mutación por registro y lote, y re-basa las
  siguientes con la revisión confirmada. Las mutaciones "en vuelo" al cerrar la app se reintentan (el servidor
  responde `duplicate` si ya se aplicaron).
- Detalle del esquema en `docs/architecture/data-model-athlete3.md`; seguridad en `docs/architecture/security.md`.
