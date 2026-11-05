# Selección del almacenamiento activo (legacy ↔ oficial)

**Dueño:** backend (`packages/data/src/storage/active-store.ts`) · **Integración en la app:** equipo móvil
(`docs/contracts/contrato-seleccion-almacen.md`) · **Pruebas:** `packages/data/test/unit/active-store.test.ts`

## 1. Problema

En la integración `6fa0c61`, la app elige el almacén con una variable de compilación
(`EXPO_PUBLIC_ATHLETE_DATA_LAYER === 'official'`) sin mirar el dispositivo. Esto tiene tres riesgos:

1. Con la bandera activada en un dispositivo que ya usa `athlete3.db`, `openAthleteData` crea una base oficial vacía.
   El historial queda oculto: una base existente se trata como instalación nueva.
2. Si la bandera se cambia en un sentido y luego en el otro, las dos bases reciben escrituras.
3. Si un dispositivo restaurado tiene los archivos pero no las claves ni la identidad, `resolveIdentity` crea una
   identidad nueva y, con ella, una base nueva vacía al lado de la restaurada.

## 2. Diseño

Hay una sola función de arranque, `openActiveStore`, que se ejecuta antes de montar cualquier provider.

1. **Inspecciona** sin abrir ninguna base. Lee:
   - el marcador `athlete3.active-store.v1`;
   - la identidad;
   - la clave y el dueño de la base legacy;
   - la clave de la base oficial esperada;
   - la lista de archivos del directorio de bases, mediante el puerto `DatabaseFiles`.
2. **Clasifica** con una función pura (`classifyStorage`) en uno de cinco estados.
3. **Actúa:**
   - `official` → abre la base oficial. En una base existente usa `expect: 'existing'`, que nunca crea identidad ni
     clave.
   - `legacy` → no abre nada; la app monta la capa anterior.
   - `blocked` → no monta nada; la app muestra las acciones de recuperación.

La base legacy **nunca** se abre desde `@athlete/data`. Solo se leen sus bytes para copiarla y calcular su hash.

### 2.1 Estados

| Estado | `active` | Cuándo |
|---|---|---|
| `fresh-install` | `official` (o `legacy` con la política de transición `newInstallations: 'legacy'`) | No hay bases ni marcador |
| `legacy-existing` | `legacy` | Hay `athlete3.db` con su clave. `migratable` indica si existe el dueño `device:<uuid>` |
| `official-existing` | `official` | La base oficial de la identidad existe y tiene su clave. `legacy: 'retained-read-only'` si `athlete3.db` sigue en el dispositivo |
| `migration-pending` | `null` | El marcador está en `migrating`: hay una migración iniciada y no terminada |
| `open-error` | `null` | Falta algo o algo es contradictorio. Incluye `code`, `store`, `recovery[]` y `accountLinked` |

### 2.2 Tabla de decisión

| Marcador | Archivos y secretos | Resultado |
|---|---|---|
| `migrating` | cualquiera | `migration-pending` → `resume-migration`, `rollback-to-legacy`, `start-new-store` |
| `official` | identidad, archivo y clave | `official-existing` |
| `official` | sin identidad | `open-error identity-missing` |
| `official` | archivo de la identidad ausente, pero hay otras bases oficiales | `open-error identity-missing` |
| `official` | sin archivo y sin otras bases | `open-error official-missing` |
| `official` | sin clave, o clave con formato inválido | `open-error database-key-missing` / `secret-invalid` |
| `legacy` | `athlete3.db` ausente | `open-error legacy-missing` |
| `legacy` o ninguno | `athlete3.db` sin clave, o clave con formato inválido | `open-error database-key-missing` / `secret-invalid` (`store: 'legacy'`) |
| `legacy` o ninguno | `athlete3.db` con clave | `legacy-existing` |
| ninguno | `athlete3.db` **y** bases oficiales | `open-error store-ambiguous` → `keep-legacy` |
| ninguno | solo bases oficiales | Las mismas reglas que con el marcador `official`; si todo está, se registra el marcador |
| ninguno | nada | `fresh-install` |

Los errores de lectura del almacén seguro (`secure-store-unavailable`) y los marcadores o identidades ilegibles
(`secret-invalid`) se detectan antes de clasificar. Ningún error de esta tabla escribe nada.

La clave **incorrecta** solo se detecta al abrir. Por eso `openActiveStore` convierte cada `LocalDatabaseError` de
`openAthleteData` en un `open-error`:

- en la base oficial: `database-unreadable` antes de cualquier migración de esquema;
- en la base legacy: al abrir la copia durante la migración, o lo informa la propia capa legacy en su arranque.

### 2.3 Recuperación (siempre explícita, nunca destructiva)

| Acción | Función | Qué hace |
|---|---|---|
| `retry` | `openActiveStore` | Vuelve a intentarlo. Se ofrece con `secure-store-unavailable` y `secret-conflict` |
| `resume-migration` | `migrateLegacyStore` | Retoma la migración; es idempotente |
| `rollback-to-legacy` | `rollbackMigration` | Pasa de `migrating` a `legacy`. Solo es posible si la importación **no** se confirmó (si se confirmó, falla con `import-committed`) |
| `keep-legacy` | `keepLegacyStore` | Ante `store-ambiguous`, sigue con legacy. Las bases oficiales quedan intactas |
| `start-new-store` | `startNewStore({ confirm: 'start-new-store' })` | Crea una base nueva con otro `localUserId`, y por tanto con otro archivo y otra clave. Conserva la cuenta vinculada si la había (`accountLinked`: la sync restaura lo que esté en el servidor). Registra en `retained` las bases anteriores; **no borra, no renombra y no sobrescribe ningún archivo ni ninguna clave** |

