# Informe: selección del almacenamiento (legacy ↔ oficial) y Auto Backup de Android

**Agente:** Claude · **Fecha:** 5-nov-2026 · **Rama:** `claude/backend-foundation` (`~/GYM/ATHLETE-CLAUDE`), sobre `65aa4ea`
**Entrada:** la revisión independiente y el bundle `integration-mobile-backend.bundle` (`6fa0c61`). El bundle solo se
leyó, en un clon del scratchpad.

> Sin push, merge ni cambios remotos. Sin commits: los cambios están en el árbol de trabajo, pendientes de tu
> autorización. No se abrió, copió ni migró ninguna base del simulador. No se tocaron la rama ni los archivos de
> Codex, que solo se leyeron. No se borró ningún archivo, base ni clave. Todas las pruebas usan directorios
> temporales desechables y un Postgres local desechable.

## 1. Hallazgo de partida

En `6fa0c61`, `RootLayout` elige el almacén con `EXPO_PUBLIC_ATHLETE_DATA_LAYER`. Con la bandera en `official`, en
un dispositivo que ya usa `athlete3.db`, `openAthleteData` habría creado una base oficial vacía: el historial quedaba
oculto y, si la bandera cambiaba, las dos bases podían recibir escrituras. Además, `openAthleteData` creaba una
identidad nueva si faltaba la anterior, aunque hubiera bases en el dispositivo. Ambos problemas quedan resueltos.

## 2. Puntos solicitados

| # | Punto | Resultado |
|---|---|---|
| 1 | Mecanismo oficial de selección | ✅ `openActiveStore` en `packages/data/src/storage/active-store.ts`; diseño en `docs/architecture/seleccion-almacen.md` |
| 2 | Identificar el estado de cada almacén antes de elegir | ✅ `probe` lee el marcador, la identidad, las claves, el dueño legacy y la lista de archivos; `classifyStorage` es una función pura con tabla de decisión (§2.2 del diseño). Nada se abre antes de clasificar |
| 3 | Nunca tratar una base existente como nueva | ✅ `openAthleteData({ expect: 'existing' })` nunca crea identidad ni clave (nuevo código `identity-missing`). Los archivos huérfanos, la identidad que apunta a otra base y la restauración sin claves terminan en `open-error`, no en `fresh-install` |
| 4 | Nunca sobrescribir ni eliminar legacy | ✅ `@athlete/data` nunca abre `athlete3.db`: solo lo copia y calcula su hash. Las pruebas comprueban el SHA-256 del original y que nunca se pasa al abridor |
| 5 | Cinco estados | ✅ `fresh-install`, `legacy-existing`, `official-existing`, `migration-pending` y `open-error` |
| 6 | Clave ausente o incorrecta → parar y ofrecer recuperación explícita | ✅ `open-error` con `recovery[]`. `start-new-store` requiere `confirm: 'start-new-store'`, crea otra base con otra clave y registra las anteriores en `retained`, sin borrar nada |
| 7 | Evitar escrituras simultáneas | ✅ Marcador monótono con comparar-y-escribir (`legacy → migrating → official`, sin vuelta desde `official`), legacy congelada desde `migrating` y verificada por hash, operaciones serializadas en el proceso y un solo provider (§3 del diseño) |
| 8 | Coordinación con el equipo móvil | ✅ `docs/contracts/contrato-seleccion-almacen.md`, con API, tareas del equipo móvil y puntos por acordar. La guía §8 queda sustituida. El propietario lo aprobó como **contrato oficial** para el equipo móvil. Desde el 5-nov-2026, Gemini sustituye a Codex en la parte móvil; el documento no depende del agente |

**Android:** se revisó y documentó en `docs/architecture/android-backup.md`, junto con la tabla de qué se incluye y
qué se excluye.

- Hoy las bases cifradas y SecureStore **ya quedan fuera** del respaldo, pero solo de forma implícita, gracias a las
  reglas que añade `expo-secure-store`.
- Se pide al equipo móvil `allowBackup: false`, mantener las reglas de SecureStore y una comprobación del manifiesto en CI.
- No se introdujo ninguna exportación de claves.

## 3. Cambios

