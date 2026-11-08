-- =====================================================================================
-- ATHLETE 3.0 — Motor híbrido, contratos 0.7.0 (Claude, 2026-11-08)
--
--   1. training_plans        + kind ('routine' | 'program') y template_slug.
--   2. training_days         + weekday (1 = lunes … 7), modality, target_rpe, target_duration_minutes.
--   3. athlete3.training_blocks        → contrato `TrainingBlock` (entidad de sync `training_block`).
--   4. training_day_exercises + block_id (mismo día que el ejercicio), per_side, target_rpe.
--   5. workout_sessions      + session_rpe (carga de sesión = RPE × minutos).
--   6. athlete3.session_block_results  → contrato `SessionBlockResult` (entidad `session_block_result`).
--   7. sync_table / sync_pull con las dos entidades nuevas; cierre de privilegios y verificación (copia de 0900).
--
-- Aditiva: solo agrega columnas con valor por defecto o NULL y tablas nuevas. No modifica ni borra datos.
-- Las filas existentes quedan como rutinas (kind = 'routine', per_side = false).
-- IMPORTANTE: aplicar ANTES de instalar la app con contratos 0.7.0 (la app sube estas columnas nuevas).
-- =====================================================================================

-- 1. Planes
alter table athlete3.training_plans
  add column kind text not null default 'routine' check (kind in ('routine', 'program')),
  add column template_slug text check (template_slug is null or (template_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(template_slug) <= 80));

-- 2. Días
alter table athlete3.training_days
  add column weekday integer check (weekday is null or weekday between 1 and 7),
  add column modality text check (modality is null or modality in ('strength', 'conditioning', 'swim', 'run', 'bike', 'row', 'mobility', 'rest')),
  add column target_rpe numeric(3, 1) check (target_rpe is null or (target_rpe between 1 and 10 and athlete3_private.is_half_step(target_rpe))),
  add column target_duration_minutes integer check (target_duration_minutes is null or target_duration_minutes between 1 and 600);

