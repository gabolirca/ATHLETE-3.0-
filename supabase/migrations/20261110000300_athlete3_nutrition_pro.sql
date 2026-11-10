-- =====================================================================================
-- ATHLETE 3.0 · Nutrición Pro: estimación por foto (Claude, 2026-11-09)
--
--   1. meal_entries + ai_estimate (jsonb, opcional): lo que reconoció la IA SIN corregir (platillos, porción,
--      equivalentes SMAE, confianza, modelo). Las kcal/macros de la comida son las que el usuario confirmó.
--      Sirve para medir qué tan bien estima la IA. La FOTO no se guarda en ningún lado.
--   2. athlete3.consume_food_photo_quota(): límite diario de fotos por usuario (lo llama la Edge Function
--      `analizar-comida` con la sesión del usuario, antes de llamar al proveedor de IA).
--
-- Aditiva. IMPORTANTE: aplicar ANTES de instalar la app de feat/nutricion-pro (sube la columna nueva).
-- Repite el cierre de privilegios de 0900.
-- =====================================================================================

alter table athlete3.meal_entries
  add column ai_estimate jsonb check (ai_estimate is null or (jsonb_typeof(ai_estimate) = 'object' and pg_column_size(ai_estimate) <= 16384));

create function athlete3.consume_food_photo_quota(p_max integer default 25)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Tope fijo del servidor: la Edge Function puede pedir menos, nunca más de 100 al día.
  perform athlete3_private.consume_rate_limit('food_photo', least(greatest(coalesce(p_max, 25), 1), 100), 86400);
end;
$$;
revoke all on function athlete3.consume_food_photo_quota(integer) from public;
grant execute on function athlete3.consume_food_photo_quota(integer) to authenticated;

-- ---------------------------------------------------------------------------------
-- Cierre de privilegios y verificación (copia de 0900)
-- ---------------------------------------------------------------------------------
revoke execute on all functions in schema athlete3 from public, anon;
revoke execute on all functions in schema athlete3_private from public, anon;
revoke all on all tables in schema athlete3 from public, anon;
revoke all on all tables in schema athlete3_private from public, anon;
revoke all on all sequences in schema athlete3 from public, anon;
revoke all on all sequences in schema athlete3_private from public, anon;

do $$
declare
  r record;
begin
  -- 1) Toda tabla con RLS habilitado y forzado.
  for r in
    select n.nspname, c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname in ('athlete3', 'athlete3_private') and c.relkind in ('r', 'p')
      and not (c.relrowsecurity and c.relforcerowsecurity)
  loop
    raise exception 'Tabla sin RLS forzado: %.%', r.nspname, r.relname;
  end loop;

  -- 2) Ninguna tabla accesible por anon.
  for r in
    select n.nspname, c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname in ('athlete3', 'athlete3_private') and c.relkind in ('r', 'p', 'v', 'm')
      and (has_table_privilege('anon', c.oid, 'select, insert, update, delete, truncate, references, trigger'))
  loop
    raise exception 'Tabla accesible por anon: %.%', r.nspname, r.relname;
  end loop;

  -- 3) Ninguna función ejecutable por anon (cubre también PUBLIC).
  for r in
    select n.nspname, p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('athlete3', 'athlete3_private') and has_function_privilege('anon', p.oid, 'execute')
  loop
    raise exception 'Función ejecutable por anon: %.%', r.nspname, r.proname;
  end loop;

  -- 4) Ningún privilegio DELETE/TRUNCATE para authenticated (el borrado es lógico).
  for r in
    select n.nspname, c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname in ('athlete3', 'athlete3_private') and c.relkind in ('r', 'p')
      and (has_table_privilege('authenticated', c.oid, 'delete') or has_table_privilege('authenticated', c.oid, 'truncate'))
  loop
    raise exception 'authenticated puede borrar físicamente: %.%', r.nspname, r.relname;
  end loop;

  -- 5) Toda función SECURITY DEFINER con search_path fijado.
  for r in
    select n.nspname, p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('athlete3', 'athlete3_private') and p.prosecdef
      and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) cfg where cfg like 'search_path=%')
  loop
    raise exception 'SECURITY DEFINER sin search_path: %.%', r.nspname, r.proname;
  end loop;

  -- 6) Nada nuevo en public creado por estas migraciones (heurística: objetos con prefijo athlete).
  for r in
    select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname ilike 'athlete%'
  loop
    raise exception 'Objeto ATHLETE en public: %', r.relname;
  end loop;
end $$;
