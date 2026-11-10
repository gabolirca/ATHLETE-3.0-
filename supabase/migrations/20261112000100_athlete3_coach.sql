-- =====================================================================================
-- ATHLETE 3.0 / MUNDO FIT — Modo coach (Claude, 2026-11-10)
--
--   1. Vínculos por ALCANCE: pro_links.scope y pro_invites.scope ('nutrition' | 'training').
--      Un atleta puede tener un nutriólogo y un coach distintos (uno activo por alcance). Cada vínculo da
--      acceso solo a su parte. Rol nuevo 'coach' en user_roles.
--      Las RPC de nutrición (0001 de 20261111000100) quedan limitadas al alcance 'nutrition'.
--   2. training_plans + assigned_by / assigned_by_name: programa asignado por el coach (solo el servidor lo marca).
--   3. athlete3.coach_comments → contrato `CoachComment` (entidad de sync `coach_comment`). Son filas del atleta
--      que solo escribe su coach (RPC); el atleta las recibe por su sync y no puede crearlas ni editarlas.
--   4. RPC del coach (SECURITY DEFINER): coach_create_invite, coach_list_clients, coach_client_summary,
--      coach_list_client_plans, coach_assign_plan (copia un programa del coach a la cuenta del atleta),
--      coach_remove_plan, coach_add_comment, coach_list_comments, coach_delete_comment.
--      El coach solo LEE el entrenamiento de sus atletas vinculados (sesiones, cardio, adherencia, récords).
--   5. sync_table / sync_pull con coach_comment; cierre de privilegios y verificación (copia de 0900).
--
-- Aditiva: columnas con default/NULL, tabla y funciones nuevas. No borra datos.
-- IMPORTANTE: aplicar ANTES de instalar la app con contratos 0.9.0.
-- =====================================================================================

-- ---------------------------------------------------------------------------------
-- 1. Alcance de los vínculos y rol de coach
-- ---------------------------------------------------------------------------------
alter table athlete3_private.user_roles drop constraint user_roles_role_check;
alter table athlete3_private.user_roles add constraint user_roles_role_check check (role in ('admin', 'nutritionist', 'coach'));

alter table athlete3_private.pro_links add column scope text not null default 'nutrition' check (scope in ('nutrition', 'training'));
drop index athlete3_private.pro_links_one_active_per_client;
create unique index pro_links_one_active_per_client_scope on athlete3_private.pro_links (client_id, scope) where ended_at is null;
alter table athlete3_private.pro_invites add column scope text not null default 'nutrition' check (scope in ('nutrition', 'training'));

