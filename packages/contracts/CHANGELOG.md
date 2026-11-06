# Changelog — @athlete/contracts

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y [SemVer](https://semver.org/lang/es/).
Mientras la versión sea `0.x`, los contratos son **borrador**: pueden cambiar sin incremento mayor,
pero todo cambio debe registrarse aquí y revisarse con Codex (ADR-0001, regla 4).

## [0.4.0] — 2026-11-05 — Inicio de sesión sin contraseña (Claude, aprobado por el propietario)

Cambio aditivo: no modifica ni endurece nada existente.

### Añadido
- `auth`: `EmailCode`, `RequestEmailCodeInput`, `VerifyEmailCodeInput` e `IdTokenSignInInput`.
- `AuthService.requestEmailCode()`, `verifyEmailCode()` y `signInWithIdToken()`. Sirven para el código por correo (OTP) y para Apple y Google con SDK nativo. Decisión del propietario del 5-nov-2026: Apple, Google y correo.

## [0.3.0] — 2026-11-05 — Integración móvil, atletas híbridos y alineación con el servidor (Claude, pendiente de revisión por Codex)

Aprobado por el propietario el 4-nov-2026 (integración con `@athlete/data` como única persistencia).

### Añadido
- `sessions`: `StartFromTrainingDayInput` y `WorkoutSessionRepository.startFromTrainingDay()`. Inicia desde un día
  planificado en una operación atómica y no crea series. Sustituye a `startWorkout(routineId)` de la app.
- `profile`: `Sport` (`strength`, `running`, `swimming`, `cycling`, `rowing`, `functional_fitness`, `other`) y
  `Profile.sports` (lista sin repetidos, ≤ 7; vacía = no indicado). En el servidor: `athlete3.profiles.sports`
  (migración local `20261105000100`).
- `common`: `Position` (entero 0–1000).

### Cambiado (endurece; alinea con restricciones que el servidor ya aplicaba)
- Todas las posiciones (`TrainingDay`, `TrainingDayExercise`, `SessionExercise`, `StrengthSet` y sus entradas)
  usan `Position`. Antes: cualquier entero ≥ 0.
- `TrainingDayExercise.targetRir` reutiliza `Rir` (0–10 en pasos de 0.5). Antes no exigía el paso.

### Documentado (sin cambio de esquema)
- `weightKg` y `distanceMeters` se guardan con 2 decimales (`@athlete/data` redondea al escribir).
- Se mantienen: estados de sesión `in_progress | completed | discarded` + `deletedAt`; `weightKg` 0–1000;
  `reps` entero 0–1000 (0 = intento fallido); RIR 0–10 en pasos de 0.5.

### Impacto
- Ningún dato existente queda inválido: la capa anterior de la app no tenía RIR objetivo y sus posiciones son
  índices pequeños. El importador valida cada fila con estos esquemas y pone en cuarentena lo que no cumple.

## [0.2.0] — 2026-11-03 — Autenticación, catálogo offline y alineación con el servidor (Claude, pendiente de revisión por Codex)

### Añadido
- `auth`: `SignUpInput`, `SignInInput`, `PasswordResetRequestInput`, `UpdatePasswordInput`, `AuthUser`,
  `AuthState` (sin tokens), interfaz `AuthService` y puerto `SecureKeyValueStorage`.
  Política de contraseña: ≥ 10 caracteres, letras y dígitos, ≤ 72 bytes (igual que `supabase/config.toml`).
- `errors`: código `SESSION_EXPIRED` (la sesión no se pudo renovar; los datos locales siguen disponibles).
- `profile`: `weekStartsOn` (0–6) y `revision`.
- `repositories`: `ProfileRepository.initialize(timeZone)`; `CatalogSnapshot` y `SyncTransport.pullCatalog()`.

### Cambiado
- `OutboxStore` deja de ser contrato compartido: es un detalle interno de `@athlete/data`.
  La UI usa `SyncService` (estado, `syncNow`, conflictos).

## [0.1.0] — 2026-11-03 — Borrador inicial (Claude, pendiente de revisión por Codex)

### Añadido
- `common`: identificadores UUID, instantes ISO 8601 con zona, fecha local, zona horaria IANA,
  procedencia del dato (`DataSource`), metadatos de registro sincronizable.
- `errors`: códigos de error estables, forma `AppError`, `Result<T>`.
- `profile`, `exercises`, `programs`, `sessions`, `sets`, `cardio`, `body`, `nutrition`:
  entidades de lectura y entradas de creación/actualización separadas.
- `sync`: mutaciones idempotentes, push/pull con cursor, tombstones y conflictos explícitos.
- `repositories`: interfaces (puertos) que la app consume; implementaciones en `packages/data` (futuro).