`sqlcipher-unavailable` no ofrece ninguna acción: es un error de compilación, y nunca se abre ni se crea nada sin
cifrado.

## 3. Exclusión de escrituras

La regla es: nunca puede haber dos bases que reciban escrituras.

1. **Una sola fuente de verdad.** El marcador `athlete3.active-store.v1` del almacén seguro solo avanza en este
   orden:

   ```
   (sin marcador) ─┬─▶ legacy ─▶ migrating ─▶ official
                   └─────────────────────────▶ official
   migrating ─▶ legacy     solo si la importación no se confirmó (rollbackMigration)
   cualquiera ─▶ official  solo con startNewStore
   ```

   Cada transición es un comparar-y-escribir sobre el valor crudo (`storeNewSecret` / `replaceSecret`). Si otro
   proceso lo cambió, falla con `secret-conflict` y no escribe nada. **No existe la transición `official → legacy`.**
2. **Legacy congelada desde `migrating`.** En ese estado el selector no devuelve ningún almacén activo
   (`migration-pending` → `blocked`), y la migración comprueba que los SHA-256 de `athlete3.db`, `-wal` y `-shm`
   siguen siendo los registrados al copiar. Si cambiaron, se detiene con `legacy-changed-during-migration`.
3. **La bandera de compilación deja de decidir.** `newInstallations` solo afecta a las instalaciones nuevas. Con el
   marcador en `official`, el resultado es `official` aunque la compilación prefiera legacy.
4. **Serialización en el proceso.** `openActiveStore`, `migrateLegacyStore`, `rollbackMigration`,
   `keepLegacyStore`, `startNewStore` e `inspectStorage` se ejecutan en cola. Si se lanzan dos migraciones
   simultáneas, una importa y la otra recibe `not-allowed`.
5. **Un solo provider.** La app monta `AthleteDataProvider` **o** la capa legacy según `result.kind`, nunca las dos.
   Dentro del proceso hay una sola instancia de `OpenedAthleteData`: el `sharedOpening` del provider actual se
   mantiene.
6. **Importación sin duplicados.** La importación es una sola transacción, se verifica y se identifica por huella.
   Al reanudarla tras confirmar, devuelve `alreadyImported: true`, y el outbox queda igual a `report.enqueued`
   (comprobado en la prueba).

**Límite:** una compilación **anterior** al selector no consulta el marcador. Si se instala una versión antigua
encima de una migrada, podría volver a escribir en `athlete3.db`. Lo mitiga el punto 2 (una migración en curso
detecta el cambio), pero no lo impide. Regla de publicación: no distribuir compilaciones sin selector a dispositivos
que ya tengan uno con selector.

## 4. Migración (`migrateLegacyStore`)

Requiere `legacy-existing` con `migratable`, o `migration-pending`. Pasos:

1. Pasa el marcador de `legacy` a `migrating` con `backupDir = legacy-<timestamp>`.
2. Copia byte a byte `athlete3.db` y sus archivos `-wal`, `-shm` y `-journal` a
   `<respaldos>/<backupDir>/`. Para cada archivo comprueba: hash del origen antes, hash de la copia y hash del origen
   después. Si un archivo ya existe en el respaldo con otro contenido, falla con `backup-conflict` y no lo
   sobrescribe. Los hashes se guardan en el marcador.
3. Abre **solo la copia** con la clave original, en modo de solo lectura (`openLegacyDatabaseCopy`).
4. Comprueba el dueño: si la copia tiene datos pero ninguno de `device:<localUserId>`, falla con
   `legacy-owner-mismatch`. Así nunca se da por buena una importación de cero filas.
5. Ejecuta `importLegacyStore`: una transacción, verificada e idempotente.
6. Pasa el marcador de `migrating` a `official`, con `migratedFrom: { backupDir, fingerprint }`.

Si falla en cualquier paso, el marcador queda en `migrating` y la app no monta ningún almacén hasta que el usuario
elija una de las recuperaciones de §2.3. La migración **no se ejecuta sola**: la app la llama solo si el propietario
la aprobó (bandera de migración). Nunca se ha ejecutado sobre la base del simulador.

## 5. Casos de restauración

| Situación | Resultado |
|---|---|
| iOS: se reinstala la app y el llavero se conserva (comportamiento de iOS), pero los archivos no | `official-missing` o `legacy-missing` → `start-new-store`. **Decisión para el propietario:** es conservador; una reinstalación muestra la pantalla de recuperación en lugar de abrir una base vacía en silencio |
| Android: archivos restaurados sin almacén seguro (solo si cambian las reglas de respaldo, ver `android-backup.md`) | `store-ambiguous`, `identity-missing` o `database-key-missing` → recuperación explícita; los archivos quedan en `retained` |
| Con cuenta vinculada | `accountLinked: true`; después de `start-new-store`, la sync trae lo que esté en el servidor |

No hay exportación de claves. Cualquier estrategia de ese tipo requiere una revisión de seguridad previa (ver
`android-backup.md` §4).

## 6. Puerto de archivos (`DatabaseFiles`)

Lo implementa la app con `expo-file-system`. La implementación de referencia está en
`docs/contracts/verificacion/guia-integracion-codex.snippets.ts` y se compila contra Expo SDK 58.

- `listDatabases()`: nombres del directorio `SQLite.defaultDatabaseDirectory` (Android `files/SQLite`, iOS
  `Documents/SQLite`).
- `hashDatabaseFile(name)` / `hashBackupFile(dir, name)`: SHA-256, o `null` si el archivo no existe.
- `copyToBackup(name, dir)`: copia a `<Paths.document>/athlete3-backups/<dir>/<name>`; debe fallar si el destino
  existe.

Ninguna de estas operaciones abre una base con SQLite.
