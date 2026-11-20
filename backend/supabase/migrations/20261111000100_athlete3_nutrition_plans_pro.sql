-- =====================================================================================
-- ATHLETE 3.0 / MUNDO FIT — Plan nutricional por equivalentes SMAE y modo nutriólogo (Claude, 2026-11-10)
--
--   1. athlete3.nutrition_plans → contrato `NutritionPlan` (entidad de sync `nutrition_plan`).
--      Un plan por día de vigencia: tiempos de comida con hora y raciones por grupo del SMAE.
--      `source`: 'self' (lo capturó el usuario) o 'assigned' (se lo asignó su nutriólogo).
--      El usuario NO puede marcar un plan como asignado: lo impide el trigger de origen.
--   2. Rol 'nutritionist' en athlete3_private.user_roles (lo otorga un admin con SQL).
--   3. Vínculo nutriólogo ↔ cliente con código de invitación de un solo uso (7 días).
--      Un cliente tiene como máximo un nutriólogo activo; cualquiera de los dos puede terminar el vínculo.
--   4. RPC (SECURITY DEFINER, solo `authenticated`): pro_status, pro_create_invite, pro_accept_invite,
--      pro_end_link, pro_list_clients, pro_get_client_plan, pro_assign_plan.
--      El nutriólogo solo ve nombre/correo de sus clientes vinculados y su plan; nada más de sus datos.
--      Al asignar, el plan y la meta del día se escriben EN LAS FILAS DEL CLIENTE y le llegan por su sync normal.
--   5. sync_table / sync_pull con la entidad nueva; cierre de privilegios y verificación (copia de 0900).
--
-- Aditiva: tablas y funciones nuevas; amplía el CHECK de roles. No modifica ni borra datos.
-- IMPORTANTE: aplicar ANTES de instalar la app con contratos 0.8.0.
-- Grupos SMAE: los mismos ids que packages/domain/src/smae.ts (una prueba lo verifica).
-- =====================================================================================

-- ---------------------------------------------------------------------------------
-- 1. Plan nutricional
-- ---------------------------------------------------------------------------------
create function athlete3_private.smae_groups()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array['verduras', 'frutas', 'cereales_sin_grasa', 'cereales_con_grasa', 'leguminosas',
               'aoa_muy_bajo', 'aoa_bajo', 'aoa_moderado', 'aoa_alto',
               'leche_descremada', 'leche_semidescremada', 'leche_entera', 'leche_con_azucar',
               'grasas_sin_proteina', 'grasas_con_proteina', 'azucares_sin_grasa', 'azucares_con_grasa', 'libres']
$$;

