# Contrato: selección del almacén local

**Responsable:** Claude (implementador principal) · **Versión 2, 5-nov-2026** · **Estado:** vigente
**Diseño:** `docs/architecture/seleccion-almacen.md` · **Respaldo Android:** `docs/architecture/android-backup.md`

> La versión 1 contemplaba la capa anterior (legacy, `athlete3.db`) y su migración. Se retiró el 5-nov-2026 por
> decisión del propietario: no había usuarios publicados y no se conservaron sus datos.

## 1. API (`@athlete/data`)

```ts
openActiveStore(options: OpenActiveStoreOptions): Promise<ActiveStore>   // nunca lanza
//   ActiveStore = { kind: 'official', selection, data: OpenedAthleteData }
//               | { kind: 'blocked',  selection: OpenErrorSelection }   // pantalla de recuperación
inspectStorage(options): Promise<StoreSelection>                         // diagnóstico: no abre ni escribe
startNewStore(options & { confirm: 'start-new-store' }): Promise<ActiveStore>  // lanza ActiveStoreError si no corresponde
```

`OpenActiveStoreOptions` = `OpenAthleteDataOptions` + `files: DatabaseFiles`.
`DatabaseFiles` solo tiene `listDatabases()`. La app lo implementa en `apps/mobile/src/data/expoDatabaseFiles.ts`.

## 2. Estados

| `selection.state` | Qué hace la app |
|---|---|
| `fresh-install` | Monta `OfficialTrainingProvider` (base nueva creada). |
| `official-existing` | Monta `OfficialTrainingProvider`. |
| `open-error` | Muestra `code`, `message` y un botón por cada acción de `recovery`. |

Acciones de `recovery`:

- **`retry`:** vuelve a llamar a `openActiveStore`.
- **`start-new-store`:** pide confirmación explícita. La base anterior se conserva, pero deja de mostrarse. Con `accountLinked: true` se informa que los datos sincronizados se recuperarán al iniciar sesión.

## 3. Garantías del backend
- Nunca se crea una identidad ni una clave para una base que ya existe (`openAthleteData({ expect: 'existing' })`).
- Nunca se borra ni sobrescribe un archivo o un secreto: todas las transiciones son comparar-y-escribir. Las bases abandonadas quedan en `retained`.
- Un `athlete3.db` de la capa retirada se ignora: nunca se abre ni se toca.
- Selección y recuperación se serializan en el proceso.
- Pruebas: `packages/data/test/unit/active-store.test.ts`.

## 4. Obligaciones de la app
1. **Una sola apertura por proceso:** `AthleteDataProvider` comparte la promesa y cuenta *leases*.
2. **`startNewStore` nunca deja una promesa rechazada en la UI:** el error se expone como `actionError`, y la ejecución es única.
3. **Android:** `"allowBackup": false` en `app.json`. Hay que comprobarlo en el manifiesto final (`android-backup.md` §3).
