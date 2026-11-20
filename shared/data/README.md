# @athlete/data

Persistencia local-first de ATHLETE 3.0 (ADR-0003): SQLite como base operativa del dispositivo, outbox,
motor de sincronización y adaptadores de Supabase. **Única persistencia oficial de la app** (decisión del 4-nov-2026).
La app arranca con `openActiveStore()` (abre el almacén oficial o devuelve una recuperación explícita) y usa lo que devuelve y `SupabaseAuthService`. Guías: `docs/contracts/contrato-seleccion-almacen.md`
y `docs/contracts/frontend-guide.md`.

| Ruta | Contenido |
|---|---|
| `src/sql` | Puerto `SqlDatabase` serializado; adaptadores `expo-sqlite` (app) y `node:sqlite` (pruebas, subruta `@athlete/data/node-sqlite`) |
| `src/local` | Esquema SQLite versionado, metadatos de entidades, `LocalStore` (filas + outbox + estado en una transacción) |
| `src/repositories` | Implementaciones locales de los repositorios de `@athlete/contracts` |
| `src/sync` | `SyncEngine` (push/pull, backoff, conflictos) |
| `src/supabase` | Cliente (`athlete3`, SecureStore, PKCE), `SupabaseSyncTransport`, `SupabaseAuthService`, normalización de errores |
| `src/config` | Validación de ambientes (`loadEnvironment`) |
| `src/open.ts` | `openAthleteData`: identidad + base cifrada + catálogo + servicios; `adoptLocalData` |
| `src/identity.ts` | Identidad local sin cuenta (`athlete3.identity.v1`), vínculo con la cuenta y `localOnlyTransport` |
| `src/secure` | `openEncryptedDatabase`: ciclo de vida de la clave SQLCipher en el almacén seguro (`LocalDatabaseError`) |
| `src/catalog` | Catálogo global incluido (idéntico a la semilla del servidor; lo verifica una prueba de integración) |
| `src/storage` | `openActiveStore`: apertura segura del almacén oficial y recuperación explícita sin borrar nada (`docs/architecture/seleccion-almacen.md`) |

```sh
npm test -w @athlete/data                 # unitarias (SQLite real en archivos temporales)
npm run test:integration -w @athlete/data # requiere Postgres local con las migraciones (docs/architecture/testing.md)
```
