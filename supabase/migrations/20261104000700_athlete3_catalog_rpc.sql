-- =====================================================================================
-- ATHLETE 3.0 — 0700 Instantánea del catálogo global para uso sin conexión
-- SOLO ENTORNO LOCAL hasta aprobación explícita.
-- =====================================================================================
create function athlete3.catalog_snapshot()
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
set timezone = 'UTC'
as $$
begin
  perform athlete3_private.require_user_id();
  return jsonb_build_object(
    'muscleGroups', coalesce((select jsonb_agg(jsonb_build_object('id', g.id, 'slug', g.slug, 'name', g.name) order by g.slug)
                              from athlete3.muscle_groups g), '[]'::jsonb),
    'equipment', coalesce((select jsonb_agg(jsonb_build_object('id', q.id, 'slug', q.slug, 'name', q.name) order by q.slug)
                           from athlete3.equipment q), '[]'::jsonb),
    'exercises', coalesce((select jsonb_agg(to_jsonb(e) order by e.slug)
                           from athlete3.exercises e where e.user_id is null and e.deleted_at is null), '[]'::jsonb));
end;
$$;
revoke all on function athlete3.catalog_snapshot() from public;
grant execute on function athlete3.catalog_snapshot() to authenticated;
