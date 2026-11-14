-- =====================================================================================
-- ATHLETE 3.0 — Nutrición: registro manual de comidas y objetivos diarios (Claude, 2026-11-06)
--
--   1. athlete3.meal_entries      → contrato `MealEntry` (entidad de sync `meal_entry`).
--   2. athlete3.nutrition_targets → contrato `NutritionTarget` (entidad de sync `nutrition_target`).
--   3. sync_table / sync_pull     → se reemplazan para incluir las dos entidades nuevas
--                                   (copia exacta de 0600 + 2 entradas; nada más cambia).
--   4. Cierre de privilegios y verificación (copia de 0900, como exige esa migración).
--
-- Aditiva: no modifica ni borra datos existentes. Calorías y macros son opcionales (no se inventan valores).
-- La estimación por foto (IA) NO está aquí: tendrá su propia migración cuando se diseñe, con la estimación
-- original guardada aparte de lo que el usuario confirme.
-- Escalas: kcal numeric(7,1) y gramos numeric(6,1); el cliente redondea a 1 decimal antes de escribir.
-- =====================================================================================

create table athlete3.meal_entries (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  consumed_at timestamptz not null,
  time_zone text not null check (athlete3_private.is_valid_time_zone(time_zone)),
  local_date date not null,
  meal_type text not null check (meal_type in ('breakfast', 'lunch', 'dinner', 'snack', 'other')),
  description text not null check (length(btrim(description)) between 1 and 500),
  energy_kcal numeric(7, 1) check (energy_kcal is null or energy_kcal between 0 and 20000),
  protein_g numeric(6, 1) check (protein_g is null or protein_g between 0 and 2000),
  carbs_g numeric(6, 1) check (carbs_g is null or carbs_g between 0 and 2000),
  fat_g numeric(6, 1) check (fat_g is null or fat_g between 0 and 2000),
  source text not null default 'manual' check (source in ('manual', 'imported', 'estimated', 'ai_generated', 'device')),
  notes text check (notes is null or length(notes) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  revision bigint not null default 1,
  change_seq bigint not null default 0,
  last_mutation_id uuid,
  constraint meal_entries_local_date_matches check (local_date = (consumed_at at time zone time_zone)::date),
  constraint meal_entries_sane_dates check (consumed_at > '2000-01-01' and consumed_at < now() + interval '2 days')
);
create index meal_entries_day_idx on athlete3.meal_entries (user_id, local_date desc, consumed_at);
select athlete3_private.secure_synced_table('athlete3.meal_entries');

-- Objetivos diarios vigentes desde una fecha local. Un objetivo activo por fecha y usuario.
create table athlete3.nutrition_targets (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  effective_from date not null check (effective_from > '2000-01-01'),
  energy_kcal numeric(7, 1) check (energy_kcal is null or energy_kcal between 0 and 20000),
  protein_g numeric(6, 1) check (protein_g is null or protein_g between 0 and 2000),
  carbs_g numeric(6, 1) check (carbs_g is null or carbs_g between 0 and 2000),
  fat_g numeric(6, 1) check (fat_g is null or fat_g between 0 and 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  revision bigint not null default 1,
  change_seq bigint not null default 0,
  last_mutation_id uuid
);
create unique index nutrition_targets_one_per_day on athlete3.nutrition_targets (user_id, effective_from) where deleted_at is null;
select athlete3_private.secure_synced_table('athlete3.nutrition_targets');

-- ---------------------------------------------------------------------------------
-- Sync: lista blanca y pull con las entidades nuevas
-- ---------------------------------------------------------------------------------
create or replace function athlete3_private.sync_table(p_entity text)
returns regclass
language sql
stable
set search_path = ''
as $$
  select case p_entity
    when 'profile' then 'athlete3.profiles'::regclass
    when 'exercise' then 'athlete3.exercises'::regclass
    when 'training_plan' then 'athlete3.training_plans'::regclass
    when 'training_day' then 'athlete3.training_days'::regclass
    when 'training_day_exercise' then 'athlete3.training_day_exercises'::regclass
    when 'workout_session' then 'athlete3.workout_sessions'::regclass
    when 'session_exercise' then 'athlete3.session_exercises'::regclass
    when 'strength_set' then 'athlete3.strength_sets'::regclass
    when 'cardio_session' then 'athlete3.cardio_sessions'::regclass
    when 'body_weight' then 'athlete3.body_weights'::regclass
    when 'body_measurement' then 'athlete3.body_measurements'::regclass
    when 'meal_entry' then 'athlete3.meal_entries'::regclass
    when 'nutrition_target' then 'athlete3.nutrition_targets'::regclass
    else null
  end
$$;

create or replace function athlete3.sync_pull(p_cursor text default null, p_limit integer default 200)
returns jsonb
language plpgsql
volatile -- consume el límite de frecuencia
security invoker
set search_path = ''
set timezone = 'UTC'
as $$
declare
  v_uid uuid := athlete3_private.require_user_id();
  v_after bigint;
  v_changes jsonb;
  v_count integer;
  v_next bigint;
begin
  perform athlete3_private.consume_rate_limit('sync_pull', 240, 60);
  if p_limit is null or p_limit not between 1 and 500 then
    raise exception using errcode = 'P0001', message = 'ATHLETE:VALIDATION_FAILED', detail = 'limit fuera de rango';
  end if;
  if p_cursor is null then
    v_after := 0;
  elsif p_cursor ~ '^[0-9]{1,18}$' then
    v_after := p_cursor::bigint;
  else
    raise exception using errcode = 'P0001', message = 'ATHLETE:VALIDATION_FAILED', detail = 'cursor no válido';
  end if;

  with changes as (
    select 'profile' as entity, to_jsonb(t) as rec from athlete3.profiles t where t.user_id = v_uid and t.change_seq > v_after
    union all select 'exercise', to_jsonb(t) from athlete3.exercises t where t.user_id = v_uid and t.change_seq > v_after
    union all select 'training_plan', to_jsonb(t) from athlete3.training_plans t where t.user_id = v_uid and t.change_seq > v_after
    union all select 'training_day', to_jsonb(t) from athlete3.training_days t where t.user_id = v_uid and t.change_seq > v_after
    union all select 'training_day_exercise', to_jsonb(t) from athlete3.training_day_exercises t where t.user_id = v_uid and t.change_seq > v_after
    union all select 'workout_session', to_jsonb(t) from athlete3.workout_sessions t where t.user_id = v_uid and t.change_seq > v_after
    union all select 'session_exercise', to_jsonb(t) from athlete3.session_exercises t where t.user_id = v_uid and t.change_seq > v_after
    union all select 'strength_set', to_jsonb(t) from athlete3.strength_sets t where t.user_id = v_uid and t.change_seq > v_after
    union all select 'cardio_session', to_jsonb(t) from athlete3.cardio_sessions t where t.user_id = v_uid and t.change_seq > v_after
    union all select 'body_weight', to_jsonb(t) from athlete3.body_weights t where t.user_id = v_uid and t.change_seq > v_after
    union all select 'body_measurement', to_jsonb(t) from athlete3.body_measurements t where t.user_id = v_uid and t.change_seq > v_after
    union all select 'meal_entry', to_jsonb(t) from athlete3.meal_entries t where t.user_id = v_uid and t.change_seq > v_after
    union all select 'nutrition_target', to_jsonb(t) from athlete3.nutrition_targets t where t.user_id = v_uid and t.change_seq > v_after
  ),
  page as (
    select entity, rec, (rec->>'change_seq')::bigint as seq
    from changes order by (rec->>'change_seq')::bigint limit p_limit + 1
  ),
  limited as (
    select * from page order by seq limit p_limit
  )
  select
    coalesce(jsonb_agg(jsonb_build_object(
      'entity', entity,
      'entityId', rec->>'id',
      'revision', (rec->>'revision')::bigint,
      'deleted', (rec->>'deleted_at') is not null,
      'record', case when (rec->>'deleted_at') is null then rec end,
      'lastMutationId', rec->>'last_mutation_id') order by seq), '[]'::jsonb),
    max(seq),
    (select count(*) from page)
  into v_changes, v_next, v_count
  from limited;

  return jsonb_build_object(
    'changes', v_changes,
    'nextCursor', coalesce(v_next, v_after)::text,
    'hasMore', v_count > p_limit);
end;
$$;
revoke all on function athlete3.sync_pull(text, integer) from public;
grant execute on function athlete3.sync_pull(text, integer) to authenticated;

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