-- 3. Bloques
create table athlete3.training_blocks (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  training_day_id uuid not null,
  position integer not null check (position between 0 and 1000),
  name text not null check (length(btrim(name)) between 1 and 120),
  kind text not null check (kind in ('warmup', 'strength', 'conditioning', 'wod', 'cardio', 'swim', 'cooldown', 'mobility')),
  format text not null check (format in ('sets', 'rounds', 'amrap', 'emom', 'for_time', 'intervals', 'continuous')),
  rounds integer check (rounds is null or rounds between 1 and 100),
  time_cap_seconds integer check (time_cap_seconds is null or time_cap_seconds between 1 and 86400),
  rest_seconds integer check (rest_seconds is null or rest_seconds between 0 and 3600),
  target_rpe numeric(3, 1) check (target_rpe is null or (target_rpe between 1 and 10 and athlete3_private.is_half_step(target_rpe))),
  notes text check (notes is null or length(notes) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  revision bigint not null default 1,
  change_seq bigint not null default 0,
  last_mutation_id uuid,
  unique (id, user_id),
  foreign key (training_day_id, user_id) references athlete3.training_days (id, user_id) on delete cascade,
  -- AMRAP y EMOM necesitan duración (misma regla que CreateTrainingBlockInput).
  constraint training_blocks_timed_formats check (format not in ('amrap', 'emom') or time_cap_seconds is not null)
);
create index training_blocks_day_idx on athlete3.training_blocks (training_day_id);
select athlete3_private.secure_synced_table('athlete3.training_blocks');
create trigger training_days_cascade_blocks after update of deleted_at on athlete3.training_days
  for each row execute function athlete3_private.tg_cascade_tombstone('athlete3.training_blocks', 'training_day_id');

-- 4. Ejercicios del día: bloque, por lado y RPE objetivo
alter table athlete3.training_day_exercises
  add column block_id uuid,
  add column per_side boolean not null default false,
  add column target_rpe numeric(3, 1) check (target_rpe is null or (target_rpe between 1 and 10 and athlete3_private.is_half_step(target_rpe))),
  add constraint training_day_exercises_block_fk foreign key (block_id, user_id) references athlete3.training_blocks (id, user_id);
create index training_day_exercises_block_idx on athlete3.training_day_exercises (block_id) where block_id is not null;

-- El bloque debe ser del mismo día que el ejercicio (misma regla que el repositorio local).
create function athlete3_private.tg_block_same_day()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.block_id is not null and new.deleted_at is null and not exists (
    select 1 from athlete3.training_blocks b where b.id = new.block_id and b.training_day_id = new.training_day_id
  ) then
    raise exception using errcode = 'P0001', message = 'ATHLETE:VALIDATION_FAILED', detail = 'el bloque no pertenece a este día';
  end if;
  return new;
end;
$$;
grant execute on function athlete3_private.tg_block_same_day() to authenticated, service_role;
create trigger training_day_exercises_block_same_day before insert or update on athlete3.training_day_exercises
  for each row execute function athlete3_private.tg_block_same_day();

-- 5. RPE de la sesión
alter table athlete3.workout_sessions
  add column session_rpe numeric(3, 1) check (session_rpe is null or (session_rpe between 1 and 10 and athlete3_private.is_half_step(session_rpe)));

-- 6. Resultado de bloques (AMRAP, por tiempo, rondas…)
create table athlete3.session_block_results (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  session_id uuid not null,
  training_block_id uuid,
  position integer not null check (position between 0 and 1000),
  name text not null check (length(btrim(name)) between 1 and 120),
  format text not null check (format in ('sets', 'rounds', 'amrap', 'emom', 'for_time', 'intervals', 'continuous')),
  rounds_completed integer check (rounds_completed is null or rounds_completed between 0 and 1000),
  extra_reps integer check (extra_reps is null or extra_reps between 0 and 10000),
  duration_seconds integer check (duration_seconds is null or duration_seconds between 1 and 86400),
  notes text check (notes is null or length(notes) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  revision bigint not null default 1,
  change_seq bigint not null default 0,
  last_mutation_id uuid,
  unique (id, user_id),
  foreign key (session_id, user_id) references athlete3.workout_sessions (id, user_id) on delete cascade,
  foreign key (training_block_id, user_id) references athlete3.training_blocks (id, user_id)
);
create index session_block_results_session_idx on athlete3.session_block_results (session_id);
select athlete3_private.secure_synced_table('athlete3.session_block_results');
create trigger workout_sessions_cascade_block_results after update of deleted_at on athlete3.workout_sessions
  for each row execute function athlete3_private.tg_cascade_tombstone('athlete3.session_block_results', 'session_id');

-- No se edita el resultado de una sesión descartada (salvo borrarlo).
create function athlete3_private.tg_block_result_editable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.deleted_at is null and exists (
    select 1 from athlete3.workout_sessions s where s.id = new.session_id and s.status = 'discarded'
  ) then
    raise exception using errcode = 'P0001', message = 'ATHLETE:INVALID_STATE', detail = 'la sesión está descartada';
  end if;
  return new;
end;
$$;
grant execute on function athlete3_private.tg_block_result_editable() to authenticated, service_role;
create trigger session_block_results_editable before insert or update on athlete3.session_block_results
  for each row execute function athlete3_private.tg_block_result_editable();

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
    when 'training_block' then 'athlete3.training_blocks'::regclass
    when 'session_block_result' then 'athlete3.session_block_results'::regclass
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
    union all select 'training_block', to_jsonb(t) from athlete3.training_blocks t where t.user_id = v_uid and t.change_seq > v_after
    union all select 'session_block_result', to_jsonb(t) from athlete3.session_block_results t where t.user_id = v_uid and t.change_seq > v_after
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
