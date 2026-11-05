# Guía de integración: `apps/mobile` → `openAthleteData`

Para: Codex · Autor: Claude · Versión 2 (5-nov-2026) · Estado: **implementado en `claude/backend-foundation`; pendiente de
validación conjunta**. Contratos: `@athlete/contracts` **0.3.0** (`packages/contracts/CHANGELOG.md`).
Complementa `docs/contracts/frontend-guide.md`. Contexto: `docs/reports/claude/2026-11-04-integracion-backend-claude.md`
y `docs/reports/claude/2026-11-05-integracion-implementacion-claude.md`.

## 1. Qué cambia para la app

| Hoy (capa anterior) | Después |
|---|---|
| `SQLiteProvider` + `initializeAthleteDatabase` + `SQLiteTrainingRepository` + `getLocalOwnerKey` | **Un** `openAthleteData(...)` al arrancar, en un proveedor de React |
| Zod propios en `trainingSchemas.ts` | Tipos y esquemas de `@athlete/contracts` |
| `TrainingRepository` (25 métodos, incluida la outbox) | `data.plans`, `data.sessions`, `data.exercises`, `data.body`, `data.profile`, `data.sync` |
| Gestión de clave SQLCipher en `database.ts` | La hace `@athlete/data` (`openEncryptedDatabase`, mismas reglas) |
| Ejercicios de muestra sembrados por la app | Catálogo incluido en el paquete (13 ejercicios, mismos ids que el servidor) |
| Errores `throw new Error('ROUTINE_NOT_FOUND')` | `Result<T>`: `{ ok: true, value }` o `{ ok: false, error: { code, message } }` |
| La app gestiona la outbox | La app **no** toca la outbox; solo `data.sync.status()` y `data.sync.syncNow()` |

La UI no escribe SQL, no abre otras bases y no importa `node:sqlite`.

## 2. Arranque (identidad local sin cuenta)

```tsx
// src/data/AthleteDataProvider.tsx (Codex)
import * as SQLite from 'expo-sqlite';
import * as SecureStore from 'expo-secure-store';
import { getRandomBytes } from 'expo-crypto';
import { openAthleteData, isLocalDatabaseError } from '@athlete/data';

const data = await openAthleteData({
  openDatabase: (name) => SQLite.openDatabaseAsync(name),        // el paquete elige el archivo: athlete3-<localUserId>.db
  secureStore: {                                                 // SecureKeyValueStorage de @athlete/contracts
    getItem: (k) => SecureStore.getItemAsync(k),                 // sin opciones: cambiarlas ocultaría las entradas existentes
    setItem: (k, v) => SecureStore.setItemAsync(k, v),
    removeItem: (k) => SecureStore.deleteItemAsync(k),           // el paquete nunca la usa
  },
  randomBytes: getRandomBytes,                                   // síncrono y criptográfico
  accountTransport,                                              // opcional: SupabaseSyncTransport cuando haya cuenta
});
// data.identity → { localUserId, accountUserId: null } sin cuenta
```

- **Sin cuenta:** todo funciona offline. `data.sync.syncNow()` devuelve `UNAUTHENTICATED` (no es un error que
  haya que mostrar como fallo) y lo escrito queda pendiente en la outbox, la única que existe.
- **Identidad:** se guarda en `athlete3.identity.v1`. Si existe `athlete3.local-owner.v1` (`device:<uuid>`) de la capa
  anterior, se reutiliza ese UUID; esa entrada no se modifica ni se borra.
- **Errores de apertura:** `LocalDatabaseError` con los mismos códigos que `database.ts`
  (`secure-store-unavailable`, `secret-conflict` → recuperables; `database-key-missing`, `database-unreadable`,
  `secret-invalid`, `sqlcipher-unavailable` → no recuperables). Se reutiliza la pantalla de error de `_layout.tsx`;
  nunca se borra la base desde la UI.
