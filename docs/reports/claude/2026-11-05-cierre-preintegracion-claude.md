# Informe — Cierre previo a la integración conjunta

**Agente:** Claude · **Fecha:** 5 de noviembre de 2026 · **Rama:** `claude/backend-foundation` (`~/GYM/ATHLETE-CLAUDE`)
**Informes previos (no se sobrescriben):** `2026-11-05-integracion-implementacion-claude.md` y anteriores.

> Sin push ni merge. No se creó `integration/mobile-backend`. No se tocó Supabase remoto, la rama ni los archivos de
> Codex (solo lectura), `main` ni Diario Gym. No se ejecutó ninguna migración sobre la base del simulador. No se
> borraron archivos, bases ni claves del proyecto. Los commits fueron autorizados explícitamente en esta fase.

## 1. Puntos solicitados

| # | Punto | Resultado |
|---|---|---|
| 1 | `CONTRACTS_VERSION` = 0.3.0 | ✅ `packages/contracts/src/index.ts` = `'0.3.0'`. También el README del paquete y la cabecera de `frontend-guide.md`. **Nueva prueba**: falla si la constante difiere de `package.json` (comprobado poniendo `'0.2.0'`: falla; restaurado: pasa). Codex lo había señalado en su informe del 5-nov |
| 2 | Guía de integración = API implementada | ✅ con evidencia. Se corrigieron 4 desajustes de texto (§2). Los fragmentos se compilan contra la API real y los tipos reales de Expo SDK 58: sin errores con TS 5.9.3 y 6.0.3; un fragmento alterado a propósito falla |
| 3 | TypeScript unificado | ✅ en esta rama: `~6.0.3` (la que fija Expo SDK 58 en `apps/mobile`). Requirió declarar `types: ["node"]` y `lib: DOM` en `contracts` y `domain`, porque TS 6 ya no incluye `@types/*` por defecto. Los 4 workspaces compilan con 5.9.3 y con 6.0.3. **Coordinación:** la raíz de Codex tiene `typescript ~5.9.0`; la propuesta de raíz común usa `~6.0.3` (`docs/contracts/coordinacion-integracion-mobile-backend.md` §3.1) |
| 4 | Las 10 pruebas de integración | ✅ §3: entorno, comandos, base, resultados y reproducción con un comando nuevo (`local-postgres.sh`) |
| 5 | Real frente a simulado frente a nativo | ✅ §4 y `docs/architecture/testing.md` §5 |
| 6 | Estado de Git documentado | ✅ §5 |
| 7 | Commits limitados al trabajo de Claude | ✅ 6 commits + este informe (§5). Sin push |
| 8 | Coordinación de `integration/mobile-backend` | ✅ propuesta en `docs/contracts/coordinacion-integracion-mobile-backend.md`: orden, conflictos esperados con su resolución y respuesta a los 5 bloqueos de Codex. La rama **no** se creó: necesita tu autorización |

## 2. Guía de integración: desajustes corregidos

1. §6: sin cuenta, `syncNow()` devuelve `UNAUTHENTICATED` (la guía decía `NETWORK_UNAVAILABLE`, que corresponde a
   tener cuenta sin red).
2. §4: el ejemplo usaba `ids` sin decir de dónde sale. Ahora: `createUuidV7Generator(getRandomBytes)` de
   `@athlete/data`.
3. §2.2: faltaba el código `legacy-invalid-time-zone`, y en el informe del importador `fingerprint` y
   `unlinkedSessionTargets`.
4. §2: no explicaba qué operaciones **lanzan** y cuáles devuelven `Result`. Ahora lo hace:
   - `openAthleteData` lanza `LocalDatabaseError`;
   - `adoptLocalData` lanza `DataError` o `LocalDatabaseError`;
   - `importLegacyStore` lanza `LegacyImportError`;
   - los repositorios nunca lanzan.

