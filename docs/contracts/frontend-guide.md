# Guía de contratos para la app móvil — ATHLETE 3.0

**Versión de contratos:** `@athlete/contracts` 0.3.0 (borrador, pendiente de revisión por Codex)
**Autor:** Claude · **Fecha:** 3 de noviembre de 2026 (arranque actualizado el 5-nov-2026 a `openAthleteData`)

La app **no habla con Supabase ni con SQLite directamente**. Usa:

| Necesidad | Qué usar | Paquete |
|---|---|---|
| Tipos, validación, errores | `@athlete/contracts` | Zod + TypeScript |
| Cálculos (volumen, e1RM, ritmo, récords, semanas) | `@athlete/domain` | funciones puras |
| Datos (lectura/escritura offline) | repositorios de `openAthleteData()` | `@athlete/data` |
| Autenticación | `SupabaseAuthService` (`AuthService`) | `@athlete/data` |
| Sincronización | `data.sync` (`SyncService`) | `@athlete/data` |

## 1. Arranque

```ts
import * as SQLite from 'expo-sqlite';
import * as SecureStore from 'expo-secure-store';
import { getRandomBytes } from 'expo-crypto';
import {
  loadEnvironment, createAthleteSupabaseClient, SupabaseAuthService, SupabaseSyncTransport,
  openAthleteData, createUuidV7Generator,
} from '@athlete/data';

// Metro solo inlinea accesos LITERALES a process.env.EXPO_PUBLIC_*
const env = loadEnvironment({
  EXPO_PUBLIC_ATHLETE_ENV: process.env.EXPO_PUBLIC_ATHLETE_ENV,
  EXPO_PUBLIC_SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL,
  EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
});
if (!env.ok) throw new Error(env.error.message);          // producción bloqueada hasta aprobarla

const supabase = createAthleteSupabaseClient(env.value, secureSessionStorage); // ver §6
const auth = new SupabaseAuthService(supabase.auth, { redirectTo: 'athlete3://auth/callback' });

// Al arrancar, SIEMPRE (con o sin cuenta): identidad local, base cifrada y catálogo incluido.
// Detalle y errores: docs/contracts/guia-integracion-codex.md §2 (fragmentos verificados contra la API real).
let data = await openAthleteData({
  openDatabase: (name) => SQLite.openDatabaseAsync(name),
  secureStore: { getItem: SecureStore.getItemAsync, setItem: SecureStore.setItemAsync, removeItem: SecureStore.deleteItemAsync },
  randomBytes: getRandomBytes,
  accountTransport: new SupabaseSyncTransport(supabase),  // solo se usa con cuenta vinculada
});
const ids = createUuidV7Generator(getRandomBytes);
await data.profile.initialize(Intl.DateTimeFormat().resolvedOptions().timeZone);

// Tras iniciar sesión por primera vez en el dispositivo (state.status === 'signed_in'):
if (data.identity.accountUserId === null) data = await data.adoptLocalData(state.user.id);
await data.sync.syncNow();                                // envía lo pendiente + catálogo + pull
```

En React Native hay que iniciar/detener la renovación automática de tokens con `AppState`
(`supabase.auth.startAutoRefresh()` / `stopAutoRefresh()`), como indica la documentación de Supabase.

## 2. Reglas generales

- Todas las operaciones de los repositorios y de `data.sync` devuelven `Result<T>`: `{ ok: true, value }` o
  `{ ok: false, error: AppError }`. No lanzan. Las de ciclo de vida (`openAthleteData`, `adoptLocalData`,
  `importLegacyStore`) sí lanzan errores tipados (ver la guía de integración, §2).
- **Los `id` los genera la app** (`ids.newId()`) antes de llamar. Reintentar la misma llamada con el mismo `id`
  devuelve `DUPLICATE` en vez de crear dos registros.
