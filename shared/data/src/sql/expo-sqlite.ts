/**
 * Adaptador para `expo-sqlite` (Expo SDK 58). No importa `expo-sqlite` directamente: la app inyecta la función de
 * apertura, de modo que este paquete sigue siendo probable en Node.
 *
 * La app debe usar `openAthleteData` (que abre con `openEncryptedDatabase`, verifica la clave y gestiona la identidad).
 * `fromExpoSqlite` queda para herramientas y pruebas: aplica la clave pero NO verifica que abra la base.
 */
import { SerializedDatabase, type SqlDatabase, type SqlRow, type SqlValue } from './types';

/** Subconjunto estructural de `SQLiteDatabase` de expo-sqlite que se utiliza. */
export interface ExpoSQLiteDatabaseLike {
  execAsync(source: string): Promise<void>;
  runAsync(source: string, params: SqlValue[]): Promise<{ changes: number }>;
  getAllAsync<T>(source: string, params: SqlValue[]): Promise<T[]>;
  closeAsync(): Promise<void>;
}

export type ExpoSqliteOptions = {
  /**
   * Clave de cifrado SQLCipher (requiere el config plugin de expo-sqlite con `useSQLCipher: true`).
   * Debe generarse aleatoriamente y guardarse en SecureStore; nunca derivarse de la contraseña.
   */
  encryptionKey?: string;
};

export async function fromExpoSqlite(raw: ExpoSQLiteDatabaseLike, options: ExpoSqliteOptions = {}): Promise<SqlDatabase> {
  if (options.encryptionKey !== undefined) {
    if (!/^[0-9a-f]{64}$/i.test(options.encryptionKey)) {
      throw new Error('encryptionKey debe ser 32 bytes en hexadecimal');
    }
    // PRAGMA no admite parámetros; el formato hexadecimal validado evita inyección.
    await raw.execAsync(`PRAGMA key = "x'${options.encryptionKey}'";`);
  }
  await raw.execAsync('PRAGMA journal_mode = WAL;');
  return new SerializedDatabase({
    exec: (sql) => raw.execAsync(sql),
    run: async (sql, params) => ({ changes: (await raw.runAsync(sql, [...params])).changes }),
    all: (sql, params) => raw.getAllAsync<SqlRow>(sql, [...params]),
    close: () => raw.closeAsync(),
  });
}

/**
 * Una base local por usuario (y por ambiente en builds de desarrollo): al cambiar de cuenta
 * o de ambiente en el dispositivo no se mezclan datos.
 */
export function localDatabaseName(userId: string, env?: 'local' | 'development' | 'testing' | 'production'): string {
  if (!/^[0-9a-f-]{36}$/i.test(userId)) throw new Error('userId no válido');
  return `${localDatabasePrefix(env)}-${userId.toLowerCase()}.db`;
}

/** Prefijo de `localDatabaseName` para un ambiente (`athlete3`, `athlete3-development`, …). */
export function localDatabasePrefix(env?: 'local' | 'development' | 'testing' | 'production'): string {
  return env && env !== 'production' ? `athlete3-${env}` : 'athlete3';
}
