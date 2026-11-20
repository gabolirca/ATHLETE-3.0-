import { describe, expect, it } from 'vitest';
import { loadEnvironment } from '../../src/config/environment';
import { assertPublicKey } from '../../src/supabase/client';
import { redact, safeLogger, type Logger } from '../../src/logging';
import { createUuidV7Generator } from '../../src/ids';
import { localDatabaseName } from '../../src/sql/expo-sqlite';

const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = (role: string) => `${b64({ alg: 'HS256' })}.${b64({ role, iss: 'supabase' })}.firma`;
const PUB = 'sb_publishable_abcdefghijklmnopqrstuvwxyz';

describe('claves en el cliente', () => {
  it('acepta claves publicables y JWT anon', () => {
    expect(() => assertPublicKey(PUB)).not.toThrow();
    expect(() => assertPublicKey(jwt('anon'))).not.toThrow();
  });
  it('rechaza claves secretas y service_role', () => {
    expect(() => assertPublicKey('sb_secret_FAKE_TEST_VALUE_0000')).toThrow(/secreta/);
    expect(() => assertPublicKey(jwt('service_role'))).toThrow(/privilegiado/);
    expect(() => assertPublicKey('cualquier-cosa-larga-sin-formato')).toThrow();
  });
});

describe('ambientes', () => {
  const vars = (name: string, url: string, key = PUB) => ({ EXPO_PUBLIC_ATHLETE_ENV: name, EXPO_PUBLIC_SUPABASE_URL: url, EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: key });

  it('local solo apunta a hosts locales', () => {
    expect(loadEnvironment(vars('local', 'http://127.0.0.1:54321')).ok).toBe(true);
    expect(loadEnvironment(vars('local', 'http://10.0.2.2:54321')).ok).toBe(true);
    expect(loadEnvironment(vars('local', 'https://abc.supabase.co')).ok).toBe(false);
  });
  it('development/testing exigen https y host remoto', () => {
    expect(loadEnvironment(vars('development', 'https://devref.supabase.co')).ok).toBe(true);
    expect(loadEnvironment(vars('testing', 'http://testref.supabase.co')).ok).toBe(false);
    expect(loadEnvironment(vars('development', 'https://localhost:54321')).ok).toBe(false);
  });
  it('producción está bloqueada hasta aprobar su proyecto', () => {
    const r = loadEnvironment(vars('production', 'https://prodref.supabase.co'));
    expect(r.ok === false && r.error.code).toBe('FORBIDDEN');
    expect(loadEnvironment(vars('production', 'https://prodref.supabase.co'), 'prodref').ok).toBe(true);
    expect(loadEnvironment(vars('production', 'https://otro.supabase.co'), 'prodref').ok).toBe(false);
  });
  it('rechaza claves secretas en cualquier ambiente', () => {
    expect(loadEnvironment(vars('development', 'https://devref.supabase.co', 'sb_secret_FAKE_TEST_VALUE_0000')).ok).toBe(false);
    expect(loadEnvironment(vars('local', 'http://127.0.0.1:54321', jwt('service_role'))).ok).toBe(false);
  });
  it('rechaza ambientes desconocidos o incompletos', () => {
    expect(loadEnvironment(vars('staging', 'https://x.supabase.co')).ok).toBe(false);
    expect(loadEnvironment({}).ok).toBe(false);
  });
});

describe('logs sin datos sensibles', () => {
  it('redacta claves sensibles y tokens incrustados', () => {
    const out = redact({
      event: 'x', password: 'hunter22', access_token: 'abc', nested: { refreshToken: 'r', email: 'a@b.c' },
      note: `Bearer ${jwt('authenticated')}`, key: 'sb_secret_zzzzzzzz', count: 3,
    }) as Record<string, unknown>;
    const text = JSON.stringify(out);
    expect(text).not.toMatch(/hunter22|a@b\.c|sb_secret_zzzz|eyJ/);
    expect(out.count).toBe(3);
  });
  it('safeLogger aplica la redacción a todos los niveles', () => {
    const lines: string[] = [];
    const inner: Logger = { debug: (e, c) => lines.push(e + JSON.stringify(c)), info: (e, c) => lines.push(e + JSON.stringify(c)), warn: (e, c) => lines.push(e + JSON.stringify(c)), error: (e, c) => lines.push(e + JSON.stringify(c)) };
    safeLogger(inner).error('boom', { token: 'T', password: 'P' });
    expect(lines.join()).not.toMatch(/"T"|"P"/);
  });
});

describe('identificadores', () => {
  it('UUIDv7 válidos y ordenados por tiempo', () => {
    let t = 1_700_000_000_000;
    const gen = createUuidV7Generator((n) => new Uint8Array(n).fill(0xab), () => t++);
    const a = gen.newId();
    const b = gen.newId();
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(a < b).toBe(true);
  });
  it('base local por usuario con nombre seguro', () => {
    expect(localDatabaseName('6F1C2D3E-4B5A-4C6D-8E7F-9A0B1C2D3E4F')).toBe('athlete3-6f1c2d3e-4b5a-4c6d-8e7f-9a0b1c2d3e4f.db');
    expect(localDatabaseName('6f1c2d3e-4b5a-4c6d-8e7f-9a0b1c2d3e4f', 'development')).toBe('athlete3-development-6f1c2d3e-4b5a-4c6d-8e7f-9a0b1c2d3e4f.db');
    expect(() => localDatabaseName('../../etc/passwd')).toThrow();
  });
});
