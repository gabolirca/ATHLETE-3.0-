-- =====================================================================================
-- ATHLETE 3.0 — 0600 Sincronización: push idempotente y pull incremental
-- SOLO ENTORNO LOCAL hasta aprobación explícita.
--
-- Diseño: docs/decisions/0003-persistencia-y-sincronizacion.md.
-- Ambas funciones son SECURITY INVOKER: RLS y los triggers se aplican igual que a cualquier
-- escritura del usuario. No hay ruta privilegiada.
-- =====================================================================================

-- Mutaciones aplicadas (idempotencia). Solo se registran las aplicadas: conflictos y rechazos
-- no tienen efectos y se reevalúan si el cliente reintenta.
create table athlete3_private.sync_mutations (
  mutation_id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  device_id uuid not null,
  entity text not null,
  entity_id uuid not null,
  op text not null check (op in ('upsert', 'delete')),
  result_revision bigint not null,
  applied_at timestamptz not null default now()
);
create index sync_mutations_user_idx on athlete3_private.sync_mutations (user_id, applied_at);
alter table athlete3_private.sync_mutations enable row level security;
alter table athlete3_private.sync_mutations force row level security;
create policy sync_mutations_select_own on athlete3_private.sync_mutations
  for select to authenticated using (user_id = (select auth.uid()));
create policy sync_mutations_insert_own on athlete3_private.sync_mutations
  for insert to authenticated with check (user_id = (select auth.uid()));
grant select, insert on athlete3_private.sync_mutations to authenticated;
grant all on athlete3_private.sync_mutations to service_role;

-- Lista blanca entidad → tabla. Nada de nombres de tabla provenientes del cliente.
create function athlete3_private.sync_table(p_entity text)
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
    else null
  end
$$;

-- Columnas que el cliente puede escribir (todas salvo las gestionadas por el servidor).
create function athlete3_private.sync_writable_columns(p_table regclass)
returns text[]
language sql
stable
set search_path = ''
as $$
  select coalesce(array_agg(a.attname::text order by a.attnum), '{}')
  from pg_catalog.pg_attribute a
  where a.attrelid = p_table and a.attnum > 0 and not a.attisdropped and a.attgenerated = ''
    and a.attname not in ('id', 'user_id', 'created_at', 'updated_at', 'deleted_at', 'revision', 'change_seq', 'last_mutation_id')
$$;

create function athlete3_private.safe_message(p_code text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_code
    when 'VALIDATION_FAILED' then 'Los datos no son válidos.'
    when 'NOT_FOUND' then 'El registro no existe.'
    when 'FORBIDDEN' then 'Operación no permitida.'
    when 'INVALID_STATE' then 'El registro no admite esta operación en su estado actual.'
    when 'DUPLICATE' then 'El registro ya existe.'
    when 'CONFLICT' then 'El registro cambió en otro dispositivo.'
    when 'UNAUTHENTICATED' then 'Debes iniciar sesión.'
    when 'RATE_LIMITED' then 'Demasiadas solicitudes. Inténtalo más tarde.'
    else 'Error interno.'
  end
$$;

create function athlete3_private.rejected(p_mutation_id uuid, p_code text, p_details jsonb default null)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'status', 'rejected',
    'mutationId', p_mutation_id,
    'error', jsonb_strip_nulls(jsonb_build_object(
      'code', p_code,
      'message', athlete3_private.safe_message(p_code),
      'retryable', p_code in ('INTERNAL', 'RATE_LIMITED'),
      'details', p_details)))
$$;

grant execute on function athlete3_private.sync_table(text) to authenticated, service_role;
grant execute on function athlete3_private.sync_writable_columns(regclass) to authenticated, service_role;
grant execute on function athlete3_private.safe_message(text) to authenticated, service_role;
grant execute on function athlete3_private.rejected(uuid, text, jsonb) to authenticated, service_role;

