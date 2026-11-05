# @athlete/contracts

Fuente compartida de tipos, esquemas Zod, códigos de error y puertos (repositorios y sincronización)
entre backend (Claude) y app móvil (Codex). Ver `docs/contracts/README.md` y ADR-0003.

**Estado:** `0.3.0` — borrador pendiente de revisión por Codex (ver `CHANGELOG.md`). Guía de uso: `docs/contracts/frontend-guide.md`. No cambiar unilateralmente (ADR-0001).

| Módulo | Contenido |
|---|---|
| `common` | UUID, instantes ISO con zona, fecha local, zona IANA, `DataSource`, unidades, `SyncedRecord` |
| `errors` | `ErrorCode`, `AppError`, `Result<T>`, `parseInput` |
| `profile` | Perfil del atleta |
| `exercises` | Catálogo global/personalizado, grupos musculares, equipamiento |
| `programs` | Planes, días y ejercicios planificados |
| `sessions`, `sets` | Sesiones de fuerza, ejercicios de sesión, series |
| `cardio` | Sesiones cardiovasculares y natación |
| `body` | Peso y medidas corporales |
| `nutrition` | Comidas (registro manual) y objetivos |
| `sync` | Mutaciones, push/pull, outbox, conflictos |
| `auth` | Registro, inicio de sesión, recuperación, estado de sesión sin tokens, almacenamiento seguro |
| `repositories` | Interfaces que la UI consume (solo tipos) |

Convenciones:
- Entidades de lectura (`Profile`, `WorkoutSession`…) separadas de entradas (`*Input`).
- `null` = valor desconocido/no registrado. En actualizaciones, campo ausente = no cambiar; `null` = borrar.
- Los campos de servidor (`userId`, `revision`, timestamps) nunca vienen de la UI.
- Unidades canónicas: kg, m, s, cm.

```sh
npm run typecheck -w @athlete/contracts
npm test -w @athlete/contracts
```
