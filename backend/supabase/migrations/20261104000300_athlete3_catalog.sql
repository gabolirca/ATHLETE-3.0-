-- =====================================================================================
-- ATHLETE 3.0 — 0300 Catálogo: grupos musculares, equipamiento y ejercicios
-- SOLO ENTORNO LOCAL hasta aprobación explícita.
--
-- Catálogo global (user_id NULL): solo lectura para usuarios, sembrado por migración con
-- UUID y slug estables. Ejercicios personalizados (user_id = dueño): CRUD propio vía sync.
-- =====================================================================================

create table athlete3.muscle_groups (
  id uuid primary key,
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) <= 80),
  name text not null check (length(btrim(name)) between 1 and 80)
);

create table athlete3.equipment (
  id uuid primary key,
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) <= 80),
  name text not null check (length(btrim(name)) between 1 and 80)
);

alter table athlete3.muscle_groups enable row level security;
alter table athlete3.muscle_groups force row level security;
alter table athlete3.equipment enable row level security;
alter table athlete3.equipment force row level security;

create policy muscle_groups_read on athlete3.muscle_groups for select to authenticated using (true);
create policy equipment_read on athlete3.equipment for select to authenticated using (true);

grant select on athlete3.muscle_groups, athlete3.equipment to authenticated;
grant all on athlete3.muscle_groups, athlete3.equipment to service_role;

create table athlete3.exercises (
  id uuid primary key,
  -- NULL = ejercicio global del catálogo; no nulo = personalizado del usuario.
  user_id uuid references auth.users (id) on delete cascade,
  slug text check (slug is null or (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) <= 80)),
  name text not null check (length(btrim(name)) between 1 and 120),
  modality text not null check (modality in ('strength', 'cardio')),
  load_type text not null check (load_type in ('external', 'bodyweight', 'assisted', 'time', 'none')),
  primary_muscle_group_ids uuid[] not null default '{}' check (cardinality(primary_muscle_group_ids) <= 10),
  secondary_muscle_group_ids uuid[] not null default '{}' check (cardinality(secondary_muscle_group_ids) <= 20),
  equipment_ids uuid[] not null default '{}' check (cardinality(equipment_ids) <= 10),
  instructions text check (instructions is null or length(instructions) <= 2000),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  revision bigint not null default 1,
  change_seq bigint not null default 0,
  last_mutation_id uuid,
  -- Los personalizados no usan slug global; los globales lo requieren.
  constraint exercises_slug_scope check ((user_id is null) = (slug is not null))
);

create unique index exercises_global_slug_key on athlete3.exercises (slug) where user_id is null;
create index exercises_sync_idx on athlete3.exercises (user_id, change_seq);
create index exercises_name_idx on athlete3.exercises (lower(name));

-- Integridad de las referencias en arrays (Postgres no admite FK sobre arrays).
create function athlete3_private.tg_exercise_refs()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (
    select 1 from unnest(new.primary_muscle_group_ids || new.secondary_muscle_group_ids) as m(id)
    where not exists (select 1 from athlete3.muscle_groups g where g.id = m.id)
  ) then
    raise exception using errcode = '23503', message = 'ATHLETE:VALIDATION_FAILED',
      detail = 'grupo muscular inexistente';
  end if;
  if exists (
    select 1 from unnest(new.equipment_ids) as e(id)
    where not exists (select 1 from athlete3.equipment q where q.id = e.id)
  ) then
    raise exception using errcode = '23503', message = 'ATHLETE:VALIDATION_FAILED',
      detail = 'equipamiento inexistente';
  end if;
  return new;
end;
$$;
grant execute on function athlete3_private.tg_exercise_refs() to authenticated, service_role;

create trigger exercises_synced before insert or update on athlete3.exercises
  for each row execute function athlete3_private.tg_synced_row();
create trigger exercises_refs before insert or update on athlete3.exercises
  for each row execute function athlete3_private.tg_exercise_refs();

alter table athlete3.exercises enable row level security;
alter table athlete3.exercises force row level security;

create policy exercises_select_global_or_own on athlete3.exercises
  for select to authenticated using (user_id is null or user_id = (select auth.uid()));
create policy exercises_insert_own on athlete3.exercises
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy exercises_update_own on athlete3.exercises
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

grant select, insert, update on athlete3.exercises to authenticated;
grant all on athlete3.exercises to service_role;

-- ---------- Semilla del catálogo global (UUID estables) ----------
insert into athlete3.muscle_groups (id, slug, name) values
  ('10000000-0000-4000-8000-000000000001', 'chest', 'Pecho'),
  ('10000000-0000-4000-8000-000000000002', 'back', 'Espalda'),
  ('10000000-0000-4000-8000-000000000003', 'shoulders', 'Hombros'),
  ('10000000-0000-4000-8000-000000000004', 'biceps', 'Bíceps'),
  ('10000000-0000-4000-8000-000000000005', 'triceps', 'Tríceps'),
  ('10000000-0000-4000-8000-000000000006', 'forearms', 'Antebrazos'),
  ('10000000-0000-4000-8000-000000000007', 'core', 'Core'),
  ('10000000-0000-4000-8000-000000000008', 'quadriceps', 'Cuádriceps'),
  ('10000000-0000-4000-8000-000000000009', 'hamstrings', 'Isquiotibiales'),
  ('10000000-0000-4000-8000-000000000010', 'glutes', 'Glúteos'),
  ('10000000-0000-4000-8000-000000000011', 'calves', 'Pantorrillas'),
  ('10000000-0000-4000-8000-000000000012', 'full-body', 'Cuerpo completo');