| Archivo | Cambio |
|---|---|
| `packages/data/src/storage/active-store.ts` (nuevo) | Selector, marcador, puerto `DatabaseFiles`, `migrateLegacyStore`, `rollbackMigration`, `keepLegacyStore`, `startNewStore` e `inspectStorage` |
| `packages/data/src/open.ts` | Opción `expect: 'existing'` y método `legacyImportReport()` |
| `packages/data/src/identity.ts` | `readIdentity`, `resolveIdentity(..., { create })` y `replaceIdentity` (comparar-y-escribir sobre el valor crudo) |
| `packages/data/src/secure/encrypted-database.ts` | `requireExisting`: sin clave guardada lanza `database-key-missing` sin abrir el archivo. Nuevo código `identity-missing` |
| `packages/data/src/sql/expo-sqlite.ts`, `legacy/codex-v1.ts`, `index.ts` | `localDatabasePrefix`, `LEGACY_IMPORT_STATE_KEY` y exportaciones |
| `packages/data/test/unit/active-store.test.ts` (nuevo) | 26 pruebas |
| `docs/architecture/seleccion-almacen.md`, `docs/architecture/android-backup.md`, `docs/contracts/contrato-seleccion-almacen.md` (nuevos) | Diseño, respaldo y contrato |
| `docs/contracts/guia-integracion-codex.md`, `verificacion/…snippets.ts`, `packages/data/README.md` | Referencias actualizadas, puerto `expoDatabaseFiles` y `bootstrapStorage` compilables |

Compatibilidad: `openAthleteData` sin `expect` se comporta igual que antes. Las 97 pruebas anteriores de
`@athlete/data` pasan sin cambios.

## 4. Pruebas obligatorias

Archivo: `packages/data/test/unit/active-store.test.ts`.

| Escenario | Pruebas | Qué se comprueba |
|---|---|---|
| Instalación nueva | 3 | Se crea la base y después el marcador, y el segundo arranque la reconoce. Con la política `legacy` no se crea nada. Si la app se cierra entre crear la base y escribir el marcador, el arranque siguiente la trata como existente, no como nueva |
| Base legacy existente | 3 | Se selecciona sin abrirla ni crear identidad ni base oficial. Sin dueño local no se migra. La migración completa importa desde la copia y el original no cambia (SHA-256) |
| Base oficial existente | 5 | Una base creada sin selector se reconoce. Archivo sin identidad → `identity-missing`. Identidad que apunta a otra base → `identity-missing`. `expect: 'existing'` nunca crea nada. Marcador sin archivo → `official-missing` |
| Clave ausente | 3 | Base oficial o legacy sin clave → no se genera ninguna y `start-new-store` conserva el archivo. Almacén seguro bloqueado → `retry`, sin escrituras |
| Clave incorrecta | 2 | Oficial: `database-unreadable` sin ejecutar ninguna sentencia de escritura ni reemplazar la clave. Legacy: la copia no abre, la migración queda pendiente, se vuelve a legacy y se puede empezar de nuevo |
| Migración interrumpida | 3 | Falla la copia → `migration-pending`, nada montado y la reanudación termina. Cierre tras confirmar la importación → vuelta atrás rechazada (`import-committed`) y la reanudación no duplica (outbox = `enqueued`). Legacy modificada mientras estaba congelada → se detiene, y la vuelta atrás funciona si no se importó |
| Restauración y recuperación | 3 | Archivos restaurados sin el almacén seguro → `store-ambiguous`, luego `keep-legacy`, luego `database-key-missing` y por último `start-new-store`, con todos los archivos intactos y en `retained`. Con cuenta vinculada se conserva la cuenta. Un marcador ilegible se reemplaza por comparar-y-escribir |
| Sin escrituras duplicadas | 4 | Tras migrar, legacy no vuelve con ninguna política y el original no se modifica. Dos migraciones simultáneas: una importa y la otra recibe `not-allowed`. Con la migración pendiente no se monta nada. Dos aperturas simultáneas producen una sola identidad, una clave y un marcador |

**Las pruebas detectan fallos.** Se desactivaron a propósito, una por una, ocho protecciones del código (mutación
manual). Después de cada prueba se restauró el archivo y se verificó con `diff`.