- **No** abrir `athlete3.db` (la base anterior) con `openAthleteData` ni con `createAthleteData`: mismos nombres de
  tabla con otras columnas.
- **Excepciones frente a `Result`:** los repositorios (`data.plans`, `data.sessions`…) **nunca lanzan**: devuelven
  `Result`. En cambio, las operaciones de ciclo de vida **lanzan**:
  - `openAthleteData` lanza `LocalDatabaseError` (`isLocalDatabaseError(e)`, `e.code`, `e.recoverable`);
  - `adoptLocalData` lanza `DataError` (`e.appError.code`: `FORBIDDEN`, `VALIDATION_FAILED`, `INVALID_STATE`,
    `DUPLICATE`) o `LocalDatabaseError`;
  - `importLegacyStore` lanza `LegacyImportError` (`e.code`).
- **Ids:** la app genera los `id` de entrada con su propio generador:
  `const ids = createUuidV7Generator(getRandomBytes)` (de `@athlete/data`).

### 2.1 Iniciar sesión más adelante

```ts
const linked = await data.adoptLocalData(authUserId);  // reasigna la propiedad en una transacción y reabre
await linked.sync.syncNow();                            // envía todo lo pendiente
```
`data` queda cerrada; se usa `linked`. Un dispositivo vinculado a otra cuenta → `FORBIDDEN`: la multicuenta está
pendiente de diseño.

### 2.2 Migración de la capa anterior (solo tras aprobación y nunca sobre el archivo original)

> La app no debe encadenar estos pasos a mano: usa `migrateLegacyStore` (`contrato-seleccion-almacen.md`), que hace
> la copia verificada y el cambio de almacén. El fragmento muestra lo que ocurre por dentro.

```ts
import { openLegacyDatabaseCopy } from '@athlete/data';
import * as Crypto from 'expo-crypto';
// 1) Cerrar la conexión de la capa anterior. 2) Copiar athlete3.db, athlete3.db-wal y athlete3.db-shm (los que
//    existan) a Documents/SQLite/backups/legacy-<timestamp>/ con expo-file-system. 3) Abrir LA COPIA:
const copy = await openLegacyDatabaseCopy({
  name: 'athlete3.db',
  open: (n) => SQLite.openDatabaseAsync(n, {}, backupDirectory),
  secureStore,                                           // lee 'athlete3.sqlite.sqlcipher-key.v1'; no crea ni cambia claves
});
const { alreadyImported, report } = await data.importLegacyStore(copy, {
  deviceTimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  sha256: (t) => Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, t),
});
await copy.close();
// report: fingerprint, imported, tombstoned, enqueued, quarantined (por motivo), skippedEmptySets,
//         unlinkedSessionTargets, checks
```

El importador es transaccional, verifica antes de confirmar y es idempotente; no escribe en la copia. Errores
`LegacyImportError`: `legacy-already-synced`, `legacy-unsupported-version`, `legacy-invalid-time-zone`,
`already-imported-different-source`, `verification-failed`. Ante cualquiera de ellos, la app sigue con la capa anterior y no se cambia nada. Lo que no
cumple los contratos queda en `legacy_quarantine` (p. ej. "hybrid" como deporte, que requiere que la persona elija sus
disciplinas). **No se ejecuta sobre la base original del simulador.**

## 3. Correspondencia de métodos

