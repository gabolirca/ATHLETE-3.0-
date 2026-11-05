# Informe — Implementación de la integración: contratos 0.3.0, identidad local, catálogo offline, SQLCipher centralizado e importador

**Agente:** Claude · **Fecha:** 5 de noviembre de 2026 · **Rama:** `claude/backend-foundation` (`~/GYM/ATHLETE-CLAUDE`)
**Autorización:** aprobación del propietario del 4-nov-2026 para implementar la integración.
**Informes previos (no se sobrescriben):** `2026-11-04-integracion-backend-claude.md`,
`2026-11-04-auditoria-modelo-diario-gym-claude.md`.

> Sin commits, push ni merge. No se tocó Supabase remoto, la rama de Codex, `main` ni el repositorio o respaldo de
> Diario Gym. No se ejecutó ninguna migración sobre la base del simulador ni sobre ninguna base real. No se borró
> ninguna base, clave ni dato. No se implementó IA ni predicción. Las pruebas de servidor usaron un Postgres 16 local
> y desechable (127.0.0.1:54329, datos en el scratchpad), detenido al terminar.

## 1. Qué se entregó

| Pieza | Estado | Dónde |
|---|---|---|
| Contratos **0.3.0** | ✅ implementado y probado | `packages/contracts` (+ `CHANGELOG.md`) |
| Identidad local sin cuenta + adopción al iniciar sesión | ✅ | `packages/data/src/identity.ts`, `open.ts`, `LocalStore.reassignOwner` |
| Catálogo incluido (offline) | ✅ (verificado contra el servidor) | `packages/data/src/catalog/bundled.ts` |
| Gestión centralizada de SQLCipher/SecureStore | ✅ en Node con SQLCipher **simulado**; ⏳ en el simulador iOS | `packages/data/src/secure/encrypted-database.ts` |
| Punto de entrada único `openAthleteData` | ✅ | `packages/data/src/open.ts` |
| Importador reversible de la capa anterior | ✅ con bases desechables; **no ejecutado sobre datos reales** | `packages/data/src/legacy/codex-v1.ts` |
| Esquema local v2 | ✅ (`sports`, `legacy_quarantine`; migraciones idempotentes) | `packages/data/src/local/schema.ts` |
| Migración de servidor (solo local) | ✅ en Postgres local; **no aplicada en remoto** | `supabase/migrations/20261105000100_athlete3_contracts_0_3_0.sql` |
| Guía para Codex (versión 2, API real) | ✅ | `docs/contracts/guia-integracion-codex.md` |
| Verificación del repositorio `diario-gym` | ✅ | §6 |
| `@athlete/domain` | Sin cambios: no fue necesario. Se reutilizan `localDateOf` y `roundTo` | — |

## 2. Contratos 0.3.0 (cambio compartido: requiere revisión de Codex)

| Cambio | Tipo |
|---|---|
| `StartFromTrainingDayInput` + `WorkoutSessionRepository.startFromTrainingDay()` | Aditivo |
| `Sport` y `Profile.sports` (lista ≤ 7, sin repetidos; vacía = no indicado) | Aditivo (con columna en servidor) |
| `Position` (0–1000) en todas las listas ordenadas | Endurece (igual que el servidor) |
| `targetRir` = `Rir` (pasos de 0.5) | Endurece (igual que el servidor) |
| Precisión de 2 decimales de `weightKg`/`distanceMeters` | Solo documentación |
| Estados de sesión, límites de peso y repeticiones | Sin cambio (Codex adapta) |

Detalle e impacto en `packages/contracts/CHANGELOG.md`. Los dos guardas que el repositorio aplicaba desde el 4-nov
(`targetRir` y `trainingDayId` obligatorio) ahora los cubre el contrato y se retiraron del repositorio para no
duplicar reglas.

## 3. Diseño implementado

### 3.1 `openAthleteData`

