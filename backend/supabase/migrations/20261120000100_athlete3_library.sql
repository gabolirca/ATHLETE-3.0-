-- =====================================================================================
-- ATHLETE 3.0 — Biblioteca ATHLETE: rutinas y programas por semanas hechos en el panel web.
--
--   * Lo crean el dueño ('admin') y los coaches del panel ('editor'). Las personas de la app solo LEEN lo publicado.
--   * Un editor crea borradores y edita los suyos mientras no estén publicados; solo el admin publica o archiva.
--   * Nada se borra físicamente: se archiva (status = 'archived').
--   * Rutina: lista de ejercicios del catálogo global (jsonb). Programa: calendario semana × día que apunta a rutinas.
-- =====================================================================================

alter table athlete3_private.user_roles drop constraint user_roles_role_check;
alter table athlete3_private.user_roles add constraint user_roles_role_check check (role in ('admin', 'nutritionist', 'coach', 'editor'));

-- Rol del usuario actual en el panel: 'admin', 'editor' o NULL.
create function athlete3.library_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when exists (select 1 from athlete3_private.user_roles r where r.user_id = auth.uid() and r.role = 'admin') then 'admin'
    when exists (select 1 from athlete3_private.user_roles r where r.user_id = auth.uid() and r.role = 'editor') then 'editor'
  end
$$;

-- ---------- Validación de contenido ----------
create function athlete3_private.library_check_exercises(p_items jsonb)
returns boolean
language plpgsql
stable
set search_path = ''
as $$
declare
  v_item jsonb;
begin
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) > 40 then return false; end if;
  for v_item in select * from jsonb_array_elements(p_items) loop
    if jsonb_typeof(v_item) <> 'object'
      or not (v_item ? 'exercise_id')
      or not exists (select 1 from athlete3.exercises e where e.id = (v_item->>'exercise_id')::uuid and e.user_id is null and e.deleted_at is null)
      or coalesce((v_item->>'sets')::int, 1) not between 1 and 20
      or coalesce((v_item->>'reps')::int, 1) not between 1 and 200
      or coalesce((v_item->>'rest_seconds')::int, 0) not between 0 and 900
      or length(coalesce(v_item->>'notes', '')) > 300
    then return false; end if;
  end loop;
  return true;
exception when others then return false;
end;
$$;

create function athlete3_private.library_check_schedule(p_items jsonb, p_weeks int, p_days int)
returns boolean
language plpgsql
stable
set search_path = ''
as $$
declare
  v_item jsonb;
begin
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) > 7 * 52 then return false; end if;
  for v_item in select * from jsonb_array_elements(p_items) loop
    if jsonb_typeof(v_item) <> 'object'
      or (v_item->>'week')::int not between 1 and p_weeks
      or (v_item->>'day')::int not between 1 and p_days
      or length(coalesce(v_item->>'title', '')) > 80
      or length(coalesce(v_item->>'notes', '')) > 500
      or (v_item ? 'routine_id' and v_item->>'routine_id' is not null
          and not exists (select 1 from athlete3.library_routines r where r.id = (v_item->>'routine_id')::uuid and r.status <> 'archived'))
    then return false; end if;
  end loop;
  -- Un solo registro por (semana, día).
  return (select count(*) = count(distinct ((x->>'week')::int, (x->>'day')::int)) from jsonb_array_elements(p_items) x);
exception when others then return false;
end;
$$;

-- ---------- Tablas ----------
create table athlete3.library_routines (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 80),
  description text check (description is null or length(description) <= 1000),
  icon text not null default 'dumbbell' check (icon ~ '^[a-z0-9-]{1,40}$'),
  color text not null default 'blue' check (color in ('blue', 'green', 'amber', 'red', 'cyan', 'purple')),
  level text not null default 'intermedio' check (level in ('principiante', 'intermedio', 'avanzado')),
  goal text check (goal is null or length(goal) <= 60),
  minutes integer check (minutes is null or minutes between 5 and 240),
  exercises jsonb not null default '[]' check (jsonb_typeof(exercises) = 'array'),
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  created_by uuid not null default auth.uid() references auth.users (id),
  updated_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz
);
create index library_routines_status_idx on athlete3.library_routines (status, updated_at desc);

create table athlete3.library_programs (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 80),
  description text check (description is null or length(description) <= 2000),
  icon text not null default 'calendar-check' check (icon ~ '^[a-z0-9-]{1,40}$'),
  color text not null default 'blue' check (color in ('blue', 'green', 'amber', 'red', 'cyan', 'purple')),
  level text not null default 'intermedio' check (level in ('principiante', 'intermedio', 'avanzado')),
  goal text check (goal is null or length(goal) <= 60),
  weeks integer not null default 4 check (weeks between 1 and 52),
  days_per_week integer not null default 4 check (days_per_week between 1 and 7),
  schedule jsonb not null default '[]' check (jsonb_typeof(schedule) = 'array'),
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  created_by uuid not null default auth.uid() references auth.users (id),
  updated_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz
);
create index library_programs_status_idx on athlete3.library_programs (status, updated_at desc);

-- Sello de quién/cuándo, y fecha de publicación. El autor original no se puede cambiar.
create function athlete3_private.tg_library_touch()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  if tg_op = 'UPDATE' then
    new.created_by := old.created_by;
    new.created_at := old.created_at;
  end if;
  if new.status = 'published' and (tg_op = 'INSERT' or old.status <> 'published') then new.published_at := now(); end if;
  return new;
