# Flujo de ramas

**Decisión del propietario, 5-nov-2026.**

| Rama | Para qué | Quién escribe | Supabase |
|---|---|---|---|
| `main` | Desarrollo. Todo se integra aquí y siempre debe compilar y pasar `npm run test:all`. | PR desde `feat/*` o `fix/*` | Proyecto de desarrollo |
| `prod` | Lo que usan los usuarios reales. Solo avanza desde `main`, con un PR revisado. | Solo Gabo | Proyecto de producción |
| `feat/<tema>`, `fix/<tema>` | Trabajo corto (días, no semanas). | El implementador | Local |

## Reglas
1. Toda rama de trabajo sale de `main` y vuelve a `main` por PR. Después del merge **se borra**, local y remota.
2. `prod` nunca recibe commits directos. Se actualiza con un PR `main → prod`, solo cuando todo esté verde.
3. Un solo worktree de trabajo (`~/GYM/ATHLETE`). No hay ramas por agente.
4. Los auditores no hacen commits.
5. Nada de copias de código en `docs/`: se enlaza al archivo real.
6. Cada salida a producción lleva un tag `vX.Y.Z` sobre `prod`.
