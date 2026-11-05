# Informe — Backend funcional, offline-first y seguridad

**Agente:** Claude · **Fecha:** 3 de noviembre de 2026
**Rama:** `claude/backend-foundation` (worktree `~/GYM/ATHLETE-CLAUDE`) · **Base:** `22503f3`
**Informe previo:** `2026-11-03-backend-foundation-claude.md` (no se sobrescribe)

> Nada se aplicó a ningún proyecto remoto. Sin `db push`, sin cambios de Auth/RLS remotos, sin datos de
> Diario Gym v2, sin tocar EasyTeacher ni `apps/mobile/`. Todas las pruebas de base de datos se ejecutaron contra
> un Postgres 16 **local** y desechable (127.0.0.1:54329).

## 1. Diagnóstico de lo existente (antes de esta fase)

| Componente | Estado encontrado |
|---|---|
| `packages/contracts` 0.1.0 | Esquemas Zod por dominio, errores, sync, interfaces de repositorio. Sin auth |
| `packages/domain` | Lógica pura probada (volumen, e1RM, récords, fechas locales, reglas de sesión y sync) |
| `supabase/` | **No existía**: sin migraciones, RLS, RPC ni pruebas de base de datos |
| Persistencia local / sync | Solo diseñada (ADR-0003); sin implementación |
| Auth | Sin contrato ni implementación |
| Ambientes | Sin separación ni validación |
| Rama de Codex (`codex/mobile-foundation`, sin commits; leída solo como referencia) | App Expo SDK 54 con pantallas de demostración. **Crea su propio `package.json` raíz (`workspaces: ["apps/mobile"]`), `.gitignore` y `package-lock.json`**, que chocarán con los de esta rama (ver §8) |
| Herramientas | Supabase CLI 2.122 sin Docker (no hay `supabase start`); PostgreSQL 16 disponible; Node 22 con `node:sqlite` |

## 2. Matriz de funcionalidades

Leyenda: ✅ implementado y probado · 🟡 parcial · ⏳ pendiente · ⚠️ riesgo

| Área | Funcionalidad | Estado | Evidencia / nota |
|---|---|---|---|
| Identidad | Modelo de perfil (deporte y preferencias) | ✅ | `profiles`; `LocalProfileRepository`; pruebas db + data |
| | Registro / inicio / cierre de sesión | 🟡 | `SupabaseAuthService` probado con dobles del cliente; **no** probado contra GoTrue real (requiere Docker) |
| | Recuperación de contraseña | 🟡 | Igual que arriba; sin enumeración y con límite local |
| | Sesiones y expiración | 🟡 | Renovación, offline con token vencido y revocación probadas con dobles; expiración de JWT en PostgREST no ejecutada |
| | Validación de identidad y propiedad | ✅ | `auth.uid()` + trigger + RLS + FK compuestas; 25 pruebas de aislamiento/línea base |
| | Roles administrativos no autoasignables | ✅ | `athlete3_private.user_roles`; pruebas negativas |
| Entrenamiento | Catálogo de ejercicios y grupos musculares | ✅ | Semilla global (12 grupos, 8 equipos, 12 ejercicios), personalizados, uso offline |
| | Rutinas/programas, días, ejercicios con objetivos | ✅ | Tablas + repositorio local + sync entre dispositivos |
| | Sesiones, estado y duración | ✅ | Transiciones, una en curso, fecha local por zona |
| | Series, repeticiones, peso, RIR/RPE | ✅ | Validación en cliente y servidor (pasos de 0.5) |
| | Historial | ✅ | Paginado local; consulta servidor con RLS |
| Cardio | Modalidad, distancia, duración, FC, natación | ✅ | Reglas cruzadas en ambos lados |
| | Ritmo | ✅ | Derivado en `domain` (no almacenado) |
| Progreso | Peso corporal y medidas con unidad de entrada | ✅ | lb/in normalizados a kg/cm |
| | Récords personales y estadísticas básicas | ✅ | `domain` (records, analytics) sobre `listSetsForExercise`; sin vista de servidor |
| Sync | UUID del cliente (v7) | ✅ | `createUuidV7Generator` |
| | Outbox persistente, idempotencia, versiones, tombstones | ✅ | Pruebas db + unitarias + aceptación |
| | Conflictos explícitos (keep_local/keep_remote) | ✅ | Unitarias + integración entre dos dispositivos |
| | Incremental; nunca sobrescribir con datos viejos | ✅ | Cursor por `change_seq`; `defer_pending`; bloqueo optimista |
| | Consistencia multi-dispositivo | ✅ | Integración: sesión, conflicto, borrado, todas las entidades |
| Seguridad | RLS forzado, sin DELETE, anon sin acceso | ✅ | Migración 0900 falla si se incumple + pruebas |
| | Límites de frecuencia | 🟡 | Por usuario en RPC ✅; Auth vía `config.toml` (solo local); sin límite por IP en RPC |
| | Datos locales protegidos | 🟡 ⚠️ | Una base por usuario/ambiente y adaptador SQLCipher listos; **cifrado aún no activado en la app** |
| | Sin secretos en cliente / logs | ✅ | `assertPublicKey`, `loadEnvironment`, `redact` + pruebas |
| Ambientes | Local/dev/testing/prod separados | 🟡 | Validación + plantillas + ADR-0004 ✅; proyectos dev/testing no creados; prod bloqueada |
| Nutrición | Tablas y repositorio | ⏳ | Fuera del alcance de esta fase (contratos existen) |
| Fotos corporales | Storage privado | ⏳ | Fuera del alcance |