end;
$$;
create trigger library_routines_touch before insert or update on athlete3.library_routines for each row execute function athlete3_private.tg_library_touch();
create trigger library_programs_touch before insert or update on athlete3.library_programs for each row execute function athlete3_private.tg_library_touch();

-- Validación del contenido (ejercicios del catálogo global, calendario dentro de semanas × días) y regla de publicación:
-- un programa publicado solo puede usar rutinas publicadas.
create function athlete3_private.tg_library_validate()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_table_name = 'library_routines' then
    if not athlete3_private.library_check_exercises(new.exercises) then
      raise exception using errcode = '23514', message = 'ATHLETE:VALIDATION_FAILED', detail = 'exercises';
    end if;
  else
    if not athlete3_private.library_check_schedule(new.schedule, new.weeks, new.days_per_week) then
      raise exception using errcode = '23514', message = 'ATHLETE:VALIDATION_FAILED', detail = 'schedule';
    end if;
    if new.status = 'published' and exists (
      select 1 from jsonb_array_elements(new.schedule) x
      join athlete3.library_routines r on r.id = (x->>'routine_id')::uuid
      where r.status <> 'published'
    ) then
      raise exception using errcode = '23514', message = 'ATHLETE:PROGRAM_HAS_UNPUBLISHED_ROUTINES';
    end if;
  end if;
  return new;
end;
$$;
create trigger library_routines_validate before insert or update on athlete3.library_routines for each row execute function athlete3_private.tg_library_validate();
create trigger library_programs_validate before insert or update on athlete3.library_programs for each row execute function athlete3_private.tg_library_validate();

-- ---------- Seguridad ----------
alter table athlete3.library_routines enable row level security;
alter table athlete3.library_routines force row level security;
alter table athlete3.library_programs enable row level security;
alter table athlete3.library_programs force row level security;

-- Leer: lo publicado cualquier usuario con sesión; el panel ve todo.
create policy library_routines_select on athlete3.library_routines for select to authenticated
  using (status = 'published' or athlete3.library_role() is not null);
create policy library_programs_select on athlete3.library_programs for select to authenticated
  using (status = 'published' or athlete3.library_role() is not null);

-- Crear: admin cualquier estado; editor solo borradores a su nombre.
create policy library_routines_insert on athlete3.library_routines for insert to authenticated
  with check (athlete3.library_role() = 'admin' or (athlete3.library_role() = 'editor' and created_by = auth.uid() and status = 'draft'));
create policy library_programs_insert on athlete3.library_programs for insert to authenticated
  with check (athlete3.library_role() = 'admin' or (athlete3.library_role() = 'editor' and created_by = auth.uid() and status = 'draft'));

-- Editar: admin todo; editor solo sus borradores y los deja en borrador.
create policy library_routines_update on athlete3.library_routines for update to authenticated
  using (athlete3.library_role() = 'admin' or (athlete3.library_role() = 'editor' and created_by = auth.uid() and status = 'draft'))
  with check (athlete3.library_role() = 'admin' or (athlete3.library_role() = 'editor' and created_by = auth.uid() and status = 'draft'));
create policy library_programs_update on athlete3.library_programs for update to authenticated
  using (athlete3.library_role() = 'admin' or (athlete3.library_role() = 'editor' and created_by = auth.uid() and status = 'draft'))
  with check (athlete3.library_role() = 'admin' or (athlete3.library_role() = 'editor' and created_by = auth.uid() and status = 'draft'));

grant select, insert, update on athlete3.library_routines, athlete3.library_programs to authenticated;
grant all on athlete3.library_routines, athlete3.library_programs to service_role;

-- ---------- Equipo del panel (solo admin) ----------
create function athlete3.library_team()
returns table (user_id uuid, email text, role text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if athlete3.library_role() is distinct from 'admin' then
    raise exception using errcode = '42501', message = 'ATHLETE:FORBIDDEN';
  end if;
  return query
    select u.id, u.email::text, r.role from athlete3_private.user_roles r join auth.users u on u.id = r.user_id
    where r.role in ('admin', 'editor') order by r.role, u.email;
end;
$$;

-- Da o quita el rol de editor por correo. La persona debe haber entrado al panel al menos una vez.
create function athlete3.library_set_editor(p_email text, p_enabled boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
begin
  if athlete3.library_role() is distinct from 'admin' then
    raise exception using errcode = '42501', message = 'ATHLETE:FORBIDDEN';
  end if;
  select u.id into v_uid from auth.users u where lower(u.email) = lower(btrim(p_email));
  if v_uid is null then
    raise exception using errcode = 'P0002', message = 'ATHLETE:USER_NOT_FOUND';
  end if;
  if p_enabled then
    insert into athlete3_private.user_roles (user_id, role, granted_by) values (v_uid, 'editor', auth.uid()) on conflict do nothing;
  else
    delete from athlete3_private.user_roles where user_id = v_uid and role = 'editor';
  end if;
end;
$$;

revoke all on function athlete3.library_role() from public;
revoke all on function athlete3.library_team() from public;
revoke all on function athlete3.library_set_editor(text, boolean) from public;
revoke all on function athlete3_private.library_check_exercises(jsonb) from public;
revoke all on function athlete3_private.library_check_schedule(jsonb, int, int) from public;
grant execute on function athlete3.library_role() to authenticated;
grant execute on function athlete3.library_team() to authenticated;
grant execute on function athlete3.library_set_editor(text, boolean) to authenticated;

-- ---------- Cierre de privilegios (se repite en cada lote) ----------
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
