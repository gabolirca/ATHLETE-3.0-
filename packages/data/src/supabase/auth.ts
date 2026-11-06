import {
  IdTokenSignInInput,
  PasswordResetRequestInput,
  RequestEmailCodeInput,
  VerifyEmailCodeInput,
  SignInInput,
  SignUpInput,
  UpdatePasswordInput,
  appError,
  err,
  ok,
  parseInput,
  type AppError,
  type AuthService,
  type AuthState,
  type AuthUser,
  type Result,
} from '@athlete/contracts';
import { silentLogger, type Logger } from '../logging';
import { fromSupabaseError } from './errors';

// ---------- Subconjunto estructural de supabase-js `auth` ----------
export type AuthSessionLike = {
  access_token: string;
  refresh_token: string;
  expires_at?: number; // segundos epoch
  user: AuthUserLike;
};
export type AuthUserLike = { id: string; email?: string | null; email_confirmed_at?: string | null };
export type AuthErrorLike = { message: string; status?: number; code?: string; name?: string };
type R<T> = Promise<{ data: T; error: AuthErrorLike | null }>;

export interface AuthClientLike {
  signUp(credentials: { email: string; password: string; options?: { emailRedirectTo?: string } }): R<{ user: AuthUserLike | null; session: AuthSessionLike | null }>;
  signInWithPassword(credentials: { email: string; password: string }): R<{ user: AuthUserLike | null; session: AuthSessionLike | null }>;
  signOut(options?: { scope?: 'global' | 'local' | 'others' }): Promise<{ error: AuthErrorLike | null }>;
  resetPasswordForEmail(email: string, options?: { redirectTo?: string }): R<unknown>;
  updateUser(attributes: { password?: string }): R<{ user: AuthUserLike | null }>;
  getSession(): R<{ session: AuthSessionLike | null }>;
  refreshSession(): R<{ session: AuthSessionLike | null; user: AuthUserLike | null }>;
  signInWithOtp(credentials: { email: string; options?: { shouldCreateUser?: boolean; emailRedirectTo?: string } }): R<unknown>;
  verifyOtp(params: { email: string; token: string; type: 'email' }): R<{ user: AuthUserLike | null; session: AuthSessionLike | null }>;
  signInWithIdToken(credentials: { provider: 'apple' | 'google'; token: string; nonce?: string }): R<{ user: AuthUserLike | null; session: AuthSessionLike | null }>;
  onAuthStateChange(callback: (event: string, session: AuthSessionLike | null) => void): { data: { subscription: { unsubscribe(): void } } };
}

export type SupabaseAuthServiceOptions = {
  /** Deep link de la app para confirmación de correo y recuperación (p. ej. `athlete3://auth/callback`). */
  redirectTo?: string;
  logger?: Logger;
  now?: () => number;
  /** Renovar si quedan menos de estos ms para expirar. */
  refreshMarginMs?: number;
  /** Intervalo mínimo entre solicitudes de recuperación por correo en este dispositivo. */
  resetCooldownMs?: number;
  /** Intervalo mínimo entre envíos de código de inicio de sesión al mismo correo. */
  codeCooldownMs?: number;
};

const GENERIC_SIGNIN = 'Correo o contraseña incorrectos.';

/** Errores que implican que la sesión no puede renovarse: hay que volver a iniciar sesión. */
const TERMINAL_SESSION_CODES = new Set(['refresh_token_not_found', 'refresh_token_already_used', 'session_not_found', 'session_expired', 'user_not_found', 'user_banned']);

function toUser(u: AuthUserLike): AuthUser {
  return { id: u.id, email: u.email ?? null, emailConfirmed: Boolean(u.email_confirmed_at) };
}

/**
 * `AuthService` sobre Supabase Auth.
 * - Los tokens los guarda supabase-js en el `storage` seguro del cliente; nunca salen de aquí.
 * - Las contraseñas solo viajan a Supabase Auth; no se guardan ni se registran.
 * - Offline-first: si el token expiró y no hay red, el usuario sigue "dentro" (los datos son locales);
 *   solo se cierra la sesión cuando el servidor rechaza definitivamente la renovación.
 */
export class SupabaseAuthService implements AuthService {
  private readonly log: Logger;
  private readonly now: () => number;
  private readonly lastReset = new Map<string, number>();
  private readonly lastCode = new Map<string, number>();
  private readonly listeners = new Set<(s: AuthState) => void>();
  private subscription: { unsubscribe(): void } | null = null;

  constructor(private readonly auth: AuthClientLike, private readonly options: SupabaseAuthServiceOptions = {}) {
    this.log = options.logger ?? silentLogger;
    this.now = options.now ?? Date.now;
  }

  private signedIn(session: AuthSessionLike): AuthState {
    const expiresAt = new Date((session.expires_at ?? 0) * 1000).toISOString();
    return { status: 'signed_in', user: toUser(session.user), expiresAt };
  }