-- Tiempos de comida: 1 a 10; cada uno {label, time?, equivalents, note?}; raciones de 0.5 a 20 en pasos de ½.
create function athlete3_private.plan_meals_ok(p jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  m jsonb;
  k text;
  v jsonb;
  n numeric;
begin
  if p is null or jsonb_typeof(p) <> 'array' or jsonb_array_length(p) not between 1 and 10 then
    return false;
  end if;
  for m in select e from jsonb_array_elements(p) as e loop
    if jsonb_typeof(m) <> 'object' then return false; end if;
    if exists (select 1 from jsonb_object_keys(m) as x where x not in ('label', 'time', 'equivalents', 'note')) then return false; end if;
    if jsonb_typeof(m -> 'label') is distinct from 'string' or length(btrim(m ->> 'label')) not between 1 and 40 then return false; end if;
    if (m ? 'time') and jsonb_typeof(m -> 'time') <> 'null'
       and (jsonb_typeof(m -> 'time') <> 'string' or (m ->> 'time') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$') then
      return false;
    end if;
    if (m ? 'note') and jsonb_typeof(m -> 'note') <> 'null'
       and (jsonb_typeof(m -> 'note') <> 'string' or length(m ->> 'note') > 300) then
      return false;
    end if;
    if jsonb_typeof(m -> 'equivalents') is distinct from 'object' then return false; end if;
    for k, v in select key, value from jsonb_each(m -> 'equivalents') loop
      if not (k = any (athlete3_private.smae_groups())) or jsonb_typeof(v) <> 'number' then return false; end if;
      n := (v #>> '{}')::numeric;
      if n not between 0.5 and 20 or not athlete3_private.is_half_step(n) then return false; end if;
    end loop;
  end loop;
  return true;
end;
$$;
grant execute on function athlete3_private.smae_groups() to authenticated, service_role;
grant execute on function athlete3_private.plan_meals_ok(jsonb) to authenticated, service_role;

create table athlete3.nutrition_plans (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  effective_from date not null check (effective_from > '2000-01-01'),
  name text not null check (length(btrim(name)) between 1 and 80),
  meals jsonb not null check (pg_column_size(meals) <= 32768 and athlete3_private.plan_meals_ok(meals)),
  notes text check (notes is null or length(notes) <= 2000),
  source text not null default 'self' check (source in ('self', 'assigned')),
  assigned_by uuid references auth.users (id) on delete set null,
  assigned_by_name text check (assigned_by_name is null or length(btrim(assigned_by_name)) between 1 and 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  revision bigint not null default 1,
  change_seq bigint not null default 0,
  last_mutation_id uuid,
  constraint nutrition_plans_origin_consistent check ((source = 'assigned') = (assigned_by_name is not null))
);
create unique index nutrition_plans_one_per_day on athlete3.nutrition_plans (user_id, effective_from) where deleted_at is null;
select athlete3_private.secure_synced_table('athlete3.nutrition_plans');

-- El origen lo decide el servidor: desde la app (authenticated) un plan nuevo siempre es 'self' y una edición
-- conserva el origen que tenía. Solo pro_assign_plan (SECURITY DEFINER) escribe planes 'assigned'.
-- Corre antes que el trigger de sync (orden alfabético: _origin < _synced).
create function athlete3_private.tg_nutrition_plan_origin()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      new.source := 'self';
      new.assigned_by := null;
      new.assigned_by_name := null;
    else
      new.source := old.source;
      new.assigned_by := old.assigned_by;
      new.assigned_by_name := old.assigned_by_name;
    end if;
  end if;
  return new;
end;
$$;
grant execute on function athlete3_private.tg_nutrition_plan_origin() to authenticated, service_role;
create trigger nutrition_plans_origin before insert or update on athlete3.nutrition_plans
  for each row execute function athlete3_private.tg_nutrition_plan_origin();

-- ---------------------------------------------------------------------------------
-- 2. Rol de nutriólogo
-- ---------------------------------------------------------------------------------
alter table athlete3_private.user_roles drop constraint user_roles_role_check;
alter table athlete3_private.user_roles add constraint user_roles_role_check check (role in ('admin', 'nutritionist'));

-- ---------------------------------------------------------------------------------
-- 3. Vínculos e invitaciones (solo accesibles por las RPC; RLS forzado y sin políticas)
-- ---------------------------------------------------------------------------------
create table athlete3_private.pro_links (
  id uuid primary key default gen_random_uuid(),
  professional_id uuid not null references auth.users (id) on delete cascade,
  client_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  ended_at timestamptz,
  constraint pro_links_not_self check (professional_id <> client_id)
);
create unique index pro_links_one_active_per_client on athlete3_private.pro_links (client_id) where ended_at is null;
create index pro_links_professional_idx on athlete3_private.pro_links (professional_id) where ended_at is null;
alter table athlete3_private.pro_links enable row level security;
alter table athlete3_private.pro_links force row level security;
grant all on athlete3_private.pro_links to service_role;

create table athlete3_private.pro_invites (
  code text primary key check (code ~ '^[A-HJ-NP-Z2-9]{8}$'),
  professional_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_by uuid references auth.users (id) on delete set null,
  used_at timestamptz
);
create index pro_invites_professional_idx on athlete3_private.pro_invites (professional_id);
alter table athlete3_private.pro_invites enable row level security;
alter table athlete3_private.pro_invites force row level security;
grant all on athlete3_private.pro_invites to service_role;

create function athlete3_private.has_role(p_uid uuid, p_role text)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (select 1 from athlete3_private.user_roles r where r.user_id = p_uid and r.role = p_role)
$$;

create function athlete3_private.display_name_of(p_uid uuid)
returns text
language sql
stable
set search_path = ''
as $$
  select left(coalesce(nullif(btrim(p.display_name), ''), nullif(split_part(u.email, '@', 1), ''), 'Usuario'), 80)
  from auth.users u left join athlete3.profiles p on p.id = u.id
  where u.id = p_uid
$$;

create function athlete3_private.require_nutritionist()
returns uuid
language plpgsql
stable
set search_path = ''
as $$
declare
  v_uid uuid := athlete3_private.require_user_id();
begin
  if not athlete3_private.has_role(v_uid, 'nutritionist') then
    raise exception using errcode = '42501', message = 'ATHLETE:FORBIDDEN', detail = 'se requiere el rol de nutriólogo';
  end if;
  return v_uid;
end;
$$;

create function athlete3_private.require_client_link(p_professional uuid, p_client uuid)
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if p_client is null or not exists (
    select 1 from athlete3_private.pro_links l
    where l.professional_id = p_professional and l.client_id = p_client and l.ended_at is null) then
    raise exception using errcode = 'P0001', message = 'ATHLETE:NOT_FOUND', detail = 'no es tu cliente';
  end if;
end;
$$;

create function athlete3_private.plan_json(p athlete3.nutrition_plans)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select case when p.id is null then null else jsonb_build_object(
    'id', p.id, 'effectiveFrom', p.effective_from, 'name', p.name, 'meals', p.meals, 'notes', p.notes,
    'source', p.source, 'assignedByName', p.assigned_by_name, 'updatedAt', p.updated_at) end
$$;

-- ---------------------------------------------------------------------------------
-- 4. RPC
-- ---------------------------------------------------------------------------------
-- Estado del usuario: si es nutriólogo y quién es su nutriólogo (si tiene).
create function athlete3.pro_status()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := athlete3_private.require_user_id();
  v_link uuid;
  v_pro uuid;
  v_since timestamptz;
begin
  select l.id, l.professional_id, l.created_at into v_link, v_pro, v_since
  from athlete3_private.pro_links l where l.client_id = v_uid and l.ended_at is null;
  return jsonb_build_object(
    'isNutritionist', athlete3_private.has_role(v_uid, 'nutritionist'),
    'professional', case when v_link is null then null
      else jsonb_build_object('linkId', v_link, 'name', athlete3_private.display_name_of(v_pro), 'since', v_since) end);
end;
$$;

-- El nutriólogo genera un código de un solo uso para un cliente (vence en 7 días).
create function athlete3.pro_create_invite()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := athlete3_private.require_nutritionist();
  v_code text;
  v_expires timestamptz := now() + interval '7 days';
begin
  perform athlete3_private.consume_rate_limit('pro_invite', 30, 3600);
  loop
    select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 1 + floor(random() * 32)::int, 1), '')
      into v_code from generate_series(1, 8);
    exit when not exists (select 1 from athlete3_private.pro_invites i where i.code = v_code);
  end loop;
  insert into athlete3_private.pro_invites (code, professional_id, expires_at) values (v_code, v_uid, v_expires);
  return jsonb_build_object('code', v_code, 'expiresAt', v_expires);
end;
$$;

-- El cliente acepta el código. Si ya tenía nutriólogo, ese vínculo termina (solo uno activo).
create function athlete3.pro_accept_invite(p_code text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := athlete3_private.require_user_id();
  v_code text := upper(btrim(coalesce(p_code, '')));
  v_pro uuid;
  v_link uuid;
begin
  perform athlete3_private.consume_rate_limit('pro_accept', 10, 3600);
  select i.professional_id into v_pro from athlete3_private.pro_invites i
  where i.code = v_code and i.used_at is null and i.expires_at > now()
  for update;
  if v_pro is null then
    raise exception using errcode = 'P0001', message = 'ATHLETE:NOT_FOUND', detail = 'código no válido, usado o vencido';
  end if;
  if v_pro = v_uid then
    raise exception using errcode = 'P0001', message = 'ATHLETE:VALIDATION_FAILED', detail = 'no puedes ser tu propio cliente';
  end if;
  update athlete3_private.pro_links set ended_at = now() where client_id = v_uid and ended_at is null;
  insert into athlete3_private.pro_links (professional_id, client_id) values (v_pro, v_uid) returning id into v_link;
  update athlete3_private.pro_invites set used_by = v_uid, used_at = now() where code = v_code;
  return jsonb_build_object('linkId', v_link, 'name', athlete3_private.display_name_of(v_pro));
end;
$$;

-- Cualquiera de los dos termina el vínculo. Los planes ya asignados se quedan con el cliente.
create function athlete3.pro_end_link(p_link_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := athlete3_private.require_user_id();
begin
  update athlete3_private.pro_links set ended_at = now()
  where id = p_link_id and ended_at is null and (client_id = v_uid or professional_id = v_uid);
  if not found then
    raise exception using errcode = 'P0001', message = 'ATHLETE:NOT_FOUND', detail = 'vínculo no encontrado';
  end if;
end;
$$;

-- Clientes activos del nutriólogo, con su plan vigente más reciente.
create function athlete3.pro_list_clients()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := athlete3_private.require_nutritionist();
begin
  return (
    select coalesce(jsonb_agg(jsonb_build_object(
      'linkId', l.id, 'clientId', l.client_id, 'name', athlete3_private.display_name_of(l.client_id),
      'email', u.email, 'since', l.created_at,
      'plan', (select jsonb_build_object('name', p.name, 'effectiveFrom', p.effective_from, 'source', p.source)
               from athlete3.nutrition_plans p
               where p.user_id = l.client_id and p.deleted_at is null
               order by p.effective_from desc limit 1)
    ) order by l.created_at desc), '[]'::jsonb)
    from athlete3_private.pro_links l join auth.users u on u.id = l.client_id
    where l.professional_id = v_uid and l.ended_at is null);
end;
$$;

-- Plan más reciente de un cliente vinculado (o null).
create function athlete3.pro_get_client_plan(p_client_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := athlete3_private.require_nutritionist();
  v_plan athlete3.nutrition_plans;
begin
  perform athlete3_private.require_client_link(v_uid, p_client_id);
  select * into v_plan from athlete3.nutrition_plans p
  where p.user_id = p_client_id and p.deleted_at is null order by p.effective_from desc limit 1;
  return athlete3_private.plan_json(v_plan);
end;
$$;

-- Asigna (crea o reemplaza) el plan del día `effectiveFrom` del cliente y su meta diaria (origen 'professional').
-- p_plan: {effectiveFrom, name, meals, notes?, energyKcal, proteinG?, carbsG?, fatG?}. La app calcula las kcal y
-- los macros con la tabla SMAE; el servidor valida rangos y la forma de `meals` (CHECK de la tabla).
create function athlete3.pro_assign_plan(p_client_id uuid, p_plan jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := athlete3_private.require_nutritionist();
  v_from date;
  v_name text;
  v_notes text;
  v_kcal numeric;
  v_p numeric;
  v_c numeric;
  v_f numeric;
  v_pro_name text;
  v_plan_id uuid;
  v_target_id uuid;
begin
  perform athlete3_private.require_client_link(v_uid, p_client_id);
  perform athlete3_private.consume_rate_limit('pro_assign', 60, 3600);
  if p_plan is null or jsonb_typeof(p_plan) <> 'object'
     or coalesce(p_plan ->> 'effectiveFrom', '') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
     or jsonb_typeof(p_plan -> 'energyKcal') is distinct from 'number' then
    raise exception using errcode = 'P0001', message = 'ATHLETE:VALIDATION_FAILED', detail = 'plan incompleto';
  end if;
  v_from := (p_plan ->> 'effectiveFrom')::date;
  v_name := btrim(coalesce(p_plan ->> 'name', ''));
  v_notes := nullif(btrim(coalesce(p_plan ->> 'notes', '')), '');
  v_kcal := round((p_plan ->> 'energyKcal')::numeric, 1);
  v_p := round(nullif(p_plan ->> 'proteinG', '')::numeric, 1);
  v_c := round(nullif(p_plan ->> 'carbsG', '')::numeric, 1);
  v_f := round(nullif(p_plan ->> 'fatG', '')::numeric, 1);
  if v_kcal not between 800 and 10000 or v_p not between 0 and 2000 or v_c not between 0 and 2000 or v_f not between 0 and 2000
     or v_from < current_date - 1 then
    raise exception using errcode = 'P0001', message = 'ATHLETE:VALIDATION_FAILED', detail = 'valores fuera de rango';
  end if;
  v_pro_name := athlete3_private.display_name_of(v_uid);

  select p.id into v_plan_id from athlete3.nutrition_plans p
  where p.user_id = p_client_id and p.effective_from = v_from and p.deleted_at is null;
  if v_plan_id is null then
    v_plan_id := gen_random_uuid();
    insert into athlete3.nutrition_plans (id, user_id, effective_from, name, meals, notes, source, assigned_by, assigned_by_name)
    values (v_plan_id, p_client_id, v_from, v_name, p_plan -> 'meals', v_notes, 'assigned', v_uid, v_pro_name);
  else
    update athlete3.nutrition_plans
    set name = v_name, meals = p_plan -> 'meals', notes = v_notes, source = 'assigned', assigned_by = v_uid, assigned_by_name = v_pro_name
    where id = v_plan_id;
  end if;

  select t.id into v_target_id from athlete3.nutrition_targets t
  where t.user_id = p_client_id and t.effective_from = v_from and t.deleted_at is null;
  if v_target_id is null then
    insert into athlete3.nutrition_targets (id, user_id, effective_from, energy_kcal, protein_g, carbs_g, fat_g, source)
    values (gen_random_uuid(), p_client_id, v_from, v_kcal, v_p, v_c, v_f, 'professional');
  else
    update athlete3.nutrition_targets
    set energy_kcal = v_kcal, protein_g = v_p, carbs_g = v_c, fat_g = v_f, source = 'professional'
    where id = v_target_id;
  end if;
  return jsonb_build_object('planId', v_plan_id);
end;
$$;

revoke all on function athlete3.pro_status() from public;
revoke all on function athlete3.pro_create_invite() from public;
revoke all on function athlete3.pro_accept_invite(text) from public;
revoke all on function athlete3.pro_end_link(uuid) from public;
revoke all on function athlete3.pro_list_clients() from public;
revoke all on function athlete3.pro_get_client_plan(uuid) from public;
revoke all on function athlete3.pro_assign_plan(uuid, jsonb) from public;
grant execute on function athlete3.pro_status() to authenticated;
grant execute on function athlete3.pro_create_invite() to authenticated;
grant execute on function athlete3.pro_accept_invite(text) to authenticated;
grant execute on function athlete3.pro_end_link(uuid) to authenticated;
grant execute on function athlete3.pro_list_clients() to authenticated;
grant execute on function athlete3.pro_get_client_plan(uuid) to authenticated;
grant execute on function athlete3.pro_assign_plan(uuid, jsonb) to authenticated;
revoke all on function athlete3_private.has_role(uuid, text) from public, authenticated;
revoke all on function athlete3_private.display_name_of(uuid) from public, authenticated;
revoke all on function athlete3_private.require_nutritionist() from public, authenticated;
revoke all on function athlete3_private.require_client_link(uuid, uuid) from public, authenticated;
revoke all on function athlete3_private.plan_json(athlete3.nutrition_plans) from public, authenticated;

-- ---------------------------------------------------------------------------------
-- 5. Sync: lista blanca y pull con la entidad nueva (copia de 20261109000100 + nutrition_plan)
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
    when 'nutrition_plan' then 'athlete3.nutrition_plans'::regclass
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
    union all select 'nutrition_plan', to_jsonb(t) from athlete3.nutrition_plans t where t.user_id = v_uid and t.change_seq > v_after
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