## 3. Orden de implementación seguido

1. Migraciones locales: fundación y privilegios → identidad → catálogo → entrenamiento → cardio/cuerpo → sync →
   RPC de catálogo → cierre y verificación de privilegios (0900).
2. Arnés local (stub de `auth` para Postgres sin Supabase) y 69 pruebas de base de datos, validadas con sabotaje.
3. Contratos 0.2.0 (auth, catálogo offline, preferencias).
4. `packages/data`: SQLite, outbox, motor de sync, repositorios, adaptadores Supabase, ambientes.
5. Pruebas unitarias (58) y de integración extremo a extremo (6).
6. Documentación.

## 4. Entregables

| # | Entregable | Ubicación |
|---|---|---|
| 1 | Diagnóstico actualizado | este informe §1–2 |
| 2 | Modelo de datos | `docs/architecture/data-model-athlete3.md` |
| 3 | Contratos para el frontend | `packages/contracts` 0.2.0 + `docs/contracts/frontend-guide.md` |
| 4 | Migraciones SQL locales | `supabase/migrations/20261104000100…000900_*.sql` (8 archivos) |
| 5 | Políticas RLS | en las migraciones (0200–0600); resumen en `docs/architecture/security.md` §2 |
| 6 | Implementación backend | RPC en SQL + `packages/data` |
| 7 | Pruebas automatizadas | `supabase/tests/db`, `packages/*/test` — **193 pruebas** |
| 8 | Informe de seguridad | `docs/architecture/security.md` |
| 9 | Ejecutar pruebas localmente | `docs/architecture/testing.md` |
| 10 | Pendientes y riesgos | este informe §7 |
| — | Ambientes | `docs/decisions/0004-ambientes.md`, `docs/architecture/environments.md`, `config/environments/*.env.example`, `supabase/config.toml` (local) |

## 5. Pruebas realizadas (resultados reales)

```
npm run typecheck                         → 0 errores (contracts, domain, data, supabase-tests)
npm test                                  → contracts 14 ✓ · domain 46 ✓ · data 58 ✓
npm run test:db (Postgres 16 local)       → supabase 69 ✓ · data integración 6 ✓
```

Criterio de aceptación offline-first (`packages/data/test/integration/acceptance.test.ts`), ejecutado de punta a punta:
1. Sesión creada sin red ✓ · 2. guardada en SQLite (verificado en el archivo) ✓ · 3. recuperada tras cerrar y reabrir
la base ✓ · 4. sincronizada al volver la red ✓ · 5. visible en un segundo dispositivo del mismo usuario (e invisible
para otro usuario) ✓ · 6. sin duplicados tras perder la respuesta del primer push y reintentar dos veces ✓
(servidor: 1 sesión, 1 ejercicio, 3 series).

Verificación de que las pruebas detectan fallos (sabotaje deliberado y revertido):
- Política de lectura de `strength_sets` abierta (`using (true)`) → falla la prueba de aislamiento.
- Trigger común sin bloqueo optimista ni tombstones → fallan 3 pruebas de sync.
- Desactivar la protección de cambios pendientes en el pull → falla la prueba correspondiente
  (esa prueba inicialmente **no** lo detectaba: el push fallido impedía llegar al pull; se corrigió).
