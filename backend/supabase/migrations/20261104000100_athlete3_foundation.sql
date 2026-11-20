-- =====================================================================================
-- ATHLETE 3.0 — 0100 Fundación: esquemas, privilegios y utilidades privadas
--
-- SOLO ENTORNO LOCAL. No aplicar a ningún proyecto remoto sin aprobación explícita
-- del propietario (ADR-0001, docs/architecture/schema-isolation.md).
--
-- Convenciones de error: las funciones lanzan `ATHLETE:<CODIGO>` con SQLSTATE P0001
-- (o 28000 para no autenticado). <CODIGO> coincide con `ErrorCode` de @athlete/contracts.
-- =====================================================================================

create schema if not exists athlete3;
create schema if not exists athlete3_private;

comment on schema athlete3 is 'ATHLETE 3.0 — objetos expuestos a la app (Data API). Todo protegido por RLS.';
comment on schema athlete3_private is 'ATHLETE 3.0 — helpers internos. NUNCA exponer en Data API.';

-- ---------- Privilegios de esquema ----------
-- PUBLIC y anon no tienen acceso a nada de ATHLETE 3.0.
revoke all on schema athlete3 from public;
revoke all on schema athlete3_private from public;
grant usage on schema athlete3 to authenticated, service_role;
-- authenticated necesita USAGE en el privado para que los triggers (SECURITY INVOKER) usen la
-- secuencia y los helpers. El esquema no se expone por API y sus tablas no tienen GRANT.
grant usage on schema athlete3_private to authenticated, service_role;

alter default privileges in schema athlete3 revoke all on tables from public, anon, authenticated;
alter default privileges in schema athlete3 revoke all on sequences from public, anon, authenticated;
alter default privileges in schema athlete3_private revoke all on tables from public, anon, authenticated;
alter default privileges in schema athlete3_private revoke all on sequences from public, anon, authenticated;
-- IMPORTANTE: Postgres concede EXECUTE a PUBLIC en toda función nueva y ese valor global no se
-- puede revocar "por esquema"; revocarlo globalmente afectaría a otros esquemas del proyecto.
-- Por eso cada migración termina con `revoke execute on all functions ... from public` y la
-- migración 0900 verifica (y falla) si queda alguna función o tabla expuesta a PUBLIC/anon.

-- ---------- Secuencia global de cambios (cursor de pull) ----------
create sequence athlete3_private.change_seq as bigint;
grant usage on sequence athlete3_private.change_seq to authenticated, service_role;

-- ---------- Validaciones reutilizables ----------
create function athlete3_private.is_valid_time_zone(tz text)
returns boolean
language sql
stable
set search_path = ''
as $$
  select tz is not null and exists (select 1 from pg_catalog.pg_timezone_names where name = tz)
$$;

-- Todos los elementos no vacíos y con longitud máxima.
create function athlete3_private.text_items_ok(items text[], max_len integer)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(bool_and(length(btrim(i)) between 1 and max_len), true) from unnest(items) as i
$$;

-- Múltiplo de 0.5 (RIR / RPE).
create function athlete3_private.is_half_step(v numeric)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select v is null or (v * 2) = trunc(v * 2)
$$;

grant execute on function athlete3_private.is_valid_time_zone(text) to authenticated, service_role;
grant execute on function athlete3_private.text_items_ok(text[], integer) to authenticated, service_role;
grant execute on function athlete3_private.is_half_step(numeric) to authenticated, service_role;

-- ---------- Identidad ----------
-- Devuelve auth.uid() o falla. Nunca se usa un user_id enviado por el cliente.
create function athlete3_private.require_user_id()
returns uuid
language plpgsql
stable
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception using errcode = '28000', message = 'ATHLETE:UNAUTHENTICATED';
  end if;
  return v_uid;
end;
$$;
grant execute on function athlete3_private.require_user_id() to authenticated, service_role;

-- Serializa las escrituras de un mismo usuario hasta el fin de la transacción.
-- Garantiza que, por usuario, el orden de `change_seq` coincide con el orden de commit,
-- de modo que el cursor de pull nunca salta cambios aún no confirmados (ADR-0003 §2.6).
create function athlete3_private.lock_user(p_user_id uuid)
returns void
language sql
volatile
set search_path = ''
as $$
  select pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('athlete3:' || p_user_id::text, 0))
$$;
grant execute on function athlete3_private.lock_user(uuid) to authenticated, service_role;