- Las escrituras son **locales e inmediatas** (autoguardado). La red no bloquea nunca la UI.
- `null` = dato no registrado. En actualizaciones: campo ausente = no cambiar; `null` = borrar el valor.
- Unidades canónicas: kg, metros, segundos, cm. La conversión para mostrar está en `@athlete/domain/units`.
- Fechas: enviar instantes ISO con zona (`2026-11-03T22:30:00-06:00`) y la zona IANA del atleta.
  `localDate` la calcula el repositorio; no la envía la UI.

## 3. Errores (`AppError.code`)

| Código | Cuándo | Qué hace la UI | Reintentable |
|---|---|---|---|
| `VALIDATION_FAILED` | Datos inválidos. `details.issues[].path` indica el campo | Marcar el campo | No |
| `NOT_FOUND` | El registro no existe (o no es tuyo) | Volver / refrescar | No |
| `DUPLICATE` | Ya existe un registro con ese `id` | Tratar como éxito idempotente | No |
| `INVALID_STATE` | Regla de negocio (p. ej. ya hay una sesión en curso) | Mensaje + acción sugerida | No |
| `UNAUTHENTICATED` | Credenciales incorrectas / sin sesión | Pantalla de login | No |
| `SESSION_EXPIRED` | La sesión no se pudo renovar | Pedir login; **los datos locales siguen** | No |
| `FORBIDDEN` | Operación no permitida | Mensaje genérico | No |
| `RATE_LIMITED` | Demasiadas solicitudes | Esperar | Sí |
| `NETWORK_UNAVAILABLE` / `TIMEOUT` | Sin red | Indicador "sin conexión"; nada se pierde | Sí |
| `STORAGE_FAILURE` | Fallo de SQLite | Mensaje + reportar | Sí |
| `INTERNAL` | Error inesperado | Mensaje genérico | Sí |

`error.message` es seguro para mostrar. Nunca mostrar `details` crudos al usuario.

## 4. Ejemplos por módulo

### Autenticación
```ts
await auth.signUp({ email, password, timeZone });   // → pending_confirmation | signed_in
await auth.signIn({ email, password });             // error genérico si falla (no enumera cuentas)
await auth.requestPasswordReset({ email });         // misma respuesta exista o no la cuenta
await auth.updatePassword({ newPassword });         // tras PASSWORD_RECOVERY o con sesión
await auth.signOut();                               // borra tokens de este dispositivo
const off = auth.onStateChange((s) => { /* signed_in | signed_out | pending_confirmation | password_recovery */ });
```
Antes de `signOut` comprobar `(await data.sync.status()).pendingCount`: si hay cambios sin subir, avisar al usuario.

### Entrenamiento de fuerza
```ts
const s  = await data.sessions.start({ id: newId(), startedAt: new Date().toISOString(), timeZone });
const se = await data.sessions.addExercise({ id: newId(), sessionId, exerciseId });
await data.sessions.logSet({ id: newId(), sessionExerciseId, setType: 'working', weightKg: 100, reps: 5, rir: 2,
                             completedAt: new Date().toISOString() });   // completedAt = serie hecha
await data.sessions.updateSet({ setId, reps: 6 });                      // edición
await data.sessions.complete({ sessionId, endedAt: new Date().toISOString() });
const active  = await data.sessions.getActive();                         // recuperar tras reiniciar la app
const history = await data.sessions.listHistory({ from: '2026-10-01' }, { limit: 20 }); // nextCursor
```
Reglas: una sesión en curso a la vez; `in_progress → completed | discarded`; una completada se puede editar;
una descartada no admite contenido. Una serie sin `completedAt` no cuenta como efectiva.

### Ciclo completo: rutina → sesión → series → historial (MVP)

Una **rutina** es un `TrainingPlan` con uno o más `TrainingDay`; cada día tiene `TrainingDayExercise` con los
objetivos. Todos los objetivos son opcionales (no se inventan).