create function athlete3_private.role_for_scope(p_scope text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_scope when 'nutrition' then 'nutritionist' when 'training' then 'coach' end
$$;

create function athlete3_private.require_coach()
returns uuid
language plpgsql
stable
set search_path = ''
as $$
declare
  v_uid uuid := athlete3_private.require_user_id();
begin
  if not athlete3_private.has_role(v_uid, 'coach') then
    raise exception using errcode = '42501', message = 'ATHLETE:FORBIDDEN', detail = 'se requiere el rol de coach';
  end if;
  return v_uid;
end;
$$;

create function athlete3_private.require_scope_link(p_professional uuid, p_client uuid, p_scope text)
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if p_client is null or not exists (
    select 1 from athlete3_private.pro_links l
    where l.professional_id = p_professional and l.client_id = p_client and l.scope = p_scope and l.ended_at is null) then
    raise exception using errcode = 'P0001', message = 'ATHLETE:NOT_FOUND', detail = 'no es tu atleta';
  end if;
end;
$$;

-- Las RPC de nutrición siguen usando require_client_link: ahora solo con vínculos de nutrición.
create or replace function athlete3_private.require_client_link(p_professional uuid, p_client uuid)
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  perform athlete3_private.require_scope_link(p_professional, p_client, 'nutrition');
end;
$$;

create or replace function athlete3.pro_status()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := athlete3_private.require_user_id();
  v_out jsonb := jsonb_build_object(
    'isNutritionist', athlete3_private.has_role(v_uid, 'nutritionist'),
    'isCoach', athlete3_private.has_role(v_uid, 'coach'),
    'professional', null, 'coach', null);
  r record;
begin
  for r in select l.id, l.professional_id, l.created_at, l.scope from athlete3_private.pro_links l
           where l.client_id = v_uid and l.ended_at is null loop
    v_out := v_out || jsonb_build_object(case r.scope when 'nutrition' then 'professional' else 'coach' end,
      jsonb_build_object('linkId', r.id, 'name', athlete3_private.display_name_of(r.professional_id), 'since', r.created_at));
  end loop;
  return v_out;
end;
$$;

-- El código trae su alcance: al aceptarlo termina el vínculo anterior de ESE alcance (el otro se conserva).
create or replace function athlete3.pro_accept_invite(p_code text)
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
  v_scope text;
  v_link uuid;
begin
  perform athlete3_private.consume_rate_limit('pro_accept', 10, 3600);
  select i.professional_id, i.scope into v_pro, v_scope from athlete3_private.pro_invites i
  where i.code = v_code and i.used_at is null and i.expires_at > now()
  for update;
  if v_pro is null then
    raise exception using errcode = 'P0001', message = 'ATHLETE:NOT_FOUND', detail = 'código no válido, usado o vencido';
  end if;
  if v_pro = v_uid then
    raise exception using errcode = 'P0001', message = 'ATHLETE:VALIDATION_FAILED', detail = 'no puedes ser tu propio cliente';
  end if;
  update athlete3_private.pro_links set ended_at = now() where client_id = v_uid and scope = v_scope and ended_at is null;
  insert into athlete3_private.pro_links (professional_id, client_id, scope) values (v_pro, v_uid, v_scope) returning id into v_link;
  update athlete3_private.pro_invites set used_by = v_uid, used_at = now() where code = v_code;
  return jsonb_build_object('linkId', v_link, 'name', athlete3_private.display_name_of(v_pro), 'scope', v_scope);
end;
$$;

create or replace function athlete3.pro_list_clients()
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
    where l.professional_id = v_uid and l.scope = 'nutrition' and l.ended_at is null);
end;
$$;

-- ---------------------------------------------------------------------------------
-- 2. Programas asignados por el coach
-- ---------------------------------------------------------------------------------
alter table athlete3.training_plans
  add column assigned_by uuid references auth.users (id) on delete set null,
  add column assigned_by_name text check (assigned_by_name is null or length(btrim(assigned_by_name)) between 1 and 80);

-- Desde la app (authenticated) un plan nuevo nunca es asignado y una edición conserva el origen.
create function athlete3_private.tg_training_plan_origin()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      new.assigned_by := null;
      new.assigned_by_name := null;
    else
      new.assigned_by := old.assigned_by;
      new.assigned_by_name := old.assigned_by_name;
    end if;
  end if;
  return new;
end;
$$;
grant execute on function athlete3_private.tg_training_plan_origin() to authenticated, service_role;
create trigger training_plans_origin before insert or update on athlete3.training_plans
  for each row execute function athlete3_private.tg_training_plan_origin();

-- ---------------------------------------------------------------------------------
-- 3. Comentarios del coach (filas del atleta; solo el coach las escribe vía RPC)
-- ---------------------------------------------------------------------------------
create table athlete3.coach_comments (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  author_id uuid references auth.users (id) on delete set null,
  author_name text not null check (length(btrim(author_name)) between 1 and 80),
  target_type text not null check (target_type in ('general', 'session', 'plan')),
  target_id uuid,
  body text not null check (length(btrim(body)) between 1 and 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  revision bigint not null default 1,
  change_seq bigint not null default 0,
  last_mutation_id uuid,
  constraint coach_comments_target check ((target_type = 'general') = (target_id is null))
);
create index coach_comments_user_idx on athlete3.coach_comments (user_id, created_at desc);
select athlete3_private.secure_synced_table('athlete3.coach_comments');

create function athlete3_private.tg_coach_comment_readonly()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('authenticated', 'anon') then
    raise exception using errcode = '42501', message = 'ATHLETE:FORBIDDEN', detail = 'los comentarios los escribe el coach';
  end if;
  return new;
end;
$$;
grant execute on function athlete3_private.tg_coach_comment_readonly() to authenticated, service_role;
create trigger coach_comments_readonly before insert or update on athlete3.coach_comments
  for each row execute function athlete3_private.tg_coach_comment_readonly();

-- ---------------------------------------------------------------------------------
-- 4. RPC del coach
-- ---------------------------------------------------------------------------------
create function athlete3.coach_create_invite()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := athlete3_private.require_coach();
  v_code text;
  v_expires timestamptz := now() + interval '7 days';
begin
  perform athlete3_private.consume_rate_limit('pro_invite', 30, 3600);
  loop
    select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 1 + floor(random() * 32)::int, 1), '')
      into v_code from generate_series(1, 8);
    exit when not exists (select 1 from athlete3_private.pro_invites i where i.code = v_code);
  end loop;
  insert into athlete3_private.pro_invites (code, professional_id, expires_at, scope) values (v_code, v_uid, v_expires, 'training');
  return jsonb_build_object('code', v_code, 'expiresAt', v_expires);