  private mapError(e: AuthErrorLike): AppError {
    const code = e.code ?? '';
    if (code === 'invalid_credentials' || code === 'invalid_grant') return appError('UNAUTHENTICATED', GENERIC_SIGNIN);
    if (code === 'email_not_confirmed') return appError('UNAUTHENTICATED', 'Confirma tu correo para continuar.', { details: { reason: 'email_not_confirmed' } });
    if (code === 'weak_password') return appError('VALIDATION_FAILED', 'La contraseña no cumple la política.', { details: { field: 'password' } });
    if (code === 'same_password') return appError('VALIDATION_FAILED', 'La nueva contraseña debe ser distinta.', { details: { field: 'newPassword' } });
    if (code === 'otp_expired' || code === 'otp_disabled' || code === 'invalid_otp') return appError('VALIDATION_FAILED', 'El código es incorrecto o ya venció. Pide uno nuevo.', { details: { field: 'code' } });
    if (code.startsWith('over_') || e.status === 429) return appError('RATE_LIMITED', 'Demasiados intentos. Espera un momento.');
    if (TERMINAL_SESSION_CODES.has(code)) return appError('SESSION_EXPIRED', 'Tu sesión expiró. Inicia sesión de nuevo.');
    if (code === 'reauthentication_needed') return appError('UNAUTHENTICATED', 'Vuelve a iniciar sesión para continuar.');
    return fromSupabaseError(e);
  }

  async getState(): Promise<AuthState> {
    const { data, error } = await this.auth.getSession();
    if (error || !data.session) return { status: 'signed_out', reason: 'none' };
    const session = data.session;
    const expiresMs = (session.expires_at ?? 0) * 1000;
    if (expiresMs - this.now() > (this.options.refreshMarginMs ?? 60_000)) return this.signedIn(session);

    const refreshed = await this.auth.refreshSession();
    if (!refreshed.error && refreshed.data.session) return this.signedIn(refreshed.data.session);
    const mapped = refreshed.error ? this.mapError(refreshed.error) : appError('SESSION_EXPIRED', '');
    if (mapped.code === 'SESSION_EXPIRED' || mapped.code === 'UNAUTHENTICATED') {
      this.log.warn('auth.session_terminal', { code: refreshed.error?.code ?? 'unknown' });
      await this.auth.signOut({ scope: 'local' }).catch(() => undefined);
      return { status: 'signed_out', reason: 'expired' };
    }
    // Sin red u otro error transitorio: se conserva el estado para seguir trabajando offline.
    this.log.info('auth.refresh_deferred', { code: mapped.code });
    return this.signedIn(session);
  }

  async signUp(raw: SignUpInput): Promise<Result<AuthState>> {
    const parsed = parseInput(SignUpInput, raw);
    if (!parsed.ok) return parsed;
    const { email, password } = parsed.value;
    const { data, error } = await this.auth.signUp({
      email,
      password,
      ...(this.options.redirectTo ? { options: { emailRedirectTo: this.options.redirectTo } } : {}),
    });
    if (error) {
      // No revelar si el correo ya está registrado (enumeración de cuentas).
      if (error.code === 'user_already_exists' || error.code === 'email_exists') return ok({ status: 'pending_confirmation', email });
      this.log.warn('auth.sign_up_failed', { code: error.code ?? 'unknown' });
      return err(this.mapError(error));
    }
    this.log.info('auth.sign_up');
    return ok(data.session ? this.signedIn(data.session) : { status: 'pending_confirmation', email });
  }

  async signIn(raw: SignInInput): Promise<Result<AuthState>> {
    const parsed = parseInput(SignInInput, raw);
    if (!parsed.ok) return err(appError('UNAUTHENTICATED', GENERIC_SIGNIN));
    const { data, error } = await this.auth.signInWithPassword(parsed.value);
    if (error || !data.session) {
      this.log.warn('auth.sign_in_failed', { code: error?.code ?? 'no_session' });
      return err(error ? this.mapError(error) : appError('UNAUTHENTICATED', GENERIC_SIGNIN));
    }
    this.log.info('auth.sign_in');
    return ok(this.signedIn(data.session));
  }

  async signOut(): Promise<Result<void>> {
    // `local`: revoca la sesión de este dispositivo y borra los tokens del almacenamiento seguro.
    const { error } = await this.auth.signOut({ scope: 'local' });
    if (error && fromSupabaseError(error).code !== 'NETWORK_UNAVAILABLE') {
      this.log.warn('auth.sign_out_failed', { code: error.code ?? 'unknown' });
    }
    // supabase-js elimina la sesión local incluso si la revocación remota falla.
    this.log.info('auth.sign_out');
    return ok(undefined);
  }