1. **Identidad.** Se resuelve con `athlete3.identity.v1` (`{ localUserId, accountUserId }`). Si no existe, se
   reutiliza el UUID de `device:<uuid>` de la capa anterior (sin modificar esa entrada); si tampoco, se crea uno. Nunca
   se sobrescribe; una identidad corrupta → `secret-invalid`.
2. **Base cifrada.** `athlete3-<localUserId>.db` con `openEncryptedDatabase`:
   - clave propia en `athlete3.sqlcipher-key.<archivo>.v1`;
   - mismas reglas que se validaron en el simulador el 4-nov: primera instalación frente a base existente, nunca
     sobrescribir, probar la lectura antes de migrar y errores tipados con `recoverable`.
3. **Esquema.** Se migra el esquema local, se aplica el catálogo incluido si no hay uno del servidor y se construyen
   los servicios.
4. **Transporte.** Sin cuenta, `localOnlyTransport` responde `UNAUTHENTICATED` (no reintentable): el motor deja las
   mutaciones pendientes sin consumir intentos.
5. **`adoptLocalData(authUserId)`.** En una transacción:
   - reasigna `user_id` en todas las tablas, el `id` del perfil y el `entity_id` de su mutación;
   - vincula la identidad mediante comparar-y-escribir y reabre.

   Si la app se cierra entre ambos pasos, la siguiente apertura completa el vínculo (`adopted_from_local_user`). Las
   mutaciones no llevan `user_id`, así que la outbox sigue siendo válida.

### 3.2 Importador (`importLegacyStore`)

- Lee una **copia**, abierta en solo lectura con su clave original (`openLegacyDatabaseCopy`: nunca crea claves ni
  ejecuta PRAGMAs que escriban).
- Precondiciones: `user_version = 1`; nada con `server_version`; nada `acked`/`syncing` en la outbox.
- Transformación según el plan del 4-nov:
  - rutina → plan + día (id derivado determinista) + ejercicios planificados;
  - estados de sesión con su equivalencia;
  - zona horaria de las preferencias heredadas;
  - series vacías omitidas y contadas;
  - pesos a 2 decimales;
  - ejercicios de muestra → catálogo (los 6, gracias a "Remo sentado en polea");
  - preferencias → perfil, sin sobrescribir uno existente.
- Cada fila se valida con el **contrato oficial**. Lo que no cumple va a `legacy_quarantine` con su motivo (otro
  propietario, ejercicio sin correspondencia, valores fuera de rango, "hybrid" sin disciplinas concretas, conflicto
  de sesión en curso).
- Una sola transacción. Antes del `COMMIT` se verifica:
  - presencia y estado de cada registro;
  - número de series, series con RIR y volumen;
  - número de mutaciones encoladas.

  Si algo falla → `ROLLBACK`.
- Idempotente por huella SHA-256 del contenido; otra base distinta → `already-imported-different-source`.
- No traduce la outbox heredada: encola un `upsert` por registro vivo, con los padres antes que los hijos.

## 4. Pruebas

### 4.1 Resultados reales (5-nov-2026)

```
npm run typecheck                         → 0 errores (contracts, domain, data, supabase-tests)
npm test                                  → contracts 18 ✓ · domain 46 ✓ · data 97 ✓
npm run test:db (Postgres 16 local)       → supabase 72 ✓ · data integración 10 ✓
Total: 243 (antes 208). Unitarias + integración ejecutadas dos veces seguidas sobre el mismo servidor: 107/107 ambas.
```

### 4.2 Nuevas