Además, `frontend-guide.md` §1 seguía enseñando el arranque anterior (`createAthleteData` + `fromExpoSqlite`, que no
verifica la clave ni gestiona la identidad). Se sustituyó por `openAthleteData` + `adoptLocalData`, y ese fragmento
también se compila.

Comprobación de los fragmentos:
- archivo: `docs/contracts/verificacion/guia-integracion-codex.snippets.ts`, con `tsconfig.guia.json`;
- en esta rama no están instalados los paquetes `expo-*`, así que se compilaron con los tipos de
  `ATHLETE-CODEX/node_modules` (solo lectura);
- en la rama de integración bastará con `npx tsc -p docs/contracts/verificacion/tsconfig.guia.json`.

## 3. Las 10 pruebas de integración

**Entorno:**
- macOS 27.2 arm64;
- Node v22.23.4, npm 10.9.9;
- PostgreSQL 16.15 (Homebrew) local, solo TCP en `127.0.0.1:54329`;
- Vitest 4.1.12 y TypeScript 6.0.3.

Sin Supabase real: `auth.uid()` lo da un stub de `auth` (`supabase/tests/harness/supabase_auth_stub.sql`) que fija
la identidad igual que PostgREST tras validar el JWT (rol `authenticated` + claims). No hay GoTrue ni PostgREST.

**Base:**
- `athlete3_test`, recreada en cada ejecución por `db:reset`: `drop`/`create`, stub de `auth` y las 9 migraciones de
  `supabase/migrations/`;
- las pruebas de integración se conectan con `TEST_DATABASE_URL`, por defecto
  `postgresql://postgres@127.0.0.1:54329/athlete3_test`;
- `pg-transport.ts` y `reset-local-db.sh` rechazan cualquier host que no sea local.

**Reproducción:**

```sh
npm ci
supabase/tests/harness/local-postgres.sh start      # crea .pgdata/ (ignorado por git) si no existe
DATABASE_URL=postgresql://postgres@127.0.0.1:54329/postgres npm run test:db
supabase/tests/harness/local-postgres.sh stop
```

El error que vio Codex (`ECONNREFUSED 127.0.0.1:54329`) se debía a que no había servidor en ese puerto. El script lo
resuelve. Para el informe se probó con un clúster recién creado.

**Resultados del 5-nov-2026** (reporter `verbose`; los 10 en verde):

| Archivo | Prueba | ms |
|---|---|---|
| `acceptance.test.ts` | sesión creada offline → reinicio → sync sin duplicados → visible en otro dispositivo | 156 |
| | edición concurrente de la misma serie → conflicto explícito → resolución | 76 |
| | borrado en un dispositivo no reaparece en el otro | 85 |
| | cardio, peso, perfil, ejercicio propio y plan sincronizan entre dispositivos | 111 |
| | las columnas locales escribibles coinciden con las del servidor | 4 |
| | la fecha local del cliente coincide con la del servidor en zonas y horarios límite | 3 |
| `training-cycle.test.ts` | rutina → sesión → series con RIR → finalizar → servidor y segundo dispositivo con los mismos valores | 129 |
| `offline-identity.test.ts` | el catálogo incluido coincide con `athlete3.catalog_snapshot()` | 21 |
| | sin cuenta → ciclo offline → iniciar sesión → adoptar → sincronizar: 0 rechazos | 115 |
| | lo importado de la capa anterior sincroniza sin rechazos tras adoptar la cuenta | 193 |

**Reproducibilidad desde los commits:**
- se clonó `claude/backend-foundation` (commit `d991058`) en un directorio limpio;
- `npm ci` → typecheck 0 errores → `npm test` (19 + 46 + 97) → clúster nuevo con `local-postgres.sh` →
  `npm run test:db` (72 + 10);
- **244/244** en verde.

## 4. Cobertura: real, simulada y nativa

