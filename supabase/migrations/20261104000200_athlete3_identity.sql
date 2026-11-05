-- =====================================================================================
-- ATHLETE 3.0 — 0200 Identidad: perfiles y roles administrativos
-- SOLO ENTORNO LOCAL hasta aprobación explícita.
--
-- No se crean triggers sobre auth.users (schema-isolation §6). El perfil se inicializa
-- con `athlete3.ensure_profile`, idempotente, invocada por la app tras iniciar sesión.
-- =====================================================================================

create table athlete3.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  -- Igual a `id`; existe para que el trigger común y las políticas sean uniformes.
  user_id uuid not null references auth.users (id) on delete cascade,
  display_name text check (display_name is null or length(btrim(display_name)) between 1 and 80),
  height_cm numeric(4, 1) check (height_cm is null or height_cm between 50 and 272),
  initial_weight_kg numeric(5, 2) check (initial_weight_kg is null or initial_weight_kg between 20 and 400),
  experience_level text check (experience_level is null or experience_level in ('beginner', 'intermediate', 'advanced')),
  goals text[] not null default '{}'
    check (cardinality(goals) <= 10 and athlete3_private.text_items_ok(goals, 200)),
  time_zone text not null check (athlete3_private.is_valid_time_zone(time_zone)),
  unit_system text not null default 'metric' check (unit_system in ('metric', 'imperial')),
  load_unit text not null default 'kg' check (load_unit in ('kg', 'lb')),
  week_starts_on smallint not null default 1 check (week_starts_on between 0 and 6),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  revision bigint not null default 1,
  change_seq bigint not null default 0,
  last_mutation_id uuid,
  constraint profiles_user_id_is_id check (user_id = id),
  constraint profiles_not_deletable check (deleted_at is null)
);
comment on table athlete3.profiles is 'Perfil deportivo y preferencias. Sin roles: los roles viven en athlete3_private.user_roles.';

create index profiles_sync_idx on athlete3.profiles (user_id, change_seq);

create trigger profiles_synced before insert or update on athlete3.profiles
  for each row execute function athlete3_private.tg_synced_row();

alter table athlete3.profiles enable row level security;
alter table athlete3.profiles force row level security;

create policy profiles_select_own on athlete3.profiles
  for select to authenticated using (user_id = (select auth.uid()));
create policy profiles_insert_own on athlete3.profiles
  for insert to authenticated with check (id = (select auth.uid()) and user_id = (select auth.uid()));
create policy profiles_update_own on athlete3.profiles
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
-- Sin política DELETE ni privilegio DELETE: el perfil se elimina solo con la cuenta (cascade desde auth.users).

grant select, insert, update on athlete3.profiles to authenticated;
grant all on athlete3.profiles to service_role;

-- ---------- Roles administrativos (privados) ----------
-- Ningún usuario puede leerlos ni modificarlos: no hay GRANT para authenticated.
-- Solo el propietario de la base (migraciones / service_role en servidor) asigna roles.
create table athlete3_private.user_roles (
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('admin')),
  granted_at timestamptz not null default now(),
  granted_by uuid references auth.users (id) on delete set null,
  primary key (user_id, role)
);
alter table athlete3_private.user_roles enable row level security;
alter table athlete3_private.user_roles force row level security;
grant all on athlete3_private.user_roles to service_role;

-- Consulta del propio rol (para un futuro panel). No acepta user_id: solo el autenticado.
create function athlete3.current_user_is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from athlete3_private.user_roles r
    where r.user_id = auth.uid() and r.role = 'admin'
  )
$$;
revoke all on function athlete3.current_user_is_admin() from public;
grant execute on function athlete3.current_user_is_admin() to authenticated;

-- ---------- Inicialización idempotente del perfil ----------
create function athlete3.ensure_profile(p_time_zone text, p_display_name text default null)
returns athlete3.profiles
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := athlete3_private.require_user_id();
  v_profile athlete3.profiles;
begin
  perform athlete3_private.consume_rate_limit('ensure_profile', 30, 60);

  insert into athlete3.profiles (id, user_id, time_zone, display_name)
  values (v_uid, v_uid, p_time_zone, p_display_name)
  on conflict (id) do nothing;

  select * into v_profile from athlete3.profiles where id = v_uid;
  return v_profile;
end;
$$;
revoke all on function athlete3.ensure_profile(text, text) from public;
grant execute on function athlete3.ensure_profile(text, text) to authenticated;