  async requestPasswordReset(raw: PasswordResetRequestInput): Promise<Result<void>> {
    const parsed = parseInput(PasswordResetRequestInput, raw);
    if (!parsed.ok) return parsed as Result<never>;
    const email = parsed.value.email;
    const last = this.lastReset.get(email);
    const cooldown = this.options.resetCooldownMs ?? 60_000;
    if (last !== undefined && this.now() - last < cooldown) {
      return err(appError('RATE_LIMITED', 'Ya enviamos un correo. Espera un minuto antes de pedir otro.'));
    }
    this.lastReset.set(email, this.now());
    const { error } = await this.auth.resetPasswordForEmail(email, this.options.redirectTo ? { redirectTo: this.options.redirectTo } : undefined);
    if (error) {
      const mapped = this.mapError(error);
      if (mapped.code === 'NETWORK_UNAVAILABLE' || mapped.code === 'RATE_LIMITED') {
        this.lastReset.delete(email);
        return err(mapped);
      }
      // Cualquier otro error (p. ej. correo inexistente) se responde igual que el éxito.
      this.log.warn('auth.reset_suppressed', { code: error.code ?? 'unknown' });
    }
    return ok(undefined);
  }

  async updatePassword(raw: UpdatePasswordInput): Promise<Result<void>> {
    const parsed = parseInput(UpdatePasswordInput, raw);
    if (!parsed.ok) return parsed as Result<never>;
    const { data } = await this.auth.getSession();
    if (!data.session) return err(appError('UNAUTHENTICATED', 'Debes iniciar sesión.'));
    const { error } = await this.auth.updateUser({ password: parsed.value.newPassword });
    if (error) return err(this.mapError(error));
    this.log.info('auth.password_updated');
    return ok(undefined);
  }

  async requestEmailCode(raw: RequestEmailCodeInput): Promise<Result<void>> {
    const parsed = parseInput(RequestEmailCodeInput, raw);
    if (!parsed.ok) return parsed as Result<never>;
    const email = parsed.value.email;
    const last = this.lastCode.get(email);
    if (last !== undefined && this.now() - last < (this.options.codeCooldownMs ?? 60_000)) {
      return err(appError('RATE_LIMITED', 'Ya te enviamos un código. Espera un minuto antes de pedir otro.'));
    }
    this.lastCode.set(email, this.now());
    const { error } = await this.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true, ...(this.options.redirectTo ? { emailRedirectTo: this.options.redirectTo } : {}) },
    });
    if (error) {
      const mapped = this.mapError(error);
      if (mapped.code === 'NETWORK_UNAVAILABLE' || mapped.code === 'RATE_LIMITED') {
        this.lastCode.delete(email);
        return err(mapped);
      }
      // Igual que la recuperación: no se revela si la cuenta existe o no.
      this.log.warn('auth.email_code_suppressed', { code: error.code ?? 'unknown' });
    }
    this.log.info('auth.email_code_requested');
    return ok(undefined);
  }

  async verifyEmailCode(raw: VerifyEmailCodeInput): Promise<Result<AuthState>> {
    const parsed = parseInput(VerifyEmailCodeInput, raw);
    if (!parsed.ok) return err(appError('VALIDATION_FAILED', 'El código debe tener de 6 a 10 dígitos.', { details: { field: 'code' } }));
    const { data, error } = await this.auth.verifyOtp({ email: parsed.value.email, token: parsed.value.code, type: 'email' });
    if (error || !data.session) {
      this.log.warn('auth.email_code_failed', { code: error?.code ?? 'no_session' });
      if (!error || error.status === 401 || error.status === 403) return err(appError('VALIDATION_FAILED', 'El código es incorrecto o ya venció. Pide uno nuevo.', { details: { field: 'code' } }));
      return err(this.mapError(error));
    }
    this.lastCode.delete(parsed.value.email);
    this.log.info('auth.sign_in', { method: 'email_code' });
    return ok(this.signedIn(data.session));
  }

  async signInWithIdToken(raw: IdTokenSignInInput): Promise<Result<AuthState>> {
    const parsed = parseInput(IdTokenSignInInput, raw);
    if (!parsed.ok) return parsed as Result<never>;
    const { provider, idToken, nonce } = parsed.value;
    if (provider === 'apple' && !nonce) return err(appError('VALIDATION_FAILED', 'Falta el nonce de Apple.'));
    const { data, error } = await this.auth.signInWithIdToken({ provider, token: idToken, ...(nonce ? { nonce } : {}) });
    if (error || !data.session) {
      this.log.warn('auth.id_token_failed', { provider, code: error?.code ?? 'no_session' });
      return err(error ? this.mapError(error) : appError('UNAUTHENTICATED', 'No se pudo iniciar sesión.'));
    }
    this.log.info('auth.sign_in', { method: provider });
    return ok(this.signedIn(data.session));
  }

  onStateChange(listener: (state: AuthState) => void): () => void {
    this.listeners.add(listener);
    if (!this.subscription) {
      this.subscription = this.auth.onAuthStateChange((event, session) => {
        let state: AuthState;
        if (event === 'PASSWORD_RECOVERY' && session) state = { status: 'password_recovery', user: toUser(session.user) };
        else if (session) state = this.signedIn(session);
        else state = { status: 'signed_out', reason: event === 'SIGNED_OUT' ? 'signed_out' : 'none' };
        for (const l of this.listeners) l(state);
      }).data.subscription;
    }
    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size === 0) {
        this.subscription?.unsubscribe();
        this.subscription = null;
      }
    };
  }
}