-- ---------------------------------------------------------------------------------
-- PUSH
-- ---------------------------------------------------------------------------------
create function athlete3.sync_push(p_device_id uuid, p_mutations jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
set timezone = 'UTC'
as $$
declare
  v_uid uuid := athlete3_private.require_user_id();
  v_results jsonb := '[]'::jsonb;
  m jsonb;
  v_mid uuid;
  v_entity text;
  v_entity_id uuid;
  v_op text;
  v_base bigint;
  v_payload jsonb;
  v_table regclass;
  v_writable text[];
  v_keys text[];
  v_cols text;
  v_current jsonb;
  v_cur_rev bigint;
  v_rev bigint;
  v_done athlete3_private.sync_mutations;
  v_state text;
  v_msg text;
  v_constraint text;
  v_code text;
begin
  perform athlete3_private.consume_rate_limit('sync_push', 120, 60);

  -- Validación estructural del lote (defensa en profundidad; el cliente ya valida con Zod).
  if p_device_id is null or jsonb_typeof(p_mutations) is distinct from 'array'
     or jsonb_array_length(p_mutations) not between 1 and 100 then
    raise exception using errcode = 'P0001', message = 'ATHLETE:VALIDATION_FAILED', detail = 'lote no válido';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_mutations) e
    where jsonb_typeof(e) <> 'object'
       or not (e ?& array['mutationId', 'deviceId', 'entity', 'entityId', 'op', 'baseRevision', 'payload', 'clientRecordedAt'])
       or (e->>'mutationId') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       or (e->>'entityId') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       or (e->>'deviceId') is distinct from p_device_id::text
       or (e->>'op') not in ('upsert', 'delete')
       or not (jsonb_typeof(e->'baseRevision') in ('null', 'number'))
       or ((e->>'op') = 'upsert') <> (jsonb_typeof(e->'payload') = 'object')
       or ((e->>'op') = 'delete') <> (jsonb_typeof(e->'payload') = 'null')
       or length((e->'payload')::text) > 32768
  ) then
    raise exception using errcode = 'P0001', message = 'ATHLETE:VALIDATION_FAILED', detail = 'mutación mal formada';
  end if;

  -- Serializa las escrituras del usuario (orden de change_seq = orden de commit).
  perform athlete3_private.lock_user(v_uid);

  for m in select value from jsonb_array_elements(p_mutations) loop
    v_mid := (m->>'mutationId')::uuid;
    v_entity := m->>'entity';
    v_entity_id := (m->>'entityId')::uuid;
    v_op := m->>'op';
    v_base := (m->>'baseRevision')::bigint;
    v_payload := case when v_op = 'upsert' then m->'payload' end;

    begin
      -- 1) Idempotencia.
      select * into v_done from athlete3_private.sync_mutations where mutation_id = v_mid;
      if found then
        v_results := v_results || jsonb_build_array(
          jsonb_build_object('status', 'duplicate', 'mutationId', v_mid, 'revision', v_done.result_revision));
        continue;
      end if;
      -- Un mutation_id ajeno es invisible por RLS; el INSERT final fallará con 23505 → DUPLICATE.

      v_table := athlete3_private.sync_table(v_entity);
      if v_table is null then
        v_results := v_results || jsonb_build_array(
          athlete3_private.rejected(v_mid, 'VALIDATION_FAILED', jsonb_build_object('reason', 'entity_not_supported')));
        continue;
      end if;

      perform set_config('athlete3.mutation_id', v_mid::text, true);

      -- 2) Estado actual (RLS: solo filas propias; FOR UPDATE bloquea la fila).
      execute format('select to_jsonb(t) from %s t where t.id = $1 for update', v_table)
        into v_current using v_entity_id;
      v_cur_rev := (v_current->>'revision')::bigint;

      if v_op = 'upsert' then
        v_writable := athlete3_private.sync_writable_columns(v_table);
        select coalesce(array_agg(k order by k), '{}') into v_keys
        from jsonb_object_keys(v_payload - 'id') as k;
        if not (v_keys <@ v_writable) or (v_payload ? 'id' and v_payload->>'id' <> v_entity_id::text) then
          v_results := v_results || jsonb_build_array(athlete3_private.rejected(v_mid, 'VALIDATION_FAILED',
            jsonb_build_object('reason', 'unknown_or_server_managed_field',
              'fields', to_jsonb(array(select unnest(v_keys) except select unnest(v_writable))))));
          continue;
        end if;

        if v_current is null then
          if v_base is not null then
            v_results := v_results || jsonb_build_array(athlete3_private.rejected(v_mid, 'NOT_FOUND'));
            continue;
          end if;
          select string_agg(quote_ident(k), ', ') into v_cols from unnest(v_keys || array['id']) as k;
          execute format('insert into %1$s (%2$s) select %2$s from jsonb_populate_record(null::%1$s, $1) returning revision',
                         v_table, v_cols)
            into v_rev using v_payload || jsonb_build_object('id', v_entity_id);
        elsif (v_current->>'deleted_at') is not null or v_base is distinct from v_cur_rev then
          v_results := v_results || jsonb_build_array(jsonb_build_object(
            'status', 'conflict', 'mutationId', v_mid, 'serverRevision', v_cur_rev,
            'serverDeleted', (v_current->>'deleted_at') is not null,
            'serverRecord', case when (v_current->>'deleted_at') is null then v_current end));
          continue;
        elsif cardinality(v_keys) = 0 then
          v_rev := v_cur_rev; -- nada que cambiar
        else
          select string_agg(quote_ident(k), ', ') into v_cols from unnest(v_keys) as k;
          execute format('update %1$s t set (%2$s) = (select %2$s from jsonb_populate_record(null::%1$s, $1)), revision = $2 where t.id = $3 returning revision',
                         v_table, v_cols)
            into v_rev using v_payload, v_base, v_entity_id;
        end if;
      else -- delete
        if v_current is null then
          v_results := v_results || jsonb_build_array(athlete3_private.rejected(v_mid, 'NOT_FOUND'));
          continue;
        elsif (v_current->>'deleted_at') is not null then
          v_rev := v_cur_rev; -- ya eliminado: idempotente
        elsif v_base is distinct from v_cur_rev then
          v_results := v_results || jsonb_build_array(jsonb_build_object(
            'status', 'conflict', 'mutationId', v_mid, 'serverRevision', v_cur_rev,
            'serverDeleted', false, 'serverRecord', v_current));
          continue;
        else
          execute format('update %s t set deleted_at = now(), revision = $1 where t.id = $2 returning revision', v_table)
            into v_rev using v_base, v_entity_id;
        end if;
      end if;

      insert into athlete3_private.sync_mutations (mutation_id, user_id, device_id, entity, entity_id, op, result_revision)
      values (v_mid, v_uid, p_device_id, v_entity, v_entity_id, v_op, v_rev);

      v_results := v_results || jsonb_build_array(
        jsonb_build_object('status', 'applied', 'mutationId', v_mid, 'revision', v_rev));

    exception when others then
      -- El bloque revierte solo esta mutación; el resto del lote continúa.
      get stacked diagnostics v_state = returned_sqlstate, v_msg = message_text, v_constraint = constraint_name;
      v_code := case
        when v_msg like 'ATHLETE:%' then substr(v_msg, 9)
        when v_state = '23505' and v_constraint = 'workout_sessions_one_in_progress' then 'INVALID_STATE'
        when v_state = '23505' then 'DUPLICATE'
        when v_state = '42501' then 'FORBIDDEN'
        when v_state like '22%' or v_state like '23%' or v_state = '42804' then 'VALIDATION_FAILED'
        else 'INTERNAL'
      end;
      if v_code = 'CONFLICT' then
        v_code := 'INVALID_STATE';
      end if;
      v_results := v_results || jsonb_build_array(athlete3_private.rejected(v_mid, v_code,
        case when v_constraint is not null and v_code = 'VALIDATION_FAILED'
             then jsonb_build_object('constraint', v_constraint) end));
    end;
  end loop;

  perform set_config('athlete3.mutation_id', '', true);
  return jsonb_build_object('results', v_results);
end;
$$;
revoke all on function athlete3.sync_push(uuid, jsonb) from public;
grant execute on function athlete3.sync_push(uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------------------
-- PULL
-- ---------------------------------------------------------------------------------
create function athlete3.sync_pull(p_cursor text default null, p_limit integer default 200)
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