| Archivo | Pruebas | Qué demuestra |
|---|---|---|
| `contracts/test/contracts.test.ts` | +4 | Posiciones, `targetRir`, `StartFromTrainingDayInput`, `sports` |
| `data/test/unit/encrypted-database.test.ts` | 9 | Primera instalación, clave existente, almacén inaccesible, base sin clave, clave incorrecta, clave inválida, sin SQLCipher, concurrencia, copia en solo lectura sin escrituras |
| `data/test/unit/open-athlete-data.test.ts` | 8 | Ciclo completo sin red ni cuenta, reapertura, reutilización de `device:<uuid>`, identidad corrupta, catálogo del servidor no pisado, adopción + sync, adopción interrumpida, otra cuenta → `FORBIDDEN`, actualización v1→v2 |
| `data/test/unit/legacy-import.test.ts` | 8 | Ver detalle abajo |
| `data/test/integration/offline-identity.test.ts` | 3 | Catálogo incluido = servidor; local → adopción → sync con 0 rechazos (RIR `[2, 0.5, 0]`, `sports` en servidor); importado → adopción → sync con 0 rechazos |
| `supabase/tests/db/validation.test.ts` | +3 | `sports` con disciplina desconocida o repetida → rechazo; válidas → aplicadas |

Detalle de `legacy-import.test.ts`:
- transformación completa: conteos, valores, enlace al plan, cuarentena, orden de la outbox;
- origen intacto: solo `SELECT` y SHA-256 sin cambios;
- idempotencia y otra base distinta;
- dos precondiciones;
- `ROLLBACK` total ante un fallo de verificación inyectado, con reintento limpio;
- conflicto de sesión en curso;
- continuidad del ciclo tras importar;
- extremo a extremo cifrado: la copia se abre con la clave original y no se crean claves extra.

### 4.3 Las pruebas detectan fallos (sabotaje deliberado y revertido)

- Adopción sin reasignar el `id` del perfil → fallan 2 pruebas: la unitaria y la integración, donde el servidor
  rechaza el perfil.
- Catálogo incluido distinto de la semilla del servidor → fallan 2 pruebas de integración.
- Escritura omitida durante la importación → falla la verificación y no queda nada escrito (prueba permanente).

### 4.4 Un problema propio, corregido

La primera versión del fixture heredado usaba UUID fijos: al repetir la integración sobre el mismo servidor, el
servidor rechazaba con razón 16 registros cuyos `id` ya pertenecían a otro usuario. Con datos reales no ocurre (la
capa anterior genera UUID v4 aleatorios). Ahora el fixture genera ids por proceso y la suite se puede repetir.

### 4.5 Lo que estas pruebas NO demuestran

