# Ambientes — guía operativa

Decisión: ADR-0004. Este documento explica cómo usar cada ambiente.

| Ambiente | Arranque | Plantilla |
|---|---|---|
| local | `supabase start` (Docker) o el Postgres de pruebas (`docs/architecture/testing.md`) | `config/environments/local.env.example` |
| development | Proyecto Supabase de desarrollo (por crear, con aprobación) | `config/environments/development.env.example` |
| testing | Proyecto Supabase de QA (por crear, con aprobación) | `config/environments/testing.env.example` |
| production | Bloqueado hasta aprobar la referencia del proyecto | `config/environments/production.env.example` |

## Configuración local de Supabase

`supabase/config.toml` (solo afecta al stack local): Data API expone **solo** `athlete3`; contraseñas ≥ 10 con letras
y dígitos; confirmación de correo; cambio de contraseña seguro; refresh tokens rotativos; límites de Auth.
Al crear los proyectos remotos se deben replicar estos ajustes en el panel (Auth y Data API → *Exposed schemas*).

## Promoción de migraciones

1. Escribir la migración en `supabase/migrations/` (terminar siempre con el bloque de 0900 o reubicar 0900 al final).
2. `npm run test:db` en local (debe pasar todo).
3. Development → testing → production. En cada ambiente remoto: `supabase migration list` (solo lectura) para
   reconciliar el historial, revisar el diff y aplicar **solo con autorización explícita**.
4. Producción: además, copia de seguridad verificada y ventana acordada.

Prohibido sin autorización: `supabase db push`, `migration repair`, `db reset` en cualquier proyecto remoto.
