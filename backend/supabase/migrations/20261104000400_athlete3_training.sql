-- =====================================================================================
-- ATHLETE 3.0 — 0400 Programación y sesiones de fuerza
-- SOLO ENTORNO LOCAL hasta aprobación explícita.
-- =====================================================================================

-- Aplica el paquete de seguridad estándar a una tabla sincronizable propiedad del usuario:
-- trigger común, RLS habilitado y forzado, políticas select/insert/update por propietario,
-- privilegios mínimos (sin DELETE: el borrado es lógico) e índice de pull.
-- Solo se usa durante migraciones (sin GRANT a ningún rol de aplicación).
create function athlete3_private.secure_synced_table(p_table regclass)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_name text := (select c.relname from pg_catalog.pg_class c where c.oid = p_table);
begin
  execute format('create trigger %I before insert or update on %s for each row execute function athlete3_private.tg_synced_row()',
                 v_name || '_synced', p_table);
  execute format('alter table %s enable row level security', p_table);
  execute format('alter table %s force row level security', p_table);
  execute format('create policy %I on %s for select to authenticated using (user_id = (select auth.uid()))',
                 v_name || '_select_own', p_table);
  execute format('create policy %I on %s for insert to authenticated with check (user_id = (select auth.uid()))',
                 v_name || '_insert_own', p_table);
  execute format('create policy %I on %s for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))',
                 v_name || '_update_own', p_table);
  execute format('revoke all on %s from public, anon, authenticated', p_table);
  execute format('grant select, insert, update on %s to authenticated', p_table);
  execute format('grant all on %s to service_role', p_table);
  execute format('create index %I on %s (user_id, change_seq)', v_name || '_sync_idx', p_table);
end;
$$;
revoke all on function athlete3_private.secure_synced_table(regclass) from public, authenticated;

-- Política restrictiva: el ejercicio referenciado debe ser visible (global o propio).
create function athlete3_private.restrict_exercise_visibility(p_table regclass)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_name text := (select c.relname from pg_catalog.pg_class c where c.oid = p_table);
begin
  execute format($f$create policy %I on %s as restrictive for insert to authenticated
    with check (exists (select 1 from athlete3.exercises e where e.id = exercise_id
                        and (e.user_id is null or e.user_id = (select auth.uid())) and e.deleted_at is null))$f$,
    v_name || '_exercise_visible_ins', p_table);
  execute format($f$create policy %I on %s as restrictive for update to authenticated
    using (true)
    with check (exists (select 1 from athlete3.exercises e where e.id = exercise_id
                        and (e.user_id is null or e.user_id = (select auth.uid()))))$f$,
    v_name || '_exercise_visible_upd', p_table);
end;
$$;
revoke all on function athlete3_private.restrict_exercise_visibility(regclass) from public, authenticated;

-- Al eliminar un padre, propaga el tombstone a sus hijos (cada hijo recibe revisión y change_seq).
create function athlete3_private.tg_cascade_tombstone()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_child regclass := tg_argv[0]::regclass;
  v_fk text := tg_argv[1];
begin
  if new.deleted_at is not null and old.deleted_at is null then
    execute format('update %s set deleted_at = now() where %I = $1 and deleted_at is null', v_child, v_fk)
      using new.id;
  end if;
  return null;
end;
$$;
grant execute on function athlete3_private.tg_cascade_tombstone() to authenticated, service_role;

-- ---------- Programación (lo planificado) ----------
create table athlete3.training_plans (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 120),
  description text check (description is null or length(description) <= 2000),
  status text not null default 'draft' check (status in ('draft', 'active', 'archived')),
  starts_on date,
  ends_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  revision bigint not null default 1,
  change_seq bigint not null default 0,
  last_mutation_id uuid,
  unique (id, user_id),
  check (starts_on is null or ends_on is null or starts_on <= ends_on)
);
select athlete3_private.secure_synced_table('athlete3.training_plans');

