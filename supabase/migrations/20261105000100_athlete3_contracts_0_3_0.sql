-- =====================================================================================
-- ATHLETE 3.0 · Contratos 0.3.0 (Claude, 2026-11-05)
--
--   1. `profiles.sports`: disciplinas del atleta (fuerza e híbridos). Lista, vacía por defecto.
--      La sync la incluye automáticamente (`sync_writable_columns` deriva las columnas de la tabla).
--   2. Catálogo: "Remo sentado en polea" (equivalente al ejercicio de muestra de la app móvil).
--
-- Aditiva. Solo se ha aplicado a Postgres local de pruebas; NO se ha aplicado a ningún proyecto remoto.
-- El catálogo incluido en `@athlete/data` (`BUNDLED_CATALOG`) debe coincidir con esta semilla
-- (lo verifica `packages/data/test/integration/offline-identity.test.ts`).
-- Repite el cierre de privilegios de la migración 0900 para la función nueva.
-- =====================================================================================

-- Sin elementos repetidos (los CHECK no admiten subconsultas).
create function athlete3_private.has_distinct_items(items text[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select cardinality(items) = (select count(distinct i) from unnest(items) as i)
$$;

revoke execute on function athlete3_private.has_distinct_items(text[]) from public, anon;
grant execute on function athlete3_private.has_distinct_items(text[]) to authenticated, service_role;

alter table athlete3.profiles
  add column sports text[] not null default '{}'
    constraint profiles_sports_valid check (
      cardinality(sports) <= 7
      and sports <@ array['strength', 'running', 'swimming', 'cycling', 'rowing', 'functional_fitness', 'other']::text[]
      and athlete3_private.has_distinct_items(sports)
    );

comment on column athlete3.profiles.sports is
  'Disciplinas del atleta (contratos 0.3.0, `Profile.sports`). Vacía = no indicado.';

insert into athlete3.exercises (id, slug, name, modality, load_type, primary_muscle_group_ids, secondary_muscle_group_ids, equipment_ids) values
  ('30000000-0000-4000-8000-000000000013', 'seated-cable-row', 'Remo sentado en polea', 'strength', 'external',
    '{10000000-0000-4000-8000-000000000002}', '{10000000-0000-4000-8000-000000000004}', '{20000000-0000-4000-8000-000000000004}');

-- Verificación (igual que 0900, acotada a lo que crea esta migración).
do $$
begin
  if has_function_privilege('anon', 'athlete3_private.has_distinct_items(text[])', 'execute') then
    raise exception 'Función ejecutable por anon: athlete3_private.has_distinct_items';
  end if;
end;
$$;
