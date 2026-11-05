# ADR-0004 — Separación de ambientes

**Estado:** Propuesta (implementa la decisión obligatoria del propietario del 3 de noviembre de 2026)
**Fecha:** 3 de noviembre de 2026 · **Autor:** Claude
**Relacionado:** ADR-0002, ADR-0003, `docs/architecture/environments.md`

## Contexto

El propietario fijó como obligatoria una arquitectura offline-first y la separación completa de los ambientes
Local, Development, Testing y Production, cada uno con su configuración, credenciales y recursos. Las migraciones
de producción requieren revisión y autorización explícita.

## Decisión

| Ambiente | Backend | Datos | Quién migra | Cómo se selecciona en la app |
|---|---|---|---|---|
| `local` | `supabase start` (Docker) o Postgres local de pruebas | Sintéticos, desechables | Cualquier agente, libremente | `EXPO_PUBLIC_ATHLETE_ENV=local`, host local obligatorio |
| `development` | Proyecto Supabase propio de desarrollo | Sintéticos | Claude, tras revisión del diff | `development`, https obligatorio |
| `testing` | Proyecto Supabase propio para QA/E2E | Sintéticos; reiniciable con aprobación | CI/agente con aprobación | `testing`, https obligatorio |
| `production` | Proyecto Supabase de producción **aún no confirmado** | Reales | Solo con autorización explícita del propietario | `production`; bloqueado en código hasta fijar `APPROVED_PRODUCTION_PROJECT_REF` |

Reglas:

1. **Un proyecto Supabase por ambiente.** Nunca compartir base, claves ni Storage entre ambientes.
2. **La app solo recibe valores públicos** (URL + clave publicable) vía `EXPO_PUBLIC_*`.
   Plantillas en `config/environments/*.env.example`; los `.env` reales están ignorados por git.
3. **Secretos de servidor** (service_role, SMTP, OAuth) solo en el panel/secretos del proyecto o en `env(...)` de
   `supabase/config.toml`; nunca en el repositorio ni en la app.
4. `loadEnvironment` valida: `local` ⇒ host local; resto ⇒ https y host remoto; clave no privilegiada; producción ⇒
   coincide con la referencia aprobada.
5. **Migraciones**: mismas migraciones para todos los ambientes, promovidas en orden local → development → testing →
   production. Producción: diff revisado + reconciliación del historial remoto + aprobación explícita por escrito.
6. La sesión se guarda con una clave por ambiente (`athlete3-auth-<env>`) y la base SQLite local se nombra por
   usuario y ambiente (`localDatabaseName(userId, env)`), de modo que cambiar de ambiente nunca mezcla datos.

## Consecuencias

- Hace falta crear (cuando el propietario lo autorice) los proyectos `development` y `testing`.
- Hasta confirmar la referencia de producción, ningún build puede conectarse a producción.

## Pendiente de decisión del propietario

- Referencias de los proyectos de cada ambiente (el proyecto `npdrjhbkilicuieecbgd` sigue sin confirmar como destino).
- Si `development` y `testing` se crean como proyectos separados o como *branches* de Supabase.
