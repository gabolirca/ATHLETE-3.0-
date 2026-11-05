# Cómo ejecutar las pruebas localmente

Requisitos: Node ≥ 22 (usa `node:sqlite`), npm 10, PostgreSQL 16+ (`brew install postgresql@16`).
Opcional: Docker + Supabase CLI para validar contra el stack real.

## 1. Pruebas sin base de datos (contratos, dominio, datos)

```sh
npm install
npm run typecheck
npm test            # contracts + domain + data (unitarias, SQLite real en archivos temporales)
```

## 2. Pruebas de base de datos e integración (Postgres local)

Levantar un Postgres 16 desechable (solo TCP en 127.0.0.1:54329; nunca remoto) y ejecutar:

```sh
supabase/tests/harness/local-postgres.sh start          # crea .pgdata/ si no existe (ignorado por git) y arranca
DATABASE_URL=postgresql://postgres@127.0.0.1:54329/postgres npm run test:db
supabase/tests/harness/local-postgres.sh stop
```

`npm run test:db` hace tres cosas en orden:
1. `db:reset`: recrea la base `athlete3_test`, aplica el stub de `auth` y **todas** las migraciones de
   `supabase/migrations/`.
2. `supabase/tests/db/*` (72 pruebas).
3. `packages/data/test/integration/*` (10 pruebas, conectadas a `athlete3_test` vía `TEST_DATABASE_URL`, que por
   defecto es `postgresql://postgres@127.0.0.1:54329/athlete3_test`).

Variables opcionales del script: `ATHLETE_PGDATA` (directorio de datos), `ATHLETE_PGPORT`, `PG_BIN`. El script nunca
borra el clúster.

- `supabase/tests/db/*` — seguridad de catálogo, RLS, aislamiento entre dos usuarios, anon, roles, validación,
  idempotencia, conflictos, tombstones, pull incremental, reglas de sesión, historial y límites de frecuencia.
- `packages/data/test/integration/*` — criterio de aceptación offline-first de extremo a extremo (SQLite ↔ Postgres),
  conflictos entre dispositivos, paridad de columnas y de fecha local, y ciclo de entrenamiento completo
  (rutina → sesión → series con RIR → sync → segundo dispositivo) en `training-cycle.test.ts`; y en
  `offline-identity.test.ts`: catálogo incluido = catálogo del servidor, identidad local → adopción de cuenta → sync sin
  rechazos, e importación de la capa anterior → sync sin rechazos.
- `packages/data/test/unit/{encrypted-database,open-athlete-data,legacy-import}.test.ts` usan un SQLCipher **simulado**
  sobre `node:sqlite` real (`FakeCipherDatabase` en `test/support.ts`): reproduce "clave incorrecta → file is not a
  database" y la adopción de clave en la primera escritura, pero **no** cifra el archivo. El cifrado real se valida en el
  simulador iOS.

`reset-local-db.sh` y las pruebas **se niegan a ejecutarse** si la URL no es local.


## 3. Contra el stack real de Supabase (cuando haya Docker)

```sh
supabase start                       # aplica supabase/migrations al Postgres local del stack
TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres \
  npm run test -w @athlete/supabase-tests && \
TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres \
  npm run test:integration -w @athlete/data
```
(No ejecutar `db:reset` contra el stack: el stub de auth es solo para Postgres sin Supabase.)

## 4. Totales actuales

| Suite | Pruebas |
|---|---|
| contracts | 19 |
| domain | 46 |
| data (unitarias) | 97 |
| supabase (base de datos) | 72 |
| data (integración) | 10 |
| **Total** | **244** |

## 5. Qué es real, qué es simulado y qué falta validar en nativo

| Área | Prueba real (implementación de producción + motor real) | Simulado | Nativo (iOS) |
|---|---|---|---|
| Esquema, repositorios, outbox, transacciones | SQLite real (`node:sqlite`, archivos temporales) | — | ⏳ `expo-sqlite` 58 sin ejecutar con `@athlete/data` |
| Sync, RLS, validación del servidor | Postgres 16 real con las migraciones reales; RPC `sync_push`/`sync_pull` | `auth.uid()` mediante un stub de `auth` (sin GoTrue ni PostgREST) | — |
| Importador de la capa anterior | Transformación, verificación, `ROLLBACK`, idempotencia y "no escribe en el origen" sobre SQLite real; el resultado sincroniza sin rechazos contra Postgres real | La copia cifrada en el caso extremo a extremo usa `FakeCipherDatabase` | ⏳ copia de archivos con `expo-file-system` y apertura con SQLCipher real |
| Identidad local y adopción de cuenta | Reasignación transaccional sobre SQLite real; sync de lo adoptado contra Postgres real | Almacén seguro = `MemorySecureStore` (un `Map` con inyección de fallos) | ⏳ `expo-secure-store` real |
| SQLCipher (`openEncryptedDatabase`) | Lógica de decisión (primera instalación, base existente, sin sobrescribir…) | `FakeCipherDatabase`: emula "clave incorrecta → file is not a database" y la adopción de clave en la primera escritura; **no cifra** el archivo. En este equipo no hay ningún SQLCipher (no existe `sqlcipher`; `node:sqlite` no tiene `cipher_version`) | ⏳ El 4-nov se validó en el simulador SQLCipher + SecureStore reales, pero con la capa anterior (`apps/mobile/src/data/database.ts`), **no** con `openEncryptedDatabase` |
| Guía de integración | Fragmentos compilados con TS 5.9.3 y 6.0.3 contra los tipos reales de Expo SDK 58 (`docs/contracts/verificacion/`) | — | ⏳ ejecución en la app |

Pendiente para cerrar las filas ⏳: validación conjunta en un simulador iOS **desechable**, nunca sobre la base actual
del simulador. Opcional: una capa de pruebas en Node con cifrado real (p. ej. el paquete
`better-sqlite3-multiple-ciphers` en modo SQLCipher 4). Requiere aprobar una dependencia nativa nueva; su instalación
quedó bloqueada en esta sesión.
