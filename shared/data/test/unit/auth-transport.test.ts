import { describe, expect, it, vi } from 'vitest';
import { SupabaseAuthService, type AuthClientLike, type AuthSessionLike } from '../../src/supabase/auth';
import { SupabaseSyncTransport, type RpcClientLike } from '../../src/supabase/transport';
import { createAthleteSupabaseClient } from '../../src/supabase/client';
import type { Logger } from '../../src/logging';

const NOW = Date.parse('2026-11-04T04:30:00Z');
const user = { id: '6f1c2d3e-4b5a-4c6d-8e7f-9a0b1c2d3e4f', email: 'ana@test.local', email_confirmed_at: '2026-11-01T00:00:00Z' };
const session = (expiresInSec: number): AuthSessionLike => ({
  access_token: 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.ACCESS', refresh_token: 'REFRESH-TOKEN', expires_at: Math.floor(NOW / 1000) + expiresInSec, user,
});

function fakeAuth(overrides: Partial<AuthClientLike> = {}): AuthClientLike {
  return {
    signUp: vi.fn(async () => ({ data: { user, session: null }, error: null })),
    signInWithPassword: vi.fn(async () => ({ data: { user, session: session(3600) }, error: null })),
    signOut: vi.fn(async () => ({ error: null })),
    resetPasswordForEmail: vi.fn(async () => ({ data: {}, error: null })),
    updateUser: vi.fn(async () => ({ data: { user }, error: null })),
    getSession: vi.fn(async () => ({ data: { session: session(3600) }, error: null })),
    refreshSession: vi.fn(async () => ({ data: { session: session(3600), user }, error: null })),
    signInWithOtp: vi.fn(async () => ({ data: {}, error: null })),
    verifyOtp: vi.fn(async () => ({ data: { user, session: session(3600) }, error: null })),
    signInWithIdToken: vi.fn(async () => ({ data: { user, session: session(3600) }, error: null })),
    onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    ...overrides,
  };
}

function capturingLogger() {
  const lines: string[] = [];
  const push = (e: string, c?: Record<string, unknown>) => lines.push(`${e} ${JSON.stringify(c ?? {})}`);
  const logger: Logger = { debug: push, info: push, warn: push, error: push };
  return { logger, lines };
}

describe('registro e inicio de sesión', () => {
  it('valida la política de contraseña antes de llamar al servidor', async () => {
    const auth = fakeAuth();
    const svc = new SupabaseAuthService(auth, { now: () => NOW });
    for (const password of ['corta1', 'sololetrasaqui', '1234567890', 'x'.repeat(70) + 'ñ1']) {
      const r = await svc.signUp({ email: 'ana@test.local', password, timeZone: 'America/Mexico_City' });
      expect(r.ok === false && r.error.code).toBe('VALIDATION_FAILED');
    }
    expect(auth.signUp).not.toHaveBeenCalled();
  });

  it('registro con confirmación pendiente y correo normalizado', async () => {
    const auth = fakeAuth();
    const r = await new SupabaseAuthService(auth).signUp({ email: '  Ana@Test.Local ', password: 'Segura12345', timeZone: 'UTC' });
    expect(r).toEqual({ ok: true, value: { status: 'pending_confirmation', email: 'ana@test.local' } });
    expect(auth.signUp).toHaveBeenCalledWith({ email: 'ana@test.local', password: 'Segura12345' });
  });

  it('no revela si el correo ya existe', async () => {
    const auth = fakeAuth({ signUp: vi.fn(async () => ({ data: { user: null, session: null }, error: { message: 'User already registered', code: 'user_already_exists', status: 422 } })) });
    const r = await new SupabaseAuthService(auth).signUp({ email: 'ana@test.local', password: 'Segura12345', timeZone: 'UTC' });
    expect(r).toEqual({ ok: true, value: { status: 'pending_confirmation', email: 'ana@test.local' } });
  });

  it('inicio de sesión correcto no expone tokens en el estado', async () => {
    const r = await new SupabaseAuthService(fakeAuth(), { now: () => NOW }).signIn({ email: 'ana@test.local', password: 'Segura12345' });
    expect(r.ok && r.value.status).toBe('signed_in');
    expect(JSON.stringify(r)).not.toMatch(/ACCESS|REFRESH-TOKEN/);
  });

  it('credenciales inválidas → mensaje genérico; límite → RATE_LIMITED; sin red → NETWORK_UNAVAILABLE', async () => {
    const cases = [
      [{ message: 'Invalid login credentials', code: 'invalid_credentials', status: 400 }, 'UNAUTHENTICATED'],
      [{ message: 'Email not confirmed', code: 'email_not_confirmed', status: 400 }, 'UNAUTHENTICATED'],
      [{ message: 'too many', code: 'over_request_rate_limit', status: 429 }, 'RATE_LIMITED'],
      [{ message: 'Failed to fetch', name: 'AuthRetryableFetchError', status: 0 }, 'NETWORK_UNAVAILABLE'],
    ] as const;
    for (const [error, code] of cases) {
      const auth = fakeAuth({ signInWithPassword: vi.fn(async () => ({ data: { user: null, session: null }, error })) });
      const r = await new SupabaseAuthService(auth).signIn({ email: 'ana@test.local', password: 'x' });
      expect(r.ok === false && r.error.code).toBe(code);
      expect(r.ok === false && r.error.message).not.toMatch(/Invalid login|fetch/);
    }
  });

  it('nunca registra contraseñas ni tokens', async () => {
    const { logger, lines } = capturingLogger();
    const svc = new SupabaseAuthService(fakeAuth({
      signInWithPassword: vi.fn(async () => ({ data: { user: null, session: null }, error: { message: 'bad Segura12345', code: 'invalid_credentials' } })),
    }), { logger, now: () => NOW });
    await svc.signIn({ email: 'ana@test.local', password: 'Segura12345' });
    await new SupabaseAuthService(fakeAuth(), { logger, now: () => NOW }).signIn({ email: 'ana@test.local', password: 'Segura12345' });
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.join('\n')).not.toMatch(/Segura12345|ACCESS|REFRESH|ana@test/);
  });
});

