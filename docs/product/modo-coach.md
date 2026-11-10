# Modo coach (contratos 0.9.0)

## Vínculos por alcance
- Cada vínculo profesional ↔ atleta tiene alcance `nutrition` (nutriólogo) o `training` (coach).
- Un atleta puede tener un nutriólogo y un coach a la vez (uno activo por alcance); cada uno solo ve su parte.
- El código de invitación lleva su alcance: el atleta lo escribe en Ajustes → Con mi coach (o en Nutrición → Con mi nutriólogo).

## Activar el rol de coach (admin, SQL Editor)
```sql
insert into athlete3_private.user_roles (user_id, role)
select id, 'coach' from auth.users where email = 'correo@del-coach.com'
on conflict do nothing;
```

## Qué hace el coach (Entrenar → Modo coach, o Ajustes)
- **Invitar:** genera un código (un uso, 7 días).
- **Ver progreso (solo lectura):** adherencia de 4 semanas contra las sesiones planeadas de su programa activo,
  sesiones de 28 días (series, volumen, RPE), cardio y mejores levantamientos (1RM estimado). No ve nutrición.
- **Asignar programas:** arma el programa o la rutina en su propia app (con los editores y plantillas de siempre)
  y lo asigna. El servidor copia plan, días, bloques y ejercicios a la cuenta del atleta, marcado "De tu coach";
  le llega por su sync. Solo ejercicios del catálogo global. Puede retirarlo (borrado lógico).
- **Comentarios:** en una sesión, en un programa o mensaje general. Le llegan al atleta por sync; el atleta no puede
  crearlos ni editarlos. Se ven en la sesión del historial, en el programa y en "Con mi coach".

## Técnico
- Migración `20261112000100`: `pro_links.scope`, `pro_invites.scope`, rol `coach`, `training_plans.assigned_by(_name)`
  (trigger de origen), tabla `coach_comments` (entidad `coach_comment`, solo escribible por RPC) y RPC `coach_*`.
- Pruebas: `supabase/tests/db/coach.test.ts`, `packages/data/test/integration/coach-sync.test.ts`, `apps/mobile/src/coach/CoachScreens.test.tsx`.