| `TrainingRepository` (heredado) | Oficial | Notas |
|---|---|---|
| `searchExercises(q)` | `data.exercises.list({ search: q })` | Catálogo incluido; sin red ni cuenta desde la primera apertura |
| `listRoutines()` | `data.plans.listPlans()` + `data.plans.getPlan(id)` | Rutina = plan con un día |
| `createRoutine({ name, exercises })` | `createPlan` → `addDay` → `addDayExercise` × N | Ver §4. Sugerencia: un helper `createRoutine` en la app que encadene las llamadas; Claude puede ofrecerlo atómico en el paquete si se prefiere |
| `tombstoneRoutine(id)` | `data.plans.deletePlan(id)` | Cascada a días y ejercicios |
| `startWorkout(routineId)` | `data.sessions.startFromTrainingDay({ id, trainingDayId, startedAt, timeZone })` | Contrato 0.3.0. Atómico. **No crea series vacías** |
| `startWorkout()` (libre) | `data.sessions.start({ id, startedAt, timeZone })` | Si ya hay una en curso: `INVALID_STATE` con `details.activeSessionId` → navegar a ella (hoy la heredada la devuelve en silencio) |
| `addExercise(sessionId, exerciseId)` | `data.sessions.addExercise({ id, sessionId, exerciseId })` | |
| `addSet` + `saveSet` | `data.sessions.logSet({ id, sessionExerciseId, setType, weightKg, reps, rir, completedAt })` | Una sola llamada al **marcar la serie como hecha** |
| editar una serie | `data.sessions.updateSet({ setId, ...cambios })` | Ausente = no cambia; `null` = borra |
| `finishWorkout(id)` | `data.sessions.complete({ sessionId, endedAt })` | Permitido sin series; si se quiere, avisar en la UI |
| `tombstoneWorkout(id)` | `data.sessions.discard(...)` (en curso) o `data.sessions.delete(id)` | `discard` = abandonar; `delete` = borrar del historial |
| `getWorkout(id)` | `data.sessions.getDetail(id)` / `getActive()` | |
| `listHistory()` | `data.sessions.listHistory({}, { limit })` | Paginado (`nextCursor`) |
| `getOverview()` / `getProgress()` | `listHistory` + `summarizeWeek`, `computePersonalRecords` de `@athlete/domain` | Los cálculos viven en `domain`, no en la UI |
| `addBodyMeasurement` | `data.body.logWeight` / `data.body.logMeasurement` | `waist`, `chest`, `hips`… con unidad de entrada |
| `getPreferences` / `savePreferences` | `data.profile.get()` / `initialize(tz)` / `update(...)` | `preferredSport` → `sports: Sport[]` (0.3.0; lista para híbridos) |
| `listOutbox`, `markOutbox*` | — | Los gestiona `data.sync`. Mostrar `pendingCount`, `conflictCount` y `rejectedCount` |

## 4. Rutina: objetivos frente a series realizadas

```ts
const ids = createUuidV7Generator(getRandomBytes);        // de @athlete/data; uno por app
const planId = ids.newId(), dayId = ids.newId();
await data.plans.createPlan({ id: planId, name, description: null, status: 'active', startsOn: null, endsOn: null });
await data.plans.addDay({ id: dayId, planId, position: 0, name, kind: 'training', notes: null });
for (const [i, e] of exercises.entries()) {
  await data.plans.addDayExercise({ id: ids.newId(), trainingDayId: dayId, exerciseId: e.exerciseId, position: i,
    targetSets: e.sets, targetRepsMin: e.reps, targetRepsMax: e.reps, targetRestSeconds: e.restSeconds,
    targetRir: null, targetWeightKg: null, targetDurationSeconds: null, targetDistanceMeters: null, notes: null });
}
```

En la pantalla de entrenamiento:
- Cada `exercise.trainingDayExerciseId` enlaza con su objetivo (`getPlan` → `days[0].exercises`). La UI dibuja
  `targetSets` filas **guía** con "objetivo 3 × 8 · 90 s".
- Al completar una fila → `logSet`. La fila guía pasa a ser una serie real con `completedAt`.
- No se crean filas vacías en la base: una serie vacía no es un dato y contaminaría el historial y cualquier modelo.

## 5. RIR en la UI

- Pregunta: **"¿Cuántas repeticiones más podrías haber hecho?"**
- Valores: 0–10. Basta con enteros; el contrato también acepta 0.5.
- **0 ≠ sin respuesta**: si el usuario no responde, `rir: null`. No usar `value || null` ni `if (!rir)`.