- Desactivar la fusión de la outbox → falla la prueba de coalescencia.

## 6. Problemas encontrados

1. **Sin Docker**: no se pudo usar `supabase start`. Se creó un stub mínimo de `auth` (roles, `auth.users`,
   `auth.uid()` con la misma semántica de claims) **solo para pruebas**; no se aplica a Supabase.
2. **`ALTER DEFAULT PRIVILEGES … IN SCHEMA` no puede revocar el EXECUTE de PUBLIC** en funciones y revocarlo
   globalmente afectaría a otros esquemas del proyecto compartido. Solución: revocación explícita + verificación
   bloqueante en la migración 0900. Toda migración futura debe repetirla.
3. Socket Unix demasiado largo en el scratchpad → Postgres de pruebas solo por TCP.
4. Error en una prueba propia: `(f()).*` en Postgres ejecuta la función una vez por columna y agotaba el límite de
   frecuencia. Corregido en la prueba (`select * from f()`).
5. Dos expectativas de integración mal calculadas por mí (número de mutaciones y revisión); el comportamiento era el
   correcto y documentado.
6. Postgres local es 16; `supabase/config.toml` declara 17 (valor por defecto del CLI). No se usan funciones
   específicas de versión, pero conviene ejecutar la suite en 17 con `supabase start`.

## 7. Pendientes y riesgos

| # | Pendiente / riesgo | Prioridad | Responsable |
|---|---|---|---|
| 1 | Ejecutar todas las suites contra `supabase start` (Postgres 17 + PostgREST + GoTrue reales) | Alta | Claude (requiere Docker) |
| 2 | Pruebas de Auth reales: registro, confirmación, login, expiración de JWT en PostgREST | Alta | Claude |
| 3 | Activar SQLCipher (config plugin `useSQLCipher`) y clave aleatoria en SecureStore | Alta | Codex + Claude |
| 4 | Implementar `SecureKeyValueStorage` (SecureStore / LargeSecureStore) y `AppState` → autoRefresh | Alta | Codex |
| 5 | Resolver conflicto de archivos raíz entre ramas (§8) | Alta | Ambos |
| 6 | Revisión de contratos 0.2.0 por Codex | Alta | Codex |
| 7 | Confirmar proyectos por ambiente; producción sigue bloqueada | Alta | Propietario |
| 8 | Reconciliar historial de migraciones del proyecto remoto antes de cualquier despliegue | Alta | Claude + aprobación |
| 9 | Política de retención de `sync_mutations` y `rate_limit_buckets` | Media | Claude |
| 10 | Límite por IP en RPC / CAPTCHA en Auth / MFA | Media | Propietario decide |
| 11 | Nutrición y fotos corporales (Storage privado) | Media | Siguiente fase |
| 12 | Purga de tombstones y dispositivos inactivos | Baja | Claude |
| 13 | Lint/format y CI (ADR-0002 §9) | Media | Ambos |
| 14 | Las posiciones (`position`) no son únicas por padre (reordenar crea duplicados transitorios); se ordena por `(position, id)` | Baja | — |

## 8. Coordinación con Codex (archivos compartidos)

Ambas ramas crean archivos raíz con el mismo nombre. **No se modificó nada de la rama de Codex.** Propuesta de
fusión para acordar antes del merge:

- `package.json`: `workspaces: ["apps/*", "packages/*", "supabase/tests"]`; conservar `dependencies`/`overrides` de
  React 19.1.0 de Codex y los scripts de ambos (`mobile`, `ios`, `android`, `typecheck`, `test`, `test:db`).
  TypeScript `~5.9` coincide con Expo SDK 54.
- `.gitignore`: unión de ambos; **mantener** las reglas `.env` / `.env.*` de esta rama (la de Codex no ignora `.env`).
- `package-lock.json`: regenerar tras fusionar `package.json`.
- La app debe depender de `@athlete/contracts`, `@athlete/domain` y `@athlete/data` (workspace `*`).
- `@athlete/data` importa `node:sqlite` solo desde la subruta `@athlete/data/node-sqlite`, para que Metro no lo empaquete.