| Concepto de la UI | Campo |
|---|---|
| Series objetivo | `targetSets` (1–50) |
| Repeticiones objetivo | `targetRepsMin` / `targetRepsMax` (iguales = número fijo; rango = "10–12") |
| Descanso | `targetRestSeconds` (0–3600) |
| RIR objetivo | `targetRir` (mismas reglas que `rir`) |
| Peso objetivo | `targetWeightKg` |

```ts
// 1–3) Rutina
await data.plans.createPlan({ id: planId, name: 'Rutina', description: null, status: 'active', startsOn: null, endsOn: null });
await data.plans.addDay({ id: dayId, planId, position: 0, name: 'Pierna A', kind: 'training', notes: null });
await data.plans.addDayExercise({ id: newId(), trainingDayId: dayId, exerciseId, position: 0,
  targetSets: 3, targetRepsMin: 5, targetRepsMax: 5, targetRestSeconds: 180, targetRir: 2,
  targetWeightKg: null, targetDurationSeconds: null, targetDistanceMeters: null, notes: null });

// 4) Iniciar desde el día: crea la sesión y sus ejercicios (orden del plan) en UNA transacción.
const r = await data.sessions.startFromTrainingDay({ id: newId(), trainingDayId: dayId, startedAt: new Date().toISOString(), timeZone });
//    r.value.exercises[i].trainingDayExerciseId → enlaza con el objetivo para mostrar "3 × 5 · 180 s".
//    No crea series: la UI muestra los objetivos (data.plans.getPlan) y registra lo realmente hecho.

// 5–6) Registrar cada serie realizada
await data.sessions.logSet({ id: newId(), sessionExerciseId, weightKg: 100, reps: 5, rir: 2, completedAt: new Date().toISOString() });

// 7) Finalizar: solo cambia la sesión; las series y ejercicios no se modifican.
await data.sessions.complete({ sessionId, endedAt: new Date().toISOString() });

// 8) Historial y detalle (también tras cerrar y abrir la app)
await data.sessions.listHistory({});        // resumen: ejercicios, series efectivas, volumen
await data.sessions.getDetail(sessionId);   // ejercicios con sus series, en orden
```

`startFromTrainingDay` es una **extensión de `@athlete/data`**: aún no está en la interfaz
`WorkoutSessionRepository` de `@athlete/contracts` (propuesta pendiente de revisar con Codex). Sin ella el flujo
equivalente es `start({ trainingDayId })` + `addExercise({ trainingDayExerciseId })` por ejercicio, que no es atómico.
Errores: `INVALID_STATE` (ya hay una sesión en curso; `details.activeSessionId`), `NOT_FOUND` (día o ejercicio
planificado inexistente/eliminado), `VALIDATION_FAILED`.

#### RIR (repeticiones en reserva)

- Nombre técnico: `rir` (propiedad del contrato y columna `rir` en SQLite y Postgres). No se renombra.
- Significado: cuántas repeticiones **más** podría haber hecho la persona al terminar la serie.
  La UI pregunta en lenguaje natural: **"¿Cuántas repeticiones más podrías haber hecho?"**
- Valores: número de 0 a 10 en pasos de 0.5 (`0`, `0.5`, `1`, … `10`). `0` = ninguna más (fallo).
  Si la UI solo ofrece enteros 0–10, es un subconjunto válido.
- `null` = **no registrado** (nunca se infiere). `0` y `null` son distintos: no usar `rir || null` ni comprobaciones
  de "falsy" en la UI.
- En `updateSet`: `rir` ausente = no cambiar; `rir: null` = borrar el valor; `rir: 0` = cero.
- Fuera de rango, con decimales no permitidos (`2.3`), texto o `NaN` → `VALIDATION_FAILED` (`details.issues`) y no se
  escribe nada. `targetRir` sigue la misma regla.

#### Reglas que el cliente aplica antes de escribir (las mismas que el servidor)

- `position` de días, ejercicios y series: 0–1000.
- `startedAt` de una sesión: posterior a 2000-01-01 y como mucho 2 días por delante del reloj del dispositivo.
- `weightKg`, `targetWeightKg` y `distanceMeters` se guardan con 2 decimales (precisión del servidor). Ejemplo:
  225 lb → `102.06` kg. El valor devuelto por `logSet`/`updateSet` es el guardado: mostrar ese.