create table athlete3.training_days (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  plan_id uuid not null,
  position integer not null check (position between 0 and 1000),
  name text not null check (length(btrim(name)) between 1 and 120),
  kind text not null default 'training' check (kind in ('training', 'rest')),
  notes text check (notes is null or length(notes) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  revision bigint not null default 1,
  change_seq bigint not null default 0,
  last_mutation_id uuid,
  unique (id, user_id),
  -- FK compuesta: el padre debe pertenecer al mismo usuario.
  foreign key (plan_id, user_id) references athlete3.training_plans (id, user_id) on delete cascade
);
create index training_days_plan_idx on athlete3.training_days (plan_id);
select athlete3_private.secure_synced_table('athlete3.training_days');

create table athlete3.training_day_exercises (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  training_day_id uuid not null,
  exercise_id uuid not null references athlete3.exercises (id),
  position integer not null check (position between 0 and 1000),
  target_sets integer check (target_sets is null or target_sets between 1 and 50),
  target_reps_min integer check (target_reps_min is null or target_reps_min between 1 and 1000),
  target_reps_max integer check (target_reps_max is null or target_reps_max between 1 and 1000),
  target_weight_kg numeric(6, 2) check (target_weight_kg is null or target_weight_kg between 0 and 1000),
  target_rir numeric(3, 1) check (target_rir is null or (target_rir between 0 and 10 and athlete3_private.is_half_step(target_rir))),
  target_rest_seconds integer check (target_rest_seconds is null or target_rest_seconds between 0 and 3600),
  target_duration_seconds integer check (target_duration_seconds is null or target_duration_seconds between 1 and 86400),
  target_distance_m numeric(9, 2) check (target_distance_m is null or (target_distance_m > 0 and target_distance_m <= 1000000)),
  notes text check (notes is null or length(notes) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  revision bigint not null default 1,
  change_seq bigint not null default 0,
  last_mutation_id uuid,
  unique (id, user_id),
  foreign key (training_day_id, user_id) references athlete3.training_days (id, user_id) on delete cascade,
  check (target_reps_min is null or target_reps_max is null or target_reps_min <= target_reps_max)
);
create index training_day_exercises_day_idx on athlete3.training_day_exercises (training_day_id);
create index training_day_exercises_exercise_idx on athlete3.training_day_exercises (exercise_id);
select athlete3_private.secure_synced_table('athlete3.training_day_exercises');
select athlete3_private.restrict_exercise_visibility('athlete3.training_day_exercises');

create trigger training_plans_cascade after update of deleted_at on athlete3.training_plans
  for each row execute function athlete3_private.tg_cascade_tombstone('athlete3.training_days', 'plan_id');
create trigger training_days_cascade after update of deleted_at on athlete3.training_days
  for each row execute function athlete3_private.tg_cascade_tombstone('athlete3.training_day_exercises', 'training_day_id');

-- ---------- Sesiones de fuerza (lo ejecutado) ----------
create table athlete3.workout_sessions (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  status text not null default 'in_progress' check (status in ('in_progress', 'completed', 'discarded')),
  training_day_id uuid,
  title text check (title is null or length(title) <= 120),
  started_at timestamptz not null,
  ended_at timestamptz,
  time_zone text not null check (athlete3_private.is_valid_time_zone(time_zone)),
  local_date date not null,
  source text not null default 'manual' check (source in ('manual', 'imported', 'estimated', 'ai_generated', 'device')),
  notes text check (notes is null or length(notes) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  revision bigint not null default 1,
  change_seq bigint not null default 0,
  last_mutation_id uuid,
  unique (id, user_id),
  foreign key (training_day_id, user_id) references athlete3.training_days (id, user_id),
  -- La fecha deportiva debe ser la fecha local real del inicio (data-model §7).
  constraint workout_sessions_local_date_matches check (local_date = (started_at at time zone time_zone)::date),
  constraint workout_sessions_times check (ended_at is null or ended_at >= started_at),
  constraint workout_sessions_completed_has_end check (status <> 'completed' or ended_at is not null),
  constraint workout_sessions_sane_dates check (started_at > '2000-01-01' and started_at < now() + interval '2 days')
);
-- Como máximo una sesión en curso por usuario.
create unique index workout_sessions_one_in_progress on athlete3.workout_sessions (user_id)
  where status = 'in_progress' and deleted_at is null;
create index workout_sessions_history_idx on athlete3.workout_sessions (user_id, local_date desc);
select athlete3_private.secure_synced_table('athlete3.workout_sessions');

-- Transiciones de estado (misma regla que @athlete/domain session.ts).
create function athlete3_private.tg_workout_session_transition()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status is distinct from old.status
     and not (old.status = 'in_progress' and new.status in ('completed', 'discarded')) then
    raise exception using errcode = 'P0001', message = 'ATHLETE:INVALID_STATE',
      detail = format('transición %s → %s no permitida', old.status, new.status);
  end if;
  return new;
end;
$$;
grant execute on function athlete3_private.tg_workout_session_transition() to authenticated, service_role;
create trigger workout_sessions_transition before update on athlete3.workout_sessions
  for each row execute function athlete3_private.tg_workout_session_transition();

create table athlete3.session_exercises (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  session_id uuid not null,
  exercise_id uuid not null references athlete3.exercises (id),
  training_day_exercise_id uuid,
  position integer not null check (position between 0 and 1000),
  notes text check (notes is null or length(notes) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  revision bigint not null default 1,
  change_seq bigint not null default 0,
  last_mutation_id uuid,
  unique (id, user_id),
  foreign key (session_id, user_id) references athlete3.workout_sessions (id, user_id) on delete cascade,
  foreign key (training_day_exercise_id, user_id) references athlete3.training_day_exercises (id, user_id)
);
create index session_exercises_session_idx on athlete3.session_exercises (session_id);
create index session_exercises_exercise_idx on athlete3.session_exercises (exercise_id);
select athlete3_private.secure_synced_table('athlete3.session_exercises');
select athlete3_private.restrict_exercise_visibility('athlete3.session_exercises');

create table athlete3.strength_sets (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  session_exercise_id uuid not null,
  position integer not null check (position between 0 and 1000),
  set_type text not null default 'working' check (set_type in ('warmup', 'working')),
  weight_kg numeric(6, 2) check (weight_kg is null or weight_kg between 0 and 1000),
  reps integer check (reps is null or reps between 0 and 1000),
  rir numeric(3, 1) check (rir is null or (rir between 0 and 10 and athlete3_private.is_half_step(rir))),
  rpe numeric(3, 1) check (rpe is null or (rpe between 1 and 10 and athlete3_private.is_half_step(rpe))),
  rest_seconds integer check (rest_seconds is null or rest_seconds between 0 and 3600),
  duration_seconds integer check (duration_seconds is null or duration_seconds between 0 and 86400),
  distance_m numeric(9, 2) check (distance_m is null or distance_m between 0 and 1000000),
  completed_at timestamptz,
  notes text check (notes is null or length(notes) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  revision bigint not null default 1,
  change_seq bigint not null default 0,
  last_mutation_id uuid,
  unique (id, user_id),
  foreign key (session_exercise_id, user_id) references athlete3.session_exercises (id, user_id) on delete cascade
);
create index strength_sets_session_exercise_idx on athlete3.strength_sets (session_exercise_id);
select athlete3_private.secure_synced_table('athlete3.strength_sets');

-- No se edita contenido de una sesión descartada (salvo borrarlo).
create function athlete3_private.tg_session_content_editable()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_status text;
begin
  if new.deleted_at is not null then
    return new;
  end if;
  if tg_table_name = 'session_exercises' then
    select s.status into v_status from athlete3.workout_sessions s where s.id = new.session_id;
  else
    select s.status into v_status
    from athlete3.session_exercises e join athlete3.workout_sessions s on s.id = e.session_id
    where e.id = new.session_exercise_id;
  end if;
  if v_status = 'discarded' then
    raise exception using errcode = 'P0001', message = 'ATHLETE:INVALID_STATE',
      detail = 'la sesión está descartada';
  end if;
  return new;
end;
$$;
grant execute on function athlete3_private.tg_session_content_editable() to authenticated, service_role;
create trigger session_exercises_editable before insert or update on athlete3.session_exercises
  for each row execute function athlete3_private.tg_session_content_editable();
create trigger strength_sets_editable before insert or update on athlete3.strength_sets
  for each row execute function athlete3_private.tg_session_content_editable();

create trigger workout_sessions_cascade after update of deleted_at on athlete3.workout_sessions
  for each row execute function athlete3_private.tg_cascade_tombstone('athlete3.session_exercises', 'session_id');
create trigger session_exercises_cascade after update of deleted_at on athlete3.session_exercises
  for each row execute function athlete3_private.tg_cascade_tombstone('athlete3.strength_sets', 'session_exercise_id');
