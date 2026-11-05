import { afterAll, describe, expect, it } from 'vitest';
import { asAnon, asAuthenticatedWithoutClaims, createUser, pgError, pool, push, upsert, uuid, sessionPayload } from './helpers';

afterAll(() => pool.end());

describe('línea base de seguridad (catálogo)', () => {
  it('todas las tablas de athlete3 y athlete3_private tienen RLS habilitado y FORZADO', async () => {
    const { rows } = await pool.query(`
      select n.nspname || '.' || c.relname as t from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname in ('athlete3','athlete3_private') and c.relkind in ('r','p')
        and not (c.relrowsecurity and c.relforcerowsecurity)`);
    expect(rows).toEqual([]);
  });

  it('anon no tiene privilegios sobre ninguna tabla ni función', async () => {
    const { rows } = await pool.query(`
      select 'table ' || c.relname as o from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname in ('athlete3','athlete3_private') and c.relkind in ('r','p','v')
        and has_table_privilege('anon', c.oid, 'select,insert,update,delete')
      union all
      select 'function ' || p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname in ('athlete3','athlete3_private') and has_function_privilege('anon', p.oid, 'execute')`);
    expect(rows).toEqual([]);
  });

  it('authenticated no puede borrar físicamente ni truncar', async () => {
    const { rows } = await pool.query(`
      select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname in ('athlete3','athlete3_private') and c.relkind = 'r'
        and (has_table_privilege('authenticated', c.oid, 'delete') or has_table_privilege('authenticated', c.oid, 'truncate'))`);
    expect(rows).toEqual([]);
  });

  it('las tablas privadas no son accesibles por authenticated (roles y límites)', async () => {
    const { rows } = await pool.query(`
      select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'athlete3_private' and c.relname in ('user_roles','rate_limit_buckets')
        and has_table_privilege('authenticated', c.oid, 'select,insert,update')`);
    expect(rows).toEqual([]);
  });

  it('toda función SECURITY DEFINER fija search_path', async () => {
    const { rows } = await pool.query(`
      select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname in ('athlete3','athlete3_private') and p.prosecdef
        and not exists (select 1 from unnest(coalesce(p.proconfig,'{}')) c where c like 'search_path=%')`);
    expect(rows).toEqual([]);
  });

  it('no se crearon objetos en public ni triggers sobre auth.users', async () => {
    const pub = await pool.query(`select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public'`);
    expect(pub.rows).toEqual([]);
    const trg = await pool.query(`select tgname from pg_trigger where tgrelid = 'auth.users'::regclass and not tgisinternal`);
    expect(trg.rows).toEqual([]);
  });
});

describe('acceso no autenticado', () => {
  it('anon no puede usar el esquema athlete3', async () => {
    const e1 = await pgError(asAnon((db) => db.query('select * from athlete3.workout_sessions')));
    expect(e1.code).toBe('42501');
    const e2 = await pgError(asAnon((db) => db.query('select * from athlete3.exercises')));
    expect(e2.code).toBe('42501');
    const e3 = await pgError(asAnon((db) => db.query(`select athlete3.sync_pull(null, 10)`)));
    expect(e3.code).toBe('42501');
  });

  it('rol authenticated sin identidad verificada no puede sincronizar ni crear perfil', async () => {
    const e1 = await pgError(asAuthenticatedWithoutClaims((db) => push(db, [upsert('workout_session', uuid(), sessionPayload())])));
    expect(e1.code).toBe('28000');
    expect(e1.message).toBe('ATHLETE:UNAUTHENTICATED');
    const e2 = await pgError(asAuthenticatedWithoutClaims((db) => db.query(`select athlete3.ensure_profile('UTC')`)));
    expect(e2.code).toBe('28000');
  });

  it('sin identidad no ve filas aunque existan', async () => {
    await createUser();
    const { rows } = await asAuthenticatedWithoutClaims((db) => db.query('select * from athlete3.profiles'));
    expect(rows).toEqual([]);
  });
});