end;
$$;

-- Atletas del coach: última sesión, sesiones de los últimos 7 días y programas asignados por él.
create function athlete3.coach_list_clients()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := athlete3_private.require_coach();
begin
  return (
    select coalesce(jsonb_agg(jsonb_build_object(
      'linkId', l.id, 'clientId', l.client_id, 'name', athlete3_private.display_name_of(l.client_id),
      'email', u.email, 'since', l.created_at,
      'lastSessionDate', greatest(
        (select max(w.local_date) from athlete3.workout_sessions w where w.user_id = l.client_id and w.status = 'completed' and w.deleted_at is null),
        (select max(c.local_date) from athlete3.cardio_sessions c where c.user_id = l.client_id and c.deleted_at is null)),
      'sessionsLast7Days',
        (select count(*) from athlete3.workout_sessions w where w.user_id = l.client_id and w.status = 'completed' and w.deleted_at is null and w.local_date > current_date - 7)
        + (select count(*) from athlete3.cardio_sessions c where c.user_id = l.client_id and c.deleted_at is null and c.local_date > current_date - 7),
      'assignedPlans', (select count(*) from athlete3.training_plans p where p.user_id = l.client_id and p.assigned_by = v_uid and p.deleted_at is null)
    ) order by l.created_at desc), '[]'::jsonb)
    from athlete3_private.pro_links l join auth.users u on u.id = l.client_id
    where l.professional_id = v_uid and l.scope = 'training' and l.ended_at is null);
end;
$$;

-- Resumen de entrenamiento de un atleta (solo lectura): sesiones, cardio, semanas (hecho vs planeado) y mejores levantamientos.
create function athlete3.coach_client_summary(p_client_id uuid, p_days integer default 28)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
set timezone = 'UTC'
as $$
declare
  v_uid uuid := athlete3_private.require_coach();
  v_days integer := least(greatest(coalesce(p_days, 28), 7), 120);
  v_from date := current_date - v_days;
  v_planned integer;