- Los instantes (`startedAt`, `completedAt`, …) pueden volver como `…Z` o `…+00:00` según su origen (local o
  servidor). Compararlos con `Date.parse`, nunca como texto.

### Cardio
```ts
await data.cardio.log({ id: newId(), activity: 'run', startedAt, timeZone, durationSeconds: 1800, distanceMeters: 5000,
                        avgHeartRateBpm: 150, maxHeartRateBpm: 172 });
await data.cardio.log({ id: newId(), activity: 'swim', startedAt, timeZone, durationSeconds: 1800, distanceMeters: 1500,
                        swim: { poolType: 'pool', poolLengthMeters: 25, laps: 60, stroke: 'freestyle' } });
// Ritmo/velocidad: paceSecondsPerKm(d, m), speedKmh(d, m), pacePer100mSeconds(d, m) de @athlete/domain
```

### Progreso
```ts
await data.body.logWeight({ id: newId(), measuredAt, timeZone, value: 176.4, inputUnit: 'lb' }); // guarda kg + unidad
await data.body.logMeasurement({ id: newId(), measuredAt, timeZone, site: 'waist', value: 82, inputUnit: 'cm' });
const sets = await data.sessions.listSetsForExercise(exerciseId);
// Récords: computePersonalRecords(sets.value) / newRecordsInSession(sets.value, sessionId) de @athlete/domain
// Semana: summarizeWeek(date, sesiones, cardio, profile.weekStartsOn)
```

### Catálogo, perfil y programas
```ts
await data.exercises.list({ search: 'sentadilla', modality: 'strength' });
await data.exercises.createCustom({ id: newId(), name, modality: 'strength', loadType: 'external' });
await data.profile.update({ displayName, experienceLevel: 'intermediate', loadUnit: 'kg', weekStartsOn: 1 });
await data.plans.createPlan({ id: newId(), name: 'Bloque 1', description: null, status: 'active', startsOn: null, endsOn: null });
await data.plans.addDay({ id: newId(), planId, position: 0, name: 'Empuje', kind: 'training', notes: null });
await data.plans.addDayExercise({ id: newId(), trainingDayId, exerciseId, position: 0, targetSets: 4, /* … */ });
```

### Sincronización
```ts
await data.sync.syncNow();      // al volver a primer plano, al recuperar red y tras escribir (con debounce)
const st = await data.sync.status(); // { pendingCount, conflictCount, rejectedCount, online, lastPushAt, lastPullAt }
const conflicts = await data.sync.listConflicts();
await data.sync.resolveConflict(conflicts[0].mutation.mutationId, 'keep_local' /* o 'keep_remote' */);
```
Un conflicto ocurre si el mismo registro se editó en dos dispositivos. **Nunca se resuelve en silencio**: la UI
debe mostrarlo y dejar elegir. `rejectedCount > 0` indica datos que el servidor no aceptó (mostrar en ajustes).

## 5. Lo que la UI no debe hacer

- Consultar tablas (`supabase.from(...)`) o SQLite directamente.
- Enviar `userId`, `revision`, `createdAt` o `deletedAt`: los gestiona el sistema.
- Guardar contraseñas, tokens o la clave de cifrado fuera de SecureStore. Registrarlos en logs.
- Incluir claves `service_role` / `sb_secret_` (el cliente las rechaza al arrancar).

## 6. Almacenamiento seguro de la sesión

`createAthleteSupabaseClient` recibe un `SecureKeyValueStorage`. Implementarlo con `expo-secure-store`.
Si el valor de la sesión supera el límite de la plataforma, cifrarlo con AES usando una clave aleatoria guardada en
SecureStore y guardar el texto cifrado en almacenamiento normal (patrón "LargeSecureStore" de Supabase).
