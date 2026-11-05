import { z } from 'zod';
import { IsoDateTime, TimeZone, Uuid } from './common';
import type { Result } from './errors';

/**
 * Autenticación (Supabase Auth detrás de `AuthService`). La UI nunca ve tokens:
 * el access/refresh token vive en almacenamiento seguro del dispositivo, gestionado por el adaptador.
 * Las contraseñas nunca se persisten (ni en SQLite ni en logs).
 */
export const Email = z.string().trim().toLowerCase().pipe(z.email().max(254));
export type Email = z.infer<typeof Email>;

export const PASSWORD_MIN_LENGTH = 10;
/** Supabase Auth (bcrypt) solo usa los primeros 72 bytes: se rechaza lo que exceda. */
export const PASSWORD_MAX_BYTES = 72;

export const NewPassword = z
  .string()
  .min(PASSWORD_MIN_LENGTH, { message: `Mínimo ${PASSWORD_MIN_LENGTH} caracteres` })
  .refine((p) => new TextEncoder().encode(p).length <= PASSWORD_MAX_BYTES, { message: 'Contraseña demasiado larga' })
  .refine((p) => /[A-Za-z]/.test(p) && /\d/.test(p), { message: 'Debe incluir letras y números' });

export const SignUpInput = z.object({
  email: Email,
  password: NewPassword,
  /** Zona horaria inicial del perfil. */
  timeZone: TimeZone,
});
export type SignUpInput = z.input<typeof SignUpInput>;

export const SignInInput = z.object({
  email: Email,
  // No se aplica la política de creación al iniciar sesión (cuentas antiguas), solo límites.
  password: z.string().min(1).max(256),
});
export type SignInInput = z.input<typeof SignInInput>;

export const PasswordResetRequestInput = z.object({ email: Email });
export type PasswordResetRequestInput = z.input<typeof PasswordResetRequestInput>;

export const UpdatePasswordInput = z.object({ newPassword: NewPassword });
export type UpdatePasswordInput = z.input<typeof UpdatePasswordInput>;

export const AuthUser = z.object({
  id: Uuid,
  email: z.string().nullable(),
  emailConfirmed: z.boolean(),
});
export type AuthUser = z.infer<typeof AuthUser>;

/** Estado de autenticación observable por la UI. Sin tokens. */
export const AuthState = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('signed_out'),
    /** Por qué no hay sesión: nunca la hubo, se cerró, expiró y no se pudo renovar, o fue revocada. */
    reason: z.enum(['none', 'signed_out', 'expired', 'revoked']),
  }),
  /** Registro hecho; falta confirmar el correo (si el proyecto lo exige). */
  z.object({ status: z.literal('pending_confirmation'), email: z.string() }),
  z.object({ status: z.literal('signed_in'), user: AuthUser, expiresAt: IsoDateTime }),
  /** Llegó desde el enlace de recuperación: solo se permite `updatePassword`. */
  z.object({ status: z.literal('password_recovery'), user: AuthUser }),
]);
export type AuthState = z.infer<typeof AuthState>;

export interface AuthService {
  /** Estado actual; renueva la sesión si está por expirar. */
  getState(): Promise<AuthState>;
  signUp(input: SignUpInput): Promise<Result<AuthState>>;
  signIn(input: SignInInput): Promise<Result<AuthState>>;
  /** Cierra la sesión de este dispositivo y borra los tokens locales. */
  signOut(): Promise<Result<void>>;
  /** Siempre responde igual exista o no la cuenta (no permite enumerar usuarios). */
  requestPasswordReset(input: PasswordResetRequestInput): Promise<Result<void>>;
  updatePassword(input: UpdatePasswordInput): Promise<Result<void>>;
  onStateChange(listener: (state: AuthState) => void): () => void;
}

/**
 * Almacenamiento seguro clave-valor para la sesión (Codex: expo-secure-store; si el valor supera
 * el límite de la plataforma, cifrar con una clave guardada en SecureStore — ver docs/architecture/security.md).
 */
export interface SecureKeyValueStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}
