# Retiro de la capa legacy — Claude, 5-nov-2026

Rama: `feat/retirar-legacy` (sale de `main` en 1c10fc0). Son tres commits locales y **no se han subido**.

## 1. Decisión
El propietario decidió retirar la capa anterior (`athlete3.db`, `SQLiteTrainingRepository`) **sin migrar**: no hay usuarios publicados y la base del simulador eran datos de prueba. La doble ruta de almacenamiento era la mayor fuente de complejidad del proyecto. Se retira en las dos capas, backend y móvil. Retirarla solo del móvil habría dejado al backend devolviendo `kind: 'legacy'` sin nadie que lo montara.

## 2. Qué se conserva (sin cambios de comportamiento)
Todas las protecciones de la base oficial:
- identidad faltante;
- bases huérfanas;
- `official-missing`, cuando iOS conserva el llavero pero no los archivos;
- clave ausente, inválida o incorrecta;
- marcador con `retained`;
- exclusión en proceso;
- `startNewStore`, que nunca borra.

## 3. Qué se eliminó
- **Backend:**
  - `migrateLegacyStore`, `rollbackMigration` y `keepLegacyStore`;
  - los estados `legacy-existing` y `migration-pending`, y el respaldo con hash;
  - el importador `legacy/codex-v1`, `importLegacyStore`, `legacyImportReport` y `openLegacyDatabaseCopy`;
  - `LEGACY_DATABASE_KEY_NAME` y `LEGACY_OWNER_KEY`: ya no se adopta el UUID legacy;
  - la opción `readOnly` de `openEncryptedDatabase`.
- **Móvil:**
  - `SQLiteTrainingRepository`, `database.ts`, `LocalTrainingProvider`, `ids.ts` y `LegacyDataRuntime`;
  - el hash y la copia de `expoDatabaseFiles`;
  - `newInstallations`.
- **Documentación:** la guía y la coordinación para Codex, y los snippets de verificación, que ya no compilaban contra la API.

## 4. Cambios de contrato (`@athlete/data`, público)
- `ActiveStore` pasa a ser `official | blocked`; ya no existe `legacy`.
- `StoreSelection` queda en `fresh-install | official-existing | open-error`.
- `RecoveryAction` queda en `retry | start-new-store`.
- `DatabaseFiles` solo tiene `listDatabases`.
- `startNewStore` ya no recibe `legacyFailureCode`.
- Contrato y diseño reescritos en `docs/contracts/contrato-seleccion-almacen.md` (v2) y `docs/architecture/seleccion-almacen.md`.

## 5. Pruebas (clon Linux desechable, Node 22.23, npm 11, Postgres 17 local)
- **Typecheck:** 5/5 workspaces.
- **Suites:**

  | Suite | Pruebas |
  |---|---|
  | contracts | 19 |
  | domain | 46 |
  | data | 105 (antes 123) |
  | mobile | 39 (antes 64) |
  | Supabase | 72 |
  | integración | 9 (antes 10) |
  | **Total** | **290** |

- **Las pruebas que bajaron** son exactamente las de la funcionalidad retirada: importador, migración, runtime legacy, hash y copia de archivos, e importación sincronizada.
- **`active-store`** queda con 17 pruebas: se conservaron o adaptaron los 13 escenarios oficiales y hay 4 nuevos:
  - un `athlete3.db` se ignora y no se toca;
  - un marcador legacy bloquea y se recupera;
  - `startNewStore` se rechaza si no hay error que recuperar;
  - dos aperturas simultáneas siguen produciendo una sola identidad.

## 6. Pendiente (no validado)
- **Nada se ha probado en simulador ni en dispositivo.**
- **En tu simulador actual:** si tiene un marcador legacy, verás la pantalla de recuperación con `secret-invalid`, y "Comenzar nuevo almacén" lo resuelve. Si no lo tiene, la app abre una base nueva y vacía. El archivo `athlete3.db` queda en disco sin tocarse.
- **Deuda técnica:** la tabla `legacy_quarantine` sigue vacía en el esquema local v1. Se puede quitar en una futura migración v2 del esquema.

## 7. Siguiente paso recomendado
Validación nativa en un simulador iOS y un emulador Android **desechables**:
- SQLCipher real;
- `allowBackup="false"` en el manifiesto final;
- rutas de `expoDatabaseFiles`;
- cerrar y reabrir la app;
- `official-missing` tras reinstalar en iOS.