- **Cifrado real:** `FakeCipherDatabase` emula la semántica de SQLCipher (clave incorrecta → "file is not a
  database"; adopción de clave en la primera escritura) sobre SQLite **sin cifrar**. Que el archivo quede cifrado y
  que `expo-sqlite` 58 + `expo-secure-store` se comporten igual solo se puede validar en el simulador iOS.
- **La parte de la app:** la copia de archivos del respaldo (`expo-file-system`) y el arranque en Hermes.
- **Supabase real:** PostgREST y GoTrue siguen sin probarse (requieren Docker).

## 5. Bloqueos y coordinación

| # | Bloqueo / riesgo | Necesita |
|---|---|---|
| B1 | **La app no puede importar `@athlete/*` hoy.** Los paquetes solo existen en esta rama, y el `package.json` raíz de Codex tiene `workspaces: ["apps/mobile"]`. Sin integrar ambas ramas no hay validación conjunta real. Opciones: (a) rama de integración que combine ambas (requiere autorización de merge); (b) dependencia local temporal `file:` al worktree de Claude, solo para validar | **Decisión del propietario** |
| B2 | Versiones: paquetes con TypeScript 5.9 y Vitest; app con TypeScript 6.0 y Jest (jest-expo). Zod 4 en ambos. Al unificar hay que fijar una versión de TS para todo el monorepo | Codex + Claude |
| B3 | Revisión de contratos 0.3.0 por Codex (ADR-0001, regla 4) | Codex |
| B4 | Validación en el simulador iOS de `openAthleteData` con SQLCipher real, del ciclo completo y de la reapertura; después, de la importación **sobre una base de prueba generada por la app actual** (nunca la original) | Conjunta |
| B5 | Migración `20261105000100` solo en local: aplicarla en un proyecto remoto requiere aprobación | Propietario |
| B6 | ¿La app está instalada en algún iPhone físico con datos reales? (pendiente desde el 4-nov) | Propietario |
| B7 | Multicuenta en un mismo dispositivo: hoy → `FORBIDDEN` (diseño pendiente) | Producto |
| B8 | Respaldo de Diario Gym (`codigo/`, `base_de_datos/`, `LEEME.md`): sigue sin estar en este equipo; sin él no se pueden verificar las cifras de predicciones | Propietario |

Al terminar la integración no debe quedar una segunda outbox ni repositorios SQLite paralelos. Por parte del backend
ya no hace falta nada de la capa anterior: solo se lee para importarla. Retirarla de la app es trabajo de Codex, y
borrar `athlete3.db` y su clave requiere aprobación (plan del 4-nov §6.7).

## 6. Repositorio `https://github.com/gabolirca/diario-gym.git`: qué se puede verificar

Clonado en el scratchpad (sin tocar `~/GYM/diario-gym`).

- **[V] Mismo contenido que el clon local:** `HEAD 837424b` (20-sep-2026), 38 commits, rama `main`. La auditoría del
  4-nov sigue vigente sin cambios.
- **[V] `v2/modelo.json` se publicó una sola vez** (commit `b777852`, 13-ago-2026) y nunca cambió. SHA-256 del archivo
  `258eedfe…`: `carga-v1`, 40 árboles, "datos sintéticos", 13 798 filas, MAE 0.902.
  - Si GitHub Pages servía `main` (la Edge Function descargaba `gabolirca.github.io/diario-gym/v2/modelo.json`),
    **todas las predicciones las produjo ese único artefacto**. Eso aclara la trazabilidad.
  - **[V]** El registro de la migración 20 (13 088 muestras, 160 usuarios, MAE 0.908) se añadió **en el mismo
    commit** con cifras distintas: el desajuste existe desde el origen; no es una deriva posterior.
- **[V] Los scripts de demostración no crean predicciones** (`demo_seed*.sql`, `demo_limpiar.sql`): las predicciones
  de producción solo pudieron crearse llamando a `sugerir-carga`.
- **[V] Las migraciones 25b y 25c que existían en el proyecto remoto no están en el repositorio.** El esquema remoto
  final no se puede reconstruir solo desde git.
- **[V] El repositorio no contiene datos reales.** Solo datos sintéticos (`ml/muestra_datos_sinteticos.csv`) y
  semillas de demostración. Las cifras de 166 predicciones / 38 con error y los valores de `error_kg` **no se pueden
  verificar desde el repositorio**: requieren el respaldo de la base.
- **No verificable desde el repositorio:** qué versión de Pages estaba activa en cada fecha, si la Edge Function
  desplegada era idéntica a la del repositorio, y la configuración de `MODELO_URL`.

## 7. Archivos

**Nuevos:**
- `packages/data/src/{open.ts, identity.ts}`
- `packages/data/src/secure/encrypted-database.ts`
- `packages/data/src/catalog/bundled.ts`
- `packages/data/src/legacy/codex-v1.ts`
- `packages/data/test/fixtures/codex-v1.ts`
- `packages/data/test/unit/{encrypted-database,open-athlete-data,legacy-import}.test.ts`
- `packages/data/test/integration/offline-identity.test.ts`
- `supabase/migrations/20261105000100_athlete3_contracts_0_3_0.sql`
- este informe

**Modificados:**
- `packages/contracts/src/{common,sets,sessions,programs,profile,repositories}.ts`
- `packages/contracts/{package.json (0.3.0), CHANGELOG.md}`, `packages/contracts/test/contracts.test.ts`
- `packages/data/src/{factory.ts, index.ts}`
- `packages/data/src/local/{schema,store,entities}.ts`
- `packages/data/src/repositories/{workout-sessions,catalog-profile-plans}.ts`
- `packages/data/src/sql/expo-sqlite.ts` (comentario)
- `packages/data/test/support.ts`
- `supabase/tests/db/validation.test.ts`
- `packages/data/README.md`
- `docs/contracts/guia-integracion-codex.md`, `docs/architecture/testing.md`