| Área | Real (código de producción + motor real) | Simulado | Nativo iOS |
|---|---|---|---|
| Importador | SQLite real; verificación, `ROLLBACK`, idempotencia y origen intacto (SHA-256); lo importado sincroniza sin rechazos contra Postgres real | Copia cifrada en el caso extremo a extremo (`FakeCipherDatabase`) | ⏳ |
| Identidad local | Lógica real sobre SQLite real | Almacén seguro (`MemorySecureStore`) | ⏳ |
| Adopción de cuenta | Transacción real (SQLite) + sync real (Postgres) | Almacén seguro | ⏳ |
| SQLCipher | Lógica de decisión de `openEncryptedDatabase` | **Todo el cifrado**: `FakeCipherDatabase` emula la semántica sin cifrar. En este equipo no existe ningún SQLCipher | ⏳. El 4-nov solo se validó la capa anterior (`database.ts`), no `openEncryptedDatabase` |
| SecureStore | — | **Siempre** simulado en los paquetes | ⏳. El 4-nov solo con la capa anterior |

**No se puede afirmar que SQLCipher y SecureStore funcionen con `@athlete/data` hasta la validación en un simulador
desechable.** Para tener cifrado real en Node intenté instalar `better-sqlite3-multiple-ciphers` (modo SQLCipher 4) en
el scratchpad. La instalación quedó **bloqueada por los permisos de la sesión** (dependencia nativa externa) y no
intenté rodear el bloqueo. Queda como opción pendiente de tu aprobación.

## 5. Estado exacto de Git

`claude/backend-foundation`: 7 commits sobre `main` (`22503f3`), **solo locales**. En `origin` solo existe `main`;
no se hizo push.

| Commit | Contenido |
|---|---|
| `f657500` | chore: base del monorepo (`package.json`, `package-lock.json`, `tsconfig.base.json`, `.gitignore`, `config/`) |
| `47beb99` | feat(contracts): `@athlete/contracts` 0.3.0 |
| `6bb156f` | feat(domain): `@athlete/domain` |
| `7cb2a5a` | feat(supabase): migraciones locales, arnés y 72 pruebas |
| `5207dbf` | feat(data): `@athlete/data` |
| `d991058` | docs: arquitectura, decisiones, contratos e informes |
| (siguiente) | docs: este informe |

**Archivos:**
- los 6 primeros commits suman 129 archivos y 15 063 líneas añadidas; no se modificó ningún archivo que ya
  existiera en `main`;
- excluidos por `.gitignore`: `node_modules/`, `.DS_Store` (3 archivos de macOS en `docs/`, `packages/` y
  `supabase/`) y `.pgdata/`;
- revisión de secretos antes de confirmar: sin claves reales. Solo hay advertencias en la documentación y valores
  ficticios de prueba (`sb_secret_FAKE_TEST_VALUE_0000`). Aparece el identificador del proyecto Supabase
  `npdrjhbkilicuieecbgd` en dos documentos: no es una credencial.

Otras ramas: sin cambios por parte de Claude.
- `codex/mobile-foundation` sigue en `22503f3`; su trabajo está sin confirmar en su worktree.
- `main` sigue en `22503f3`.

## 6. Bloqueos y decisiones pendientes

1. **Autorizar la creación de `integration/mobile-backend` y la combinación de ramas** (ver el plan de coordinación).
   Antes, Codex debe confirmar su trabajo.
2. **`apps/mobile/ios/` ignorado por git en la rama de Codex:** se perderían las ediciones nativas hechas a mano
   (escenas, `Info.plist`, entitlements). Decisión de Codex y del propietario (§3.2 del plan).
3. **Siguiente trabajo de Claude:** el *handoff* de almacén activo y la copia de la base anterior que pide Codex
   (`resolveActiveStore`, `backupLegacyDatabase`, `migrateLegacyIfNeeded`; diseño en el plan, §4). Opcionalmente,
   `plans.createRoutine` atómico.
4. **Validación nativa** de SQLCipher, SecureStore y el ciclo completo en un simulador desechable.
5. **Dependencia nativa** para cifrado real en las pruebas de Node: requiere tu aprobación.
6. Siguen abiertas: el respaldo de Diario Gym y la pregunta sobre iPhones físicos con datos reales.