begin
  perform athlete3_private.require_scope_link(v_uid, p_client_id, 'training');
  -- Días planeados por semana: los días de entrenamiento con día de la semana del programa activo más reciente.
  select count(*) into v_planned from athlete3.training_days d
  where d.plan_id = (select p.id from athlete3.training_plans p
                     where p.user_id = p_client_id and p.kind = 'program' and p.status = 'active' and p.deleted_at is null
                     order by p.updated_at desc limit 1)
    and d.deleted_at is null and d.kind = 'training' and d.weekday is not null;

  return jsonb_build_object(
    'fromDate', v_from,
    'plannedPerWeek', nullif(v_planned, 0),
    'sessions', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', w.id, 'localDate', w.local_date,
        'title', coalesce(w.title, d.name, 'Entrenamiento'),
        'planName', p.name,
        'minutes', case when w.ended_at is null then null else round(extract(epoch from (w.ended_at - w.started_at)) / 60) end,
        'sessionRpe', w.session_rpe,
        'workingSets', (select count(*) from athlete3.session_exercises se join athlete3.strength_sets s on s.session_exercise_id = se.id
                        where se.session_id = w.id and se.deleted_at is null and s.deleted_at is null and s.set_type = 'working'),
        'volumeKg', (select coalesce(round(sum(s.weight_kg * s.reps)), 0) from athlete3.session_exercises se join athlete3.strength_sets s on s.session_exercise_id = se.id
                     where se.session_id = w.id and se.deleted_at is null and s.deleted_at is null and s.set_type = 'working')
      ) order by w.local_date desc, w.started_at desc), '[]'::jsonb)
      from athlete3.workout_sessions w
      left join athlete3.training_days d on d.id = w.training_day_id
      left join athlete3.training_plans p on p.id = d.plan_id
      where w.user_id = p_client_id and w.status = 'completed' and w.deleted_at is null and w.local_date >= v_from),
    'cardio', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', c.id, 'localDate', c.local_date, 'activity', c.activity, 'minutes', round(c.duration_seconds / 60.0),
        'distanceM', c.distance_m, 'rpe', c.rpe) order by c.local_date desc, c.started_at desc), '[]'::jsonb)
      from athlete3.cardio_sessions c
      where c.user_id = p_client_id and c.deleted_at is null and c.local_date >= v_from),
    'weeks', (
      select coalesce(jsonb_agg(jsonb_build_object('weekStart', wk.week_start, 'done', wk.done) order by wk.week_start desc), '[]'::jsonb)
      from (
        select ws.week_start,
          (select count(*) from athlete3.workout_sessions w where w.user_id = p_client_id and w.status = 'completed' and w.deleted_at is null
             and w.local_date >= ws.week_start and w.local_date < ws.week_start + 7)
          + (select count(*) from athlete3.cardio_sessions c where c.user_id = p_client_id and c.deleted_at is null
             and c.local_date >= ws.week_start and c.local_date < ws.week_start + 7) as done
        from (select (date_trunc('week', current_date)::date - 7 * g) as week_start from generate_series(0, 3) g) ws
      ) wk),
    'topLifts', (
      select coalesce(jsonb_agg(t order by (t ->> 'e1rmKg')::numeric desc), '[]'::jsonb) from (
        select jsonb_build_object('exercise', e.name, 'e1rmKg', round(max(s.weight_kg * (1 + s.reps / 30.0)), 1),
          'bestWeightKg', max(s.weight_kg)) as t
        from athlete3.workout_sessions w
        join athlete3.session_exercises se on se.session_id = w.id and se.deleted_at is null
        join athlete3.strength_sets s on s.session_exercise_id = se.id and s.deleted_at is null and s.set_type = 'working'
        join athlete3.exercises e on e.id = se.exercise_id
        where w.user_id = p_client_id and w.status = 'completed' and w.deleted_at is null and w.local_date >= v_from
          and s.weight_kg > 0 and s.reps between 1 and 30
        group by e.name
        order by max(s.weight_kg * (1 + s.reps / 30.0)) desc
        limit 6) x)
  );
end;
$$;

-- Programas del atleta (los suyos y los que le asignó este coach), para que el coach sepa qué tiene.
create function athlete3.coach_list_client_plans(p_client_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := athlete3_private.require_coach();
begin
  perform athlete3_private.require_scope_link(v_uid, p_client_id, 'training');
  return (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', p.id, 'name', p.name, 'kind', p.kind, 'status', p.status, 'updatedAt', p.updated_at,
      'assignedByMe', p.assigned_by = v_uid, 'assignedByName', p.assigned_by_name,
      'days', (select count(*) from athlete3.training_days d where d.plan_id = p.id and d.deleted_at is null and d.kind = 'training')
    ) order by p.updated_at desc), '[]'::jsonb)
    from athlete3.training_plans p where p.user_id = p_client_id and p.deleted_at is null);
end;
$$;

