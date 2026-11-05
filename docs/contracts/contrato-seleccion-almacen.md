# Contrato: selección del almacenamiento e integración del provider

**De:** backend (Claude Code) · **Para:** equipo móvil · **Fecha:** 5-nov-2026 · **Estado:** **contrato oficial** para el equipo móvil (aprobado por el propietario el 5-nov-2026)

> Responsabilidades: el backend (Claude Code) es dueño de contratos, dominio, persistencia, identidad, SQLCipher y
> sincronización. La integración en `apps/mobile` corresponde al equipo móvil, sea cual sea el agente asignado (desde
> el 5-nov-2026, Gemini sustituye a Codex).
**Diseño:** `docs/architecture/seleccion-almacen.md` · **Respaldo Android:** `docs/architecture/android-backup.md`

## 1. Qué cambia

La variable `EXPO_PUBLIC_ATHLETE_DATA_LAYER` **deja de decidir** qué almacén se monta. Lo decide `openActiveStore`
según el estado del dispositivo. La variable pasa a ser, como mucho, la aprobación de la migración
(`migrationApproved`).

## 2. API (`@athlete/data`)

```ts
openActiveStore(options: OpenActiveStoreOptions): Promise<ActiveStore>
//   ActiveStore = { kind: 'official', selection, data: OpenedAthleteData }
//               | { kind: 'legacy', selection }            // montar SQLiteProvider + athlete3.db (capa anterior)
//               | { kind: 'blocked', selection }           // pantalla de recuperación con selection.recovery
inspectStorage(options): Promise<StoreSelection>            // diagnóstico: no abre ni escribe nada
migrateLegacyStore(options & { openBackupDatabase, deviceTimeZone, sha256 }): Promise<MigrationResult>  // lanza ActiveStoreError
rollbackMigration(options): Promise<StoreSelection>         // lanza ActiveStoreError (import-committed, …)
keepLegacyStore(options): Promise<StoreSelection>
startNewStore(options & { confirm: 'start-new-store'; legacyFailureCode?: string }): Promise<ActiveStore>
```

`OpenActiveStoreOptions` contiene lo mismo que `OpenAthleteDataOptions`, más:

- `files: DatabaseFiles`;
- `newInstallations?: 'official' | 'legacy'`, por defecto `'official'`.

Nada de esto lanza excepciones salvo `migrateLegacyStore`, `rollbackMigration`, `keepLegacyStore` y
`startNewStore`: ante una precondición incumplida lanzan `ActiveStoreError { code, recovery }`.

## 3. Lo que implementa el equipo móvil

1. **El puerto `DatabaseFiles`** con `expo-file-system`. La referencia compilada está en
   `verificacion/guia-integracion-codex.snippets.ts` (`expoDatabaseFiles`). Los respaldos van en
   `Paths.document/athlete3-backups/`.
2. **`AthleteDataProvider`** cambia `openAthleteData(...)` por `openActiveStore({ ..., files })` y expone
   `result.kind`. Se mantiene `sharedOpening` y el contador de *leases* del provider actual: así hay una sola instancia por proceso.
3. **`RootLayout`** monta según `kind`:
   - `official` → `OfficialTrainingProvider`;
   - `legacy` → `LegacyDataRuntime`;
   - `blocked` → pantalla de recuperación.

   **Nunca monta los dos.** Si el marcador ya es `official`, se monta `official` aunque la bandera diga otra cosa.
4. **Migración:** solo si `migrationApproved` y el estado es `legacy-existing` con `migratable: true`, o
   `migration-pending`. Se llama a `migrateLegacyStore` **antes** de montar la capa legacy y **antes** de
   `profile.initialize`. Mientras dura, se muestra un estado de progreso; al terminar, el resultado incluye `report`
   (con la cuarentena).
5. **Pantalla de recuperación:** muestra `selection.code`, `selection.message` y un botón por cada acción de
   `selection.recovery`. Con `accountLinked` se muestra el texto “tus datos sincronizados se recuperarán al iniciar
   sesión”.
   - `start-new-store` exige confirmación explícita, con un texto claro: la base anterior se conserva pero dejará de
     mostrarse.
   - `retry` vuelve a llamar a `openActiveStore`.
6. **Fallo de la capa legacy al abrir** (`database-unreadable` o `database-key-missing` de
   `apps/mobile/src/data/database.ts`): se ofrece `start-new-store` llamando a
   `startNewStore({ ..., confirm: 'start-new-store', legacyFailureCode: error.code })`. No se ofrece en ningún otro
   caso de error legacy.
7. **Android:** `"allowBackup": false` en `app.json` y la comprobación del manifiesto en CI
   (`android-backup.md` §3).

## 4. Garantías que da el backend

- Nunca se abre, escribe, renombra ni borra `athlete3.db` ni su clave (`athlete3.sqlite.sqlcipher-key.v1`).
- Nunca se crea una identidad ni una clave para una base que ya existe (`openAthleteData({ expect: 'existing' })`).
- Nunca se sobrescribe un secreto: todas las transiciones son comparar-y-escribir.
- Las bases abandonadas en una recuperación quedan registradas en el marcador (`retained`).
- 26 pruebas (`packages/data/test/unit/active-store.test.ts`) cubren los ocho escenarios obligatorios.

## 5. Pendiente de acordar con el equipo móvil

1. Confirmar los nombres de estado y de acción (`StoreSelection`, `RecoveryAction`) para los textos de la UI.
2. **Validación en simulador o emulador desechable** (nunca sobre la base actual del simulador):
   - la ruta de `openBackupDatabase` (`new Directory(...).uri` frente a una ruta sin `file://`);
   - la copia de `-wal`/`-shm` con `File.copy`;
   - el hash con `File.arrayBuffer()`. Carga el archivo entero en memoria: es aceptable con los tamaños del MVP y
     se revisará si las bases crecen.
3. La política de transición para instalaciones nuevas (`newInstallations`): `'official'` en cuanto la UI oficial
   cubra las pantallas actuales.
4. Que la guía §8 (`active-store` = `legacy | new`) quede sustituida por este contrato. Ya está actualizada en esta
   rama.