| Protección desactivada | Resultado |
|---|---|
| Detección de `store-ambiguous` | 1 prueba falla |
| Bases huérfanas → `identity-missing` | Sobrevivió en el primer intento. Se añadió la prueba “la identidad apunta a otra base” y se simplificó la regla; ahora falla |
| Congelación de legacy (hash) | 1 prueba falla |
| Bloqueo de la vuelta atrás tras importar | 1 prueba falla |
| Serialización en el proceso | 2 pruebas fallan |
| `resolveIdentity({ create: false })` en `openAthleteData` | 2 pruebas fallan |
| `requireExisting` en `openEncryptedDatabase` | 2 pruebas fallan |
| `openActiveStore` abre `official-existing` sin `expect: 'existing'` | **Sobrevive.** Es una defensa redundante: la clasificación ya garantiza que hay identidad y clave antes de abrir. Solo actuaría en una carrera entre la inspección y la apertura. Su efecto lo cubren las dos filas anteriores |

### Ejecución completa (5-nov-2026)

Entorno: macOS 27.2 arm64, Node v22.23.4, TypeScript 6.0.3, Vitest 4.1.12 y PostgreSQL 16.15 local desechable
(`local-postgres.sh`).

| Comando | Resultado |
|---|---|
| `npm run typecheck --workspaces --if-present` | 0 errores (4 workspaces) |
| `npm test --workspaces --if-present` (sin Postgres) | contracts 19 ✓ · domain 46 ✓ · **data 123 ✓** (97 + 26) · supabase-tests ✗ por falta de servidor, como se esperaba |
| `local-postgres.sh start` + `DATABASE_URL=… npm run test:db` + `stop` | supabase 72 ✓ · integración de data 10 ✓ |
| Fragmentos de la guía, incluido `expoDatabaseFiles`/`bootstrapStorage` | Compilan contra los tipos de Expo SDK 58 (`expo-file-system`, `expo-sqlite`, `expo-secure-store` y `expo-crypto`, leídos de `ATHLETE-CODEX/node_modules`). Una variante alterada a propósito sí falla |

**Total: 270/270 en verde.**

## 5. Qué es real y qué es simulado

| Área | Real | Simulado |
|---|---|---|
| Selector, marcador, transiciones e importación | Código de producción sobre SQLite real (`node:sqlite`) y archivos reales en directorios temporales | — |
| Copia y hash de archivos | `fs` de Node con `COPYFILE_EXCL` | El puerto Expo (`expo-file-system`) solo se compiló; no se ejecutó |
| Cifrado | — | `FakeCipherDatabase` (igual que en las fases anteriores) |
| Almacén seguro | — | `MemorySecureStore` |
| Reglas de Android Auto Backup | Lectura del código de los plugins instalados | Sin `prebuild`, sin compilación y sin emulador |

**No se puede afirmar que el flujo funcione en un dispositivo** hasta validarlo en un simulador o emulador
desechable: SQLCipher real, SecureStore, `File.copy` de `-wal`/`-shm`, la ruta de `openBackupDatabase` y el
manifiesto generado.

## 6. Decisiones y pendientes

1. **Autorizar el commit** de estos cambios en `claude/backend-foundation`. Están sin confirmar.
2. **iOS: reinstalación con el llavero conservado.** El marcador sobrevive, así que el arranque muestra
   `official-missing` en lugar de abrir una base vacía. Es la opción conservadora; tú decides si se acepta así.
3. **Equipo móvil:** revisar el contrato (§5 de `contrato-seleccion-almacen.md`), integrar el provider y la pantalla de
   recuperación, y aplicar `allowBackup: false` con la comprobación del manifiesto.
4. **Validación nativa en un simulador o emulador desechable**, nunca sobre la base actual.
5. **Límite conocido:** una compilación anterior al selector no respeta el marcador. Regla de publicación: no
   volver a una compilación sin selector.
6. **iOS: respaldo de iCloud** de `Documents/SQLite` y accesibilidad del llavero. Queda fuera del alcance pedido y
   está anotado en `android-backup.md` §4.