-- Copia un programa (o rutina) DEL COACH, ya sincronizado, a la cuenta del atleta: plan, días, bloques y ejercicios.
-- Solo ejercicios del catálogo global (los personalizados del coach no existen para el atleta).
create function athlete3.coach_assign_plan(p_client_id uuid, p_plan_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := athlete3_private.require_coach();
  v_src athlete3.training_plans;
  v_plan uuid := gen_random_uuid();
  v_day uuid;
  v_block uuid;
  v_blocks jsonb;
  v_name text;
  d athlete3.training_days;
  b athlete3.training_blocks;
begin
  perform athlete3_private.require_scope_link(v_uid, p_client_id, 'training');
  perform athlete3_private.consume_rate_limit('coach_assign', 60, 3600);
  select * into v_src from athlete3.training_plans p where p.id = p_plan_id and p.user_id = v_uid and p.deleted_at is null;
  if v_src.id is null then
    raise exception using errcode = 'P0001', message = 'ATHLETE:NOT_FOUND', detail = 'el programa no existe en tu cuenta (sincroniza primero)';
  end if;
  if exists (
    select 1 from athlete3.training_days dd join athlete3.training_day_exercises te on te.training_day_id = dd.id and te.deleted_at is null
    join athlete3.exercises e on e.id = te.exercise_id
    where dd.plan_id = p_plan_id and dd.deleted_at is null and e.user_id is not null) then
    raise exception using errcode = 'P0001', message = 'ATHLETE:VALIDATION_FAILED', detail = 'usa ejercicios personalizados';
  end if;
  if not exists (select 1 from athlete3.training_days dd where dd.plan_id = p_plan_id and dd.deleted_at is null) then
    raise exception using errcode = 'P0001', message = 'ATHLETE:VALIDATION_FAILED', detail = 'el programa no tiene días';
  end if;
  v_name := athlete3_private.display_name_of(v_uid);

  insert into athlete3.training_plans
  select (jsonb_populate_record(null::athlete3.training_plans, to_jsonb(v_src) || jsonb_build_object(
    'id', v_plan, 'user_id', p_client_id, 'status', 'active', 'deleted_at', null, 'last_mutation_id', null,
    'assigned_by', v_uid, 'assigned_by_name', v_name))).*;

  for d in select * from athlete3.training_days dd where dd.plan_id = p_plan_id and dd.deleted_at is null order by dd.position loop
    v_day := gen_random_uuid();
    insert into athlete3.training_days
    select (jsonb_populate_record(null::athlete3.training_days, to_jsonb(d) || jsonb_build_object(
      'id', v_day, 'user_id', p_client_id, 'plan_id', v_plan, 'last_mutation_id', null))).*;
    v_blocks := '{}'::jsonb;
    for b in select * from athlete3.training_blocks tb where tb.training_day_id = d.id and tb.deleted_at is null order by tb.position loop
      v_block := gen_random_uuid();
      v_blocks := v_blocks || jsonb_build_object(b.id::text, v_block);
      insert into athlete3.training_blocks
      select (jsonb_populate_record(null::athlete3.training_blocks, to_jsonb(b) || jsonb_build_object(
        'id', v_block, 'user_id', p_client_id, 'training_day_id', v_day, 'last_mutation_id', null))).*;
    end loop;
    insert into athlete3.training_day_exercises
    select (jsonb_populate_record(null::athlete3.training_day_exercises, to_jsonb(te) || jsonb_build_object(
      'id', gen_random_uuid(), 'user_id', p_client_id, 'training_day_id', v_day, 'last_mutation_id', null,
      'block_id', v_blocks -> (te.block_id::text)))).*
    from athlete3.training_day_exercises te
    where te.training_day_id = d.id and te.deleted_at is null
    order by te.position;
  end loop;
  return jsonb_build_object('planId', v_plan);
end;
$$;

-- Retira un programa que este coach asignó (borrado lógico; el historial de sesiones se conserva).
create function athlete3.coach_remove_plan(p_client_id uuid, p_plan_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := athlete3_private.require_coach();
begin
  perform athlete3_private.require_scope_link(v_uid, p_client_id, 'training');
  update athlete3.training_plans set deleted_at = now()
  where id = p_plan_id and user_id = p_client_id and assigned_by = v_uid and deleted_at is null;
  if not found then
    raise exception using errcode = 'P0001', message = 'ATHLETE:NOT_FOUND', detail = 'programa no encontrado';
  end if;
end;
$$;

create function athlete3.coach_add_comment(p_client_id uuid, p_target_type text, p_target_id uuid, p_body text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := athlete3_private.require_coach();
  v_id uuid := gen_random_uuid();
  v_body text := btrim(coalesce(p_body, ''));
begin
  perform athlete3_private.require_scope_link(v_uid, p_client_id, 'training');
  perform athlete3_private.consume_rate_limit('coach_comment', 120, 3600);
  if p_target_type not in ('general', 'session', 'plan') or length(v_body) not between 1 and 1000
     or (p_target_type = 'general') <> (p_target_id is null)
     or (p_target_type = 'session' and not exists (select 1 from athlete3.workout_sessions w where w.id = p_target_id and w.user_id = p_client_id and w.deleted_at is null))
     or (p_target_type = 'plan' and not exists (select 1 from athlete3.training_plans p where p.id = p_target_id and p.user_id = p_client_id and p.deleted_at is null)) then
    raise exception using errcode = 'P0001', message = 'ATHLETE:VALIDATION_FAILED', detail = 'comentario no válido';
  end if;
  insert into athlete3.coach_comments (id, user_id, author_id, author_name, target_type, target_id, body)
  values (v_id, p_client_id, v_uid, athlete3_private.display_name_of(v_uid), p_target_type, p_target_id, v_body);
  return jsonb_build_object('id', v_id);
end;
$$;

create function athlete3.coach_list_comments(p_client_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := athlete3_private.require_coach();
begin
  perform athlete3_private.require_scope_link(v_uid, p_client_id, 'training');
  return (
    select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'targetType', c.target_type, 'targetId', c.target_id,
      'body', c.body, 'createdAt', c.created_at) order by c.created_at desc), '[]'::jsonb)
    from (select * from athlete3.coach_comments c
          where c.user_id = p_client_id and c.author_id = v_uid and c.deleted_at is null
          order by c.created_at desc limit 100) c);
end;
$$;

create function athlete3.coach_delete_comment(p_comment_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := athlete3_private.require_coach();
begin
  update athlete3.coach_comments set deleted_at = now()
  where id = p_comment_id and author_id = v_uid and deleted_at is null;
  if not found then
    raise exception using errcode = 'P0001', message = 'ATHLETE:NOT_FOUND', detail = 'comentario no encontrado';
  end if;
end;
$$;

revoke all on function athlete3.coach_create_invite() from public;
revoke all on function athlete3.coach_list_clients() from public;
revoke all on function athlete3.coach_client_summary(uuid, integer) from public;
revoke all on function athlete3.coach_list_client_plans(uuid) from public;
revoke all on function athlete3.coach_assign_plan(uuid, uuid) from public;
revoke all on function athlete3.coach_remove_plan(uuid, uuid) from public;
revoke all on function athlete3.coach_add_comment(uuid, text, uuid, text) from public;
revoke all on function athlete3.coach_list_comments(uuid) from public;
revoke all on function athlete3.coach_delete_comment(uuid) from public;
grant execute on function athlete3.coach_create_invite() to authenticated;
grant execute on function athlete3.coach_list_clients() to authenticated;
grant execute on function athlete3.coach_client_summary(uuid, integer) to authenticated;
grant execute on function athlete3.coach_list_client_plans(uuid) to authenticated;
grant execute on function athlete3.coach_assign_plan(uuid, uuid) to authenticated;
grant execute on function athlete3.coach_remove_plan(uuid, uuid) to authenticated;
grant execute on function athlete3.coach_add_comment(uuid, text, uuid, text) to authenticated;
grant execute on function athlete3.coach_list_comments(uuid) to authenticated;
grant execute on function athlete3.coach_delete_comment(uuid) to authenticated;
revoke all on function athlete3_private.role_for_scope(text) from public, authenticated;
revoke all on function athlete3_private.require_coach() from public, authenticated;
revoke all on function athlete3_private.require_scope_link(uuid, uuid, text) from public, authenticated;

-- ---------------------------------------------------------------------------------
-- 5. Sync: lista blanca y pull con coach_comment (copia de 20261111000100 + coach_comment)
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
    when 'coach_comment' then 'athlete3.coach_comments'::regclass
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
    union all select 'coach_comment', to_jsonb(t) from athlete3.coach_comments t where t.user_id = v_uid and t.change_seq > v_after
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
