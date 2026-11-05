# Selección y apertura del almacén local

**Implementación:** `packages/data/src/storage/active-store.ts` · **Contrato:** `docs/contracts/contrato-seleccion-almacen.md`
· **Pruebas:** `packages/data/test/unit/active-store.test.ts` · Versión 2 (5-nov-2026): solo almacén oficial.

## 1. Problema
La base local cifrada (`athlete3-<localUserId>.db`) depende de tres datos en el almacén seguro: la identidad, la clave y el marcador. El sistema operativo puede separar los archivos de esos secretos:

- **iOS:** el llavero sobrevive a una desinstalación, pero los archivos no.
- **Android:** Auto Backup puede restaurar archivos sin las claves del Keystore.

Si la app interpretara cualquiera de esos casos como "instalación nueva", crearía otra identidad o clave y dejaría huérfanos los datos.

## 2. Principios
- Se inspecciona antes de abrir. Nada se escribe hasta que la clasificación lo permite.
- Una base existente nunca se trata como nueva.
- Ninguna recuperación borra archivos ni claves. `startNewStore` crea una base con otro nombre y registra las anteriores en `retained`.
- Todo cambio de secreto es comparar-y-escribir.
- Las operaciones se serializan en el proceso.

## 3. Datos que se inspeccionan
| Dato | Dónde |
|---|---|
| Marcador `athlete3.active-store.v1` | `{ v: 1, store: 'official', at, retained[] }` en el almacén seguro |
| Identidad `athlete3.identity.v1` | `{ localUserId, accountUserId }` |
| Clave de la base | `databaseKeyName(<archivo>)` |
| Archivos | `DatabaseFiles.listDatabases()` |

## 4. Tabla de decisión
| Situación | Resultado | Recuperación |
|---|---|---|
| Sin marcador, sin bases oficiales | `fresh-install` → se crea la base y **después** el marcador | — |
| Base de la identidad presente con clave válida | `official-existing` | — |
| Hay bases oficiales pero no identidad | `identity-missing` | `start-new-store` |
| Bases oficiales que no corresponden a la identidad | `identity-missing` | `start-new-store` |
| Marcador presente pero falta la base (iOS tras reinstalar) | `official-missing` | `start-new-store` |
| Base presente sin clave / clave con formato inválido | `database-key-missing` / `secret-invalid` | `start-new-store` |
| La clave no abre la base | `database-unreadable` (antes de migrar el esquema) | `start-new-store` |
| Almacén seguro bloqueado | `secure-store-unavailable` | `retry` |
| Marcador ilegible o de la capa retirada (`legacy`/`migrating`) | `secret-invalid` | `start-new-store` |
| Compilación sin SQLCipher | `sqlcipher-unavailable` | ninguna: nunca se abre sin cifrado |

Si la app se cierra entre crear la base y escribir el marcador, el siguiente arranque ve una "base sin marcador" y la reconoce como `official-existing`. Nunca ocurre lo contrario, "marcador sin base".

## 5. Capa retirada
La capa anterior de la app (`athlete3.db`, `SQLiteTrainingRepository`) y su migración se eliminaron el 5-nov-2026. Si su archivo existe en un dispositivo de desarrollo, se ignora. La tabla local `legacy_quarantine` sigue en el esquema v1 porque es más seguro dejarla vacía que reescribir migraciones de esquema ya versionadas.