describe('sesión y expiración', () => {
  it('sesión vigente: no renueva', async () => {
    const auth = fakeAuth();
    const s = await new SupabaseAuthService(auth, { now: () => NOW }).getState();
    expect(s.status).toBe('signed_in');
    expect(auth.refreshSession).not.toHaveBeenCalled();
  });

  it('sesión por expirar: renueva', async () => {
    const auth = fakeAuth({ getSession: vi.fn(async () => ({ data: { session: session(30) }, error: null })) });
    const s = await new SupabaseAuthService(auth, { now: () => NOW }).getState();
    expect(auth.refreshSession).toHaveBeenCalledOnce();
    expect(s.status === 'signed_in' && Date.parse(s.expiresAt)).toBe((Math.floor(NOW / 1000) + 3600) * 1000);
  });

  it('expirada y sin red: sigue dentro (offline-first), sin cerrar sesión', async () => {
    const auth = fakeAuth({
      getSession: vi.fn(async () => ({ data: { session: session(-600) }, error: null })),
      refreshSession: vi.fn(async () => ({ data: { session: null, user: null }, error: { message: 'Failed to fetch', name: 'AuthRetryableFetchError', status: 0 } })),
    });
    const s = await new SupabaseAuthService(auth, { now: () => NOW }).getState();
    expect(s.status).toBe('signed_in');
    expect(auth.signOut).not.toHaveBeenCalled();
  });

  it('renovación rechazada (token revocado): cierra la sesión local', async () => {
    const auth = fakeAuth({
      getSession: vi.fn(async () => ({ data: { session: session(-600) }, error: null })),
      refreshSession: vi.fn(async () => ({ data: { session: null, user: null }, error: { message: 'Invalid Refresh Token', code: 'refresh_token_not_found', status: 400 } })),
    });
    const s = await new SupabaseAuthService(auth, { now: () => NOW }).getState();
    expect(s).toEqual({ status: 'signed_out', reason: 'expired' });
    expect(auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
  });

  it('sin sesión → signed_out', async () => {
    const auth = fakeAuth({ getSession: vi.fn(async () => ({ data: { session: null }, error: null })) });
    expect(await new SupabaseAuthService(auth).getState()).toEqual({ status: 'signed_out', reason: 'none' });
  });

  it('cerrar sesión revoca solo este dispositivo', async () => {
    const auth = fakeAuth();
    expect((await new SupabaseAuthService(auth).signOut()).ok).toBe(true);
    expect(auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
  });

  it('notifica cambios de estado incluido el modo recuperación', async () => {
    let cb: ((e: string, s: AuthSessionLike | null) => void) | undefined;
    const unsubscribe = vi.fn();
    const auth = fakeAuth({ onAuthStateChange: vi.fn((c) => { cb = c; return { data: { subscription: { unsubscribe } } }; }) });
    const svc = new SupabaseAuthService(auth, { now: () => NOW });
    const states: string[] = [];
    const off = svc.onStateChange((s) => states.push(s.status));
    cb!('PASSWORD_RECOVERY', session(3600));
    cb!('SIGNED_OUT', null);
    off();
    expect(states).toEqual(['password_recovery', 'signed_out']);
    expect(unsubscribe).toHaveBeenCalled();
  });
});

describe('recuperación de contraseña', () => {
  it('respuesta idéntica exista o no la cuenta', async () => {
    const auth = fakeAuth({ resetPasswordForEmail: vi.fn(async () => ({ data: null, error: { message: 'User not found', code: 'user_not_found', status: 400 } })) });
    expect(await new SupabaseAuthService(auth).requestPasswordReset({ email: 'nadie@test.local' })).toEqual({ ok: true, value: undefined });
  });

  it('limita solicitudes repetidas desde el dispositivo', async () => {
    let t = NOW;
    const auth = fakeAuth();
    const svc = new SupabaseAuthService(auth, { now: () => t });
    expect((await svc.requestPasswordReset({ email: 'ana@test.local' })).ok).toBe(true);
    const second = await svc.requestPasswordReset({ email: 'ana@test.local' });
    expect(second.ok === false && second.error.code).toBe('RATE_LIMITED');
    t += 61_000;
    expect((await svc.requestPasswordReset({ email: 'ana@test.local' })).ok).toBe(true);
    expect(auth.resetPasswordForEmail).toHaveBeenCalledTimes(2);
  });

  it('actualizar contraseña exige sesión y política', async () => {
    const noSession = fakeAuth({ getSession: vi.fn(async () => ({ data: { session: null }, error: null })) });
    const r1 = await new SupabaseAuthService(noSession).updatePassword({ newPassword: 'NuevaSegura123' });
    expect(r1.ok === false && r1.error.code).toBe('UNAUTHENTICATED');
    const r2 = await new SupabaseAuthService(fakeAuth()).updatePassword({ newPassword: 'debil' });
    expect(r2.ok === false && r2.error.code).toBe('VALIDATION_FAILED');
    const auth = fakeAuth();
    expect((await new SupabaseAuthService(auth).updatePassword({ newPassword: 'NuevaSegura123' })).ok).toBe(true);
    expect(auth.updateUser).toHaveBeenCalledWith({ password: 'NuevaSegura123' });
  });
});

describe('código por correo (0.4.0)', () => {
  it('pide el código normalizando el correo y permitiendo crear la cuenta', async () => {
    const auth = fakeAuth();
    const r = await new SupabaseAuthService(auth, { now: () => NOW, redirectTo: 'athlete3://auth/callback' }).requestEmailCode({ email: '  Ana@Test.Local ' });
    expect(r.ok).toBe(true);
    expect(auth.signInWithOtp).toHaveBeenCalledWith({ email: 'ana@test.local', options: { shouldCreateUser: true, emailRedirectTo: 'athlete3://auth/callback' } });
  });

  it('no permite reenviar al mismo correo antes de un minuto; sí tras la espera', async () => {
    let now = NOW;
    const auth = fakeAuth();
    const svc = new SupabaseAuthService(auth, { now: () => now });
    expect((await svc.requestEmailCode({ email: 'ana@test.local' })).ok).toBe(true);
    const again = await svc.requestEmailCode({ email: 'ana@test.local' });
    expect(again.ok).toBe(false);
    expect(!again.ok && again.error.code).toBe('RATE_LIMITED');
    now += 61_000;
    expect((await svc.requestEmailCode({ email: 'ana@test.local' })).ok).toBe(true);
    expect(auth.signInWithOtp).toHaveBeenCalledTimes(2);
  });

  it('un error del servidor que no es de red ni límite responde igual que el éxito (no revela cuentas)', async () => {
    const auth = fakeAuth({ signInWithOtp: vi.fn(async () => ({ data: {}, error: { message: 'Signups not allowed', code: 'signup_disabled', status: 422 } })) });
    expect((await new SupabaseAuthService(auth, { now: () => NOW }).requestEmailCode({ email: 'x@test.local' })).ok).toBe(true);
  });

  it('sin red: devuelve el error y libera la espera para reintentar', async () => {
    const auth = fakeAuth({ signInWithOtp: vi.fn(async () => ({ data: {}, error: { message: 'Failed to fetch', name: 'AuthRetryableFetchError', status: 0 } })) });
    const svc = new SupabaseAuthService(auth, { now: () => NOW });
    const r = await svc.requestEmailCode({ email: 'ana@test.local' });
    expect(!r.ok && r.error.code).toBe('NETWORK_UNAVAILABLE');
    await svc.requestEmailCode({ email: 'ana@test.local' });
    expect(auth.signInWithOtp).toHaveBeenCalledTimes(2);
  });

  it('si el servidor no puede enviar el correo (5xx) lo dice claramente: no es "sin conexión" ni un falso éxito', async () => {
    const auth = fakeAuth({ signInWithOtp: vi.fn(async () => ({ data: {}, error: { message: 'Error sending confirmation email', code: 'unexpected_failure', status: 500, name: 'AuthRetryableFetchError' } })) });
    const svc = new SupabaseAuthService(auth, { now: () => NOW });
    const r = await svc.requestEmailCode({ email: 'ana@test.local' });
    expect(!r.ok && r.error).toMatchObject({ code: 'INTERNAL', message: expect.stringMatching(/No pudimos enviar el correo/) });
    await svc.requestEmailCode({ email: 'ana@test.local' }); // la espera se libera para reintentar
    expect(auth.signInWithOtp).toHaveBeenCalledTimes(2);
  });

  it('verifica el código y abre sesión', async () => {
    const auth = fakeAuth();
    const r = await new SupabaseAuthService(auth, { now: () => NOW }).verifyEmailCode({ email: 'Ana@Test.Local', code: ' 123456 ' });
    expect(auth.verifyOtp).toHaveBeenCalledWith({ email: 'ana@test.local', token: '123456', type: 'email' });
    expect(r.ok && r.value.status).toBe('signed_in');
  });

  it('código con formato inválido: no llama al servidor', async () => {
    const auth = fakeAuth();
    const r = await new SupabaseAuthService(auth).verifyEmailCode({ email: 'ana@test.local', code: '12ab' });
    expect(!r.ok && r.error.code).toBe('VALIDATION_FAILED');
    expect(auth.verifyOtp).not.toHaveBeenCalled();
  });

  it('código incorrecto o vencido: VALIDATION_FAILED con mensaje claro', async () => {
    const auth = fakeAuth({ verifyOtp: vi.fn(async () => ({ data: { user: null, session: null }, error: { message: 'Token has expired or is invalid', code: 'otp_expired', status: 403 } })) });
    const r = await new SupabaseAuthService(auth).verifyEmailCode({ email: 'ana@test.local', code: '123456' });
    expect(!r.ok && r.error).toMatchObject({ code: 'VALIDATION_FAILED', message: expect.stringMatching(/incorrecto o ya venció/) });
  });
});

describe('Apple y Google (0.4.0)', () => {
  it('Google con ID token abre sesión', async () => {
    const auth = fakeAuth();
    const r = await new SupabaseAuthService(auth, { now: () => NOW }).signInWithIdToken({ provider: 'google', idToken: 'g.token.sig' });
    expect(auth.signInWithIdToken).toHaveBeenCalledWith({ provider: 'google', token: 'g.token.sig' });
    expect(r.ok && r.value.status).toBe('signed_in');
  });

  it('Apple exige nonce y lo envía', async () => {
    const auth = fakeAuth();
    const svc = new SupabaseAuthService(auth, { now: () => NOW });
    const missing = await svc.signInWithIdToken({ provider: 'apple', idToken: 'a.token.sig' });
    expect(!missing.ok && missing.error.code).toBe('VALIDATION_FAILED');
    await svc.signInWithIdToken({ provider: 'apple', idToken: 'a.token.sig', nonce: 'raw-nonce' });
    expect(auth.signInWithIdToken).toHaveBeenCalledWith({ provider: 'apple', token: 'a.token.sig', nonce: 'raw-nonce' });
  });
});

describe('transporte de sync', () => {
  const rpc = (impl: RpcClientLike['rpc']): RpcClientLike => ({ rpc: impl });
  const M = { mutationId: '6f1c2d3e-4b5a-4c6d-8e7f-9a0b1c2d3e4f', deviceId: '6f1c2d3e-4b5a-4c6d-8e7f-9a0b1c2d3e40', entity: 'strength_set' as const, entityId: '6f1c2d3e-4b5a-4c6d-8e7f-9a0b1c2d3e41', op: 'upsert' as const, baseRevision: null, payload: { reps: 5 }, clientRecordedAt: '2026-11-04T04:30:00Z' };

  it('llama a la RPC con los parámetros esperados y valida la respuesta', async () => {
    const impl = vi.fn(async () => ({ data: { results: [{ status: 'applied', mutationId: M.mutationId, revision: 1 }] }, error: null }));
    const r = await new SupabaseSyncTransport(rpc(impl)).push({ deviceId: M.deviceId, mutations: [M] });
    expect(r.ok).toBe(true);
    expect(impl).toHaveBeenCalledWith('sync_push', { p_device_id: M.deviceId, p_mutations: [M] });
  });

  it('respuesta con forma inesperada → INTERNAL reintentable (no llega a SQLite)', async () => {
    const r = await new SupabaseSyncTransport(rpc(async () => ({ data: { results: [{ status: 'hacked' }] }, error: null }))).push({ deviceId: M.deviceId, mutations: [M] });
    expect(r.ok === false && r.error).toMatchObject({ code: 'INTERNAL', retryable: true });
  });

  it('normaliza errores del servidor sin filtrar su mensaje', async () => {
    const cases = [
      [{ message: 'ATHLETE:RATE_LIMITED', code: 'P0001' }, 'RATE_LIMITED'],
      [{ message: 'JWT expired', code: 'PGRST301' }, 'SESSION_EXPIRED'],
      [{ message: 'insert or update on table "rate_limit_buckets" violates foreign key constraint "rate_limit_buckets_user_id_fkey"', code: '23503' }, 'SESSION_EXPIRED'],
      [{ message: 'insert or update on table "strength_sets" violates foreign key constraint "x"', code: '23503' }, 'INTERNAL'],
      [{ message: 'permission denied for schema athlete3', code: '42501' }, 'FORBIDDEN'],
      [{ message: 'ATHLETE:UNAUTHENTICATED', code: '28000' }, 'UNAUTHENTICATED'],
      [{ message: 'TypeError: Network request failed' }, 'NETWORK_UNAVAILABLE'],
      [{ message: 'syntax error at or near select', code: '42601' }, 'INTERNAL'],
    ] as const;
    for (const [error, code] of cases) {
      const r = await new SupabaseSyncTransport(rpc(async () => ({ data: null, error }))).pull({ cursor: null });
      expect(r.ok === false && r.error.code).toBe(code);
      expect(r.ok === false && r.error.message).not.toMatch(/athlete3|syntax|JWT|rate_limit|strength_sets/);
    }
  });

  it('una excepción de red se convierte en NETWORK_UNAVAILABLE', async () => {
    const r = await new SupabaseSyncTransport(rpc(async () => { throw new TypeError('fetch failed'); })).pullCatalog();
    expect(r.ok === false && r.error.code).toBe('NETWORK_UNAVAILABLE');
  });

  it('rechaza peticiones inválidas sin llamar al servidor', async () => {
    const impl = vi.fn();
    const r = await new SupabaseSyncTransport(rpc(impl)).push({ deviceId: 'x', mutations: [] });
    expect(r.ok === false && r.error.code).toBe('VALIDATION_FAILED');
    expect(impl).not.toHaveBeenCalled();
  });

  it('el cliente real de supabase-js es compatible con los puertos y usa athlete3', () => {
    const storage = { getItem: async () => null, setItem: async () => {}, removeItem: async () => {} };
    const client = createAthleteSupabaseClient({ name: 'local', supabaseUrl: 'http://127.0.0.1:54321', supabasePublishableKey: 'sb_publishable_abcdefghijklmnopqrstuvwxyz' }, storage);
    const transportPort: RpcClientLike = client;
    const authPort: AuthClientLike = client.auth;
    expect(transportPort).toBeDefined();
    expect(authPort).toBeDefined();
    expect(() => createAthleteSupabaseClient({ name: 'local', supabaseUrl: 'http://127.0.0.1:54321', supabasePublishableKey: 'sb_secret_FAKE_TEST_VALUE_0000' }, storage)).toThrow();
  });
});
