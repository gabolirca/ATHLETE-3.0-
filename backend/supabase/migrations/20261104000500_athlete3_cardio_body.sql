-- =====================================================================================
-- ATHLETE 3.0 — 0500 Cardio y seguimiento corporal
-- SOLO ENTORNO LOCAL hasta aprobación explícita.
--
-- Ritmo y velocidad NO se almacenan: se derivan de duración y distancia (@athlete/domain).
-- =====================================================================================

create table athlete3.cardio_sessions (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  activity text not null check (activity in ('run', 'walk', 'swim', 'bike', 'row', 'circuit', 'hybrid')),
  training_day_id uuid,
  started_at timestamptz not null,
  time_zone text not null check (athlete3_private.is_valid_time_zone(time_zone)),
  local_date date not null,
  duration_seconds integer not null check (duration_seconds between 1 and 86400),
  distance_m numeric(9, 2) check (distance_m is null or (distance_m > 0 and distance_m <= 1000000)),
  rounds integer check (rounds is null or rounds between 0 and 10000),
  reps integer check (reps is null or reps between 0 and 100000),
  rpe numeric(3, 1) check (rpe is null or (rpe between 1 and 10 and athlete3_private.is_half_step(rpe))),
  avg_heart_rate_bpm integer check (avg_heart_rate_bpm is null or avg_heart_rate_bpm between 25 and 250),
  max_heart_rate_bpm integer check (max_heart_rate_bpm is null or max_heart_rate_bpm between 25 and 250),
  swim_pool_type text check (swim_pool_type is null or swim_pool_type in ('pool', 'open_water')),
  swim_pool_length_m numeric(5, 2) check (swim_pool_length_m is null or (swim_pool_length_m > 0 and swim_pool_length_m <= 100)),
  swim_laps integer check (swim_laps is null or swim_laps between 0 and 10000),
  swim_stroke text check (swim_stroke is null or swim_stroke in ('freestyle', 'backstroke', 'breaststroke', 'butterfly', 'mixed')),
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
  constraint cardio_sessions_local_date_matches check (local_date = (started_at at time zone time_zone)::date),
  constraint cardio_sessions_hr_order check (
    avg_heart_rate_bpm is null or max_heart_rate_bpm is null or avg_heart_rate_bpm <= max_heart_rate_bpm),
  -- Los detalles de natación solo existen en sesiones de natación y van completos (tipo de piscina obligatorio).
  constraint cardio_sessions_swim_details check (
    (activity = 'swim' and (swim_pool_type is not null or (swim_pool_length_m is null and swim_laps is null and swim_stroke is null)))
    or (activity <> 'swim' and swim_pool_type is null and swim_pool_length_m is null and swim_laps is null and swim_stroke is null)),
  constraint cardio_sessions_sane_dates check (started_at > '2000-01-01' and started_at < now() + interval '2 days')
);
create index cardio_sessions_history_idx on athlete3.cardio_sessions (user_id, local_date desc);
select athlete3_private.secure_synced_table('athlete3.cardio_sessions');

create table athlete3.body_weights (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  measured_at timestamptz not null,
  time_zone text not null check (athlete3_private.is_valid_time_zone(time_zone)),
  local_date date not null,
  weight_kg numeric(6, 3) not null check (weight_kg between 20 and 400),
  input_unit text not null check (input_unit in ('kg', 'lb')),
  source text not null default 'manual' check (source in ('manual', 'imported', 'estimated', 'ai_generated', 'device')),
  notes text check (notes is null or length(notes) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  revision bigint not null default 1,
  change_seq bigint not null default 0,
  last_mutation_id uuid,
  constraint body_weights_local_date_matches check (local_date = (measured_at at time zone time_zone)::date)
);
create index body_weights_history_idx on athlete3.body_weights (user_id, measured_at desc);
select athlete3_private.secure_synced_table('athlete3.body_weights');

create table athlete3.body_measurements (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  measured_at timestamptz not null,
  time_zone text not null check (athlete3_private.is_valid_time_zone(time_zone)),
  local_date date not null,
  site text not null check (site in ('neck', 'shoulders', 'chest', 'waist', 'abdomen', 'hips',
    'left_arm', 'right_arm', 'left_forearm', 'right_forearm', 'left_thigh', 'right_thigh', 'left_calf', 'right_calf')),
  value_cm numeric(6, 2) not null check (value_cm > 0 and value_cm <= 300),
  input_unit text not null check (input_unit in ('cm', 'in')),
  source text not null default 'manual' check (source in ('manual', 'imported', 'estimated', 'ai_generated', 'device')),
  notes text check (notes is null or length(notes) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  revision bigint not null default 1,
  change_seq bigint not null default 0,
  last_mutation_id uuid,
  constraint body_measurements_local_date_matches check (local_date = (measured_at at time zone time_zone)::date)
);
create index body_measurements_history_idx on athlete3.body_measurements (user_id, site, measured_at desc);
select athlete3_private.secure_synced_table('athlete3.body_measurements');
