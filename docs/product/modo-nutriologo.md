# Plan nutricional SMAE y modo nutriólogo (contratos 0.8.0)

## Para el usuario: tres opciones (Nutrición)
1. **Cargar mi plan.** Captura el plan de su nutriólogo por tiempos de comida (hora, raciones por grupo del SMAE y nota).
   Las kcal y macros se calculan con la tabla SMAE y quedan como meta diaria ("De tu nutriólogo").
2. **Con mi nutriólogo.** Escribe el código de su nutriólogo; él le asigna el plan desde su cuenta y le llega al sincronizar.
3. **Plan que calcula la app.** Mifflin-St Jeor con aviso aceptado (sin cambios).

## Para el nutriólogo
- Su cuenta necesita el rol `nutritionist`. Lo otorga un admin en SQL (Supabase → SQL editor):
  ```sql
  insert into athlete3_private.user_roles (user_id, role)
  select id, 'nutritionist' from auth.users where email = 'correo@del-nutriologo.com'
  on conflict do nothing;
  ```
- En Nutrición aparece **Modo nutriólogo**: genera códigos (un uso, 7 días), ve sus clientes y les asigna o ajusta el plan.
- Solo ve nombre, correo y plan de sus clientes vinculados. Cualquiera de los dos puede terminar el vínculo;
  los planes ya asignados se quedan con el cliente.

## Técnico
- Migración `20261111000100`: tabla `athlete3.nutrition_plans` (entidad de sync `nutrition_plan`), rol, `pro_links`,
  `pro_invites` y RPC `pro_*` (SECURITY DEFINER). El origen `assigned` solo lo escribe el servidor (trigger).
- Si el cliente edita un plan asignado, el local elimina el asignado y crea uno propio.
- Pruebas: `supabase/tests/db/nutrition-pro.test.ts`, `packages/data/test/integration/nutrition-plan-sync.test.ts`.