insert into athlete3.equipment (id, slug, name) values
  ('20000000-0000-4000-8000-000000000001', 'barbell', 'Barra'),
  ('20000000-0000-4000-8000-000000000002', 'dumbbell', 'Mancuernas'),
  ('20000000-0000-4000-8000-000000000003', 'machine', 'Máquina'),
  ('20000000-0000-4000-8000-000000000004', 'cable', 'Polea'),
  ('20000000-0000-4000-8000-000000000005', 'bodyweight', 'Peso corporal'),
  ('20000000-0000-4000-8000-000000000006', 'kettlebell', 'Kettlebell'),
  ('20000000-0000-4000-8000-000000000007', 'pull-up-bar', 'Barra de dominadas'),
  ('20000000-0000-4000-8000-000000000008', 'bench', 'Banco');

insert into athlete3.exercises (id, slug, name, modality, load_type, primary_muscle_group_ids, secondary_muscle_group_ids, equipment_ids) values
  ('30000000-0000-4000-8000-000000000001', 'back-squat', 'Sentadilla trasera', 'strength', 'external',
    '{10000000-0000-4000-8000-000000000008,10000000-0000-4000-8000-000000000010}', '{10000000-0000-4000-8000-000000000009,10000000-0000-4000-8000-000000000007}', '{20000000-0000-4000-8000-000000000001}'),
  ('30000000-0000-4000-8000-000000000002', 'bench-press', 'Press de banca', 'strength', 'external',
    '{10000000-0000-4000-8000-000000000001}', '{10000000-0000-4000-8000-000000000003,10000000-0000-4000-8000-000000000005}', '{20000000-0000-4000-8000-000000000001,20000000-0000-4000-8000-000000000008}'),
  ('30000000-0000-4000-8000-000000000003', 'deadlift', 'Peso muerto', 'strength', 'external',
    '{10000000-0000-4000-8000-000000000009,10000000-0000-4000-8000-000000000010,10000000-0000-4000-8000-000000000002}', '{10000000-0000-4000-8000-000000000006,10000000-0000-4000-8000-000000000007}', '{20000000-0000-4000-8000-000000000001}'),
  ('30000000-0000-4000-8000-000000000004', 'overhead-press', 'Press militar', 'strength', 'external',
    '{10000000-0000-4000-8000-000000000003}', '{10000000-0000-4000-8000-000000000005,10000000-0000-4000-8000-000000000007}', '{20000000-0000-4000-8000-000000000001}'),
  ('30000000-0000-4000-8000-000000000005', 'barbell-row', 'Remo con barra', 'strength', 'external',
    '{10000000-0000-4000-8000-000000000002}', '{10000000-0000-4000-8000-000000000004}', '{20000000-0000-4000-8000-000000000001}'),
  ('30000000-0000-4000-8000-000000000006', 'pull-up', 'Dominadas', 'strength', 'bodyweight',
    '{10000000-0000-4000-8000-000000000002}', '{10000000-0000-4000-8000-000000000004}', '{20000000-0000-4000-8000-000000000007}'),
  ('30000000-0000-4000-8000-000000000007', 'dip', 'Fondos', 'strength', 'bodyweight',
    '{10000000-0000-4000-8000-000000000005,10000000-0000-4000-8000-000000000001}', '{10000000-0000-4000-8000-000000000003}', '{20000000-0000-4000-8000-000000000005}'),
  ('30000000-0000-4000-8000-000000000008', 'romanian-deadlift', 'Peso muerto rumano', 'strength', 'external',
    '{10000000-0000-4000-8000-000000000009}', '{10000000-0000-4000-8000-000000000010}', '{20000000-0000-4000-8000-000000000001}'),
  ('30000000-0000-4000-8000-000000000009', 'dumbbell-curl', 'Curl con mancuernas', 'strength', 'external',
    '{10000000-0000-4000-8000-000000000004}', '{10000000-0000-4000-8000-000000000006}', '{20000000-0000-4000-8000-000000000002}'),
  ('30000000-0000-4000-8000-000000000010', 'leg-press', 'Prensa de piernas', 'strength', 'external',
    '{10000000-0000-4000-8000-000000000008}', '{10000000-0000-4000-8000-000000000010}', '{20000000-0000-4000-8000-000000000003}'),
  ('30000000-0000-4000-8000-000000000011', 'lat-pulldown', 'Jalón al pecho', 'strength', 'external',
    '{10000000-0000-4000-8000-000000000002}', '{10000000-0000-4000-8000-000000000004}', '{20000000-0000-4000-8000-000000000004}'),
  ('30000000-0000-4000-8000-000000000012', 'plank', 'Plancha', 'strength', 'time',
    '{10000000-0000-4000-8000-000000000007}', '{}', '{20000000-0000-4000-8000-000000000005}');
