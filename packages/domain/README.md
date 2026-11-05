# @athlete/domain

Lógica de negocio pura (ADR-0002 §7). Sin React Native, Supabase, SQLite ni UI; solo depende de
`@athlete/contracts`. Funciones deterministas: el reloj y los ids se inyectan.

| Módulo | Contenido |
|---|---|
| `units` | kg↔lb, cm↔in, redondeo de presentación |
| `time` | `localDateOf` (fecha deportiva en la zona del atleta), aritmética de calendario, semanas |
| `strength` | Series efectivas, volumen, e1RM (Epley/Brzycki), resumen de sesión |
| `records` | Récords personales por ejercicio y récords nuevos de una sesión |
| `cardio` | Ritmo, velocidad, ritmo/100 m, distancia por largos |
| `session` | Máquina de estados de la sesión, horas, sesión activa única, orden |
| `sync` | Aplicación de cambios remotos, resultados de push, conflictos, backoff |
| `analytics` | Resumen semanal (dashboard) y resumen nutricional diario |

Reglas que el código hace cumplir:
- El calentamiento nunca cuenta como serie efectiva ni suma volumen.
- Sin peso o repeticiones no hay volumen; sin distancia no hay ritmo. No se infieren datos (incluido RIR).
- Las fechas por día salen de `localDate` (zona del atleta), nunca de recortar UTC.

```sh
npm run typecheck -w @athlete/domain
npm test -w @athlete/domain
```