-- ---------- Trigger común de registros sincronizables ----------
-- Columnas requeridas: id, user_id, created_at, updated_at, deleted_at, revision, change_seq, last_mutation_id.
--
-- Reglas:
--  * INSERT por un usuario: user_id := auth.uid(); si el cliente envía otro user_id → FORBIDDEN.
--  * id, user_id y created_at son inmutables.
--  * Control optimista: un UPDATE debe traer la misma `revision` que la fila actual (si no → CONFLICT).
--    El servidor incrementa `revision`; el cliente nunca la fija.
--  * Un tombstone (deleted_at no nulo) es definitivo: no se puede editar ni "resucitar".
--  * Cada cambio recibe un `change_seq` nuevo y registra la mutación de sync que lo produjo.
create function athlete3_private.tg_synced_row()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_is_end_user boolean := current_user in ('authenticated', 'anon');
  v_mutation uuid := nullif(current_setting('athlete3.mutation_id', true), '')::uuid;
begin
  if tg_op = 'INSERT' then
    if v_is_end_user then
      if v_uid is null then
        raise exception using errcode = '28000', message = 'ATHLETE:UNAUTHENTICATED';
      end if;
      if new.user_id is not null and new.user_id <> v_uid then
        raise exception using errcode = '42501', message = 'ATHLETE:FORBIDDEN',
          detail = 'user_id no coincide con la identidad autenticada';
      end if;
      new.user_id := v_uid;
    end if;
    if new.user_id is not null then
      perform athlete3_private.lock_user(new.user_id);
    end if;
    new.created_at := now();
    new.updated_at := now();
    new.revision := 1;
    if new.deleted_at is not null then
      raise exception using errcode = 'P0001', message = 'ATHLETE:VALIDATION_FAILED',
        detail = 'no se puede crear un registro ya eliminado';
    end if;
  else
    if new.id is distinct from old.id or new.user_id is distinct from old.user_id then
      raise exception using errcode = '42501', message = 'ATHLETE:FORBIDDEN',
        detail = 'id y user_id son inmutables';
    end if;
    if old.deleted_at is not null then
      raise exception using errcode = 'P0001', message = 'ATHLETE:INVALID_STATE',
        detail = 'el registro está eliminado';
    end if;
    if new.revision is distinct from old.revision then
      raise exception using errcode = 'P0001', message = 'ATHLETE:CONFLICT',
        detail = 'la revisión no coincide con la actual';
    end if;
    if old.user_id is not null then
      perform athlete3_private.lock_user(old.user_id);
    end if;
    new.created_at := old.created_at;
    new.updated_at := now();
    new.revision := old.revision + 1;
    if new.deleted_at is not null then
      new.deleted_at := now();
    end if;
  end if;
  new.change_seq := nextval('athlete3_private.change_seq');
  new.last_mutation_id := v_mutation;
  return new;
end;
$$;
grant execute on function athlete3_private.tg_synced_row() to authenticated, service_role;

-- ---------- Límite de frecuencia por usuario ----------
create table athlete3_private.rate_limit_buckets (
  user_id uuid not null references auth.users (id) on delete cascade,
  bucket text not null check (length(bucket) between 1 and 64),
  window_start timestamptz not null,
  hits integer not null check (hits >= 0),
  primary key (user_id, bucket)
);
alter table athlete3_private.rate_limit_buckets enable row level security;
alter table athlete3_private.rate_limit_buckets force row level security;
-- Sin GRANT ni políticas para authenticated: solo accesible vía la función SECURITY DEFINER.

-- Ventana fija. Consume un intento del usuario autenticado (no se puede apuntar a otro usuario).
create function athlete3_private.consume_rate_limit(p_bucket text, p_max integer, p_window_seconds integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := athlete3_private.require_user_id();
  v_hits integer;
begin
  insert into athlete3_private.rate_limit_buckets as b (user_id, bucket, window_start, hits)
  values (v_uid, p_bucket, now(), 1)
  on conflict (user_id, bucket) do update
    set hits = case when b.window_start <= now() - make_interval(secs => p_window_seconds) then 1 else b.hits + 1 end,
        window_start = case when b.window_start <= now() - make_interval(secs => p_window_seconds) then now() else b.window_start end
  returning hits into v_hits;

  if v_hits > p_max then
    raise exception using errcode = 'P0001', message = 'ATHLETE:RATE_LIMITED',
      hint = format('máximo %s por %s s', p_max, p_window_seconds);
  end if;
end;
$$;
revoke all on function athlete3_private.consume_rate_limit(text, integer, integer) from public;
grant execute on function athlete3_private.consume_rate_limit(text, integer, integer) to authenticated;