## 6. Sincronización y estados

- `data.sync.syncNow()` al volver a primer plano, al recuperar la red y tras escribir (con debounce).
  - **Sin cuenta:** devuelve `UNAUTHENTICATED` y todo queda pendiente. Es lo esperado y no se muestra como error.
  - **Con cuenta y sin red:** `NETWORK_UNAVAILABLE` / `TIMEOUT`, y se reintenta más tarde.
- Los indicadores (`SyncBadge`) se alimentan de `data.sync.status()`.
- Los conflictos se muestran y el usuario elige (`resolveConflict(..., 'keep_local' | 'keep_remote')`); nunca se
  resuelven en silencio.

## 7. Errores frecuentes

| `error.code` | Cuándo | UI |
|---|---|---|
| `VALIDATION_FAILED` | Entrada fuera de rango (`details.issues`) | Marcar el campo |
| `INVALID_STATE` | Segunda sesión en curso; sesión descartada | Ofrecer ir a la activa |
| `NOT_FOUND` | Registro eliminado (p. ej., desde otro dispositivo) | Volver a la lista |
| `DUPLICATE` | Se reutilizó un `id` | Error de programación: generar uno nuevo |
| `STORAGE_FAILURE` | Fallo de SQLite | Mensaje genérico; los datos anteriores siguen |

Mostrar `error.message`; nunca `details` crudos.

## 8. Indicador de transición y migración

- **Sustituido por `contrato-seleccion-almacen.md`.** El almacén activo lo decide `openActiveStore` a partir del
  estado del dispositivo. El marcador `athlete3.active-store.v1` avanza `legacy → migrating → official` y nunca
  retrocede desde `official`. La variable `EXPO_PUBLIC_ATHLETE_DATA_LAYER` ya no decide qué se monta.
- La migración la orquesta `migrateLegacyStore`: copia verificada, apertura solo de la copia, `importLegacyStore`
  (§2.2) y cambio del marcador. Su ejecución con datos reales sigue sujeta a la aprobación del propietario. La UI solo
  muestra el progreso y el resultado, incluida la cuarentena.
- Ningún código de la app borra `athlete3.db` ni su clave.

## 9. Lista de verificación de la integración

- [ ] La app no importa `SQLiteTrainingRepository`, `trainingSchemas.ts` ni `trainingTypes.ts` (salvo tipos de vista).
- [ ] Ninguna pantalla ejecuta SQL.
- [ ] Rutina: crear, editar (`updateDayExercise`), borrar y consultar.
- [ ] Sesión desde rutina y libre; registrar, editar y borrar series; finalizar; descartar.
- [ ] Historial y detalle tras cerrar y abrir la app (iOS Simulator).
- [ ] RIR 0 se guarda y se muestra como 0.
- [ ] `SyncBadge` con `data.sync.status()`.
- [ ] Error de apertura de base → pantalla de error, sin borrar nada.
- [ ] Pruebas Jest de la app con `@athlete/data/node-sqlite` (misma implementación, SQLite real) en lugar de dobles.

## 10. Verificación de esta guía

Los fragmentos de §2, §2.1, §2.2, §3, §4 y §6 están en `docs/contracts/verificacion/guia-integracion-codex.snippets.ts`
y se compilan contra la API real:
- `@athlete/*` de esta rama;
- los tipos de `expo-sqlite`, `expo-secure-store` y `expo-crypto` de Expo SDK 58 (los de `node_modules` de
  `apps/mobile`).

Resultado (5-nov-2026): sin errores con TypeScript 5.9.3 y con 6.0.3. Un fragmento alterado a propósito (`transport` en
lugar de `accountTransport`) sí falla, así que la comprobación detecta desajustes. En la rama de integración, este
archivo debe pasar a ser una comprobación de `apps/mobile` (`tsc --noEmit`).
