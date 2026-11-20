import type { SecureKeyValueStorage } from '@athlete/contracts';
import type { ExpoSQLiteDatabaseLike } from '../sql/expo-sqlite';
import { SerializedDatabase, type SqlDatabase } from '../sql/types';

/**
 * Apertura de la base local cifrada con SQLCipher y gestión de su clave en almacenamiento seguro.
 * Es el único lugar que crea, lee o valida claves de base de datos. La app solo inyecta `expo-sqlite`,
 * `expo-secure-store` y una fuente de bytes aleatorios.
 *
 * Reglas (las mismas que se validaron en el simulador el 4-nov con la capa anterior):
 *  - Nunca se genera una clave nueva si ya existe una base cifrada cuya clave no se puede recuperar.
 *  - Nunca se sobrescribe un valor existente del almacén seguro.
 *  - Se comprueba que SQLCipher está activo y que la clave abre la base ANTES de migrar o escribir.
 *  - Los errores son explícitos y tipados; `recoverable` indica si reintentar puede funcionar sin perder datos.
 */

export type LocalDatabaseErrorCode =
  /** El almacén seguro no se pudo leer o escribir (dispositivo bloqueado, entitlement ausente, error del llavero). */
  | 'secure-store-unavailable'
  /** Un valor guardado no tiene el formato esperado. No se toca. */
  | 'secret-invalid'
  /** Apareció un valor mientras se creaba uno nuevo. No se sobrescribió nada. */
  | 'secret-conflict'
  /** Hay una base cifrada pero no su clave. No se generó otra ni se modificó nada. */
  | 'database-key-missing'
  /** La clave guardada no abre la base (clave incorrecta o archivo dañado). Nada se migró ni escribió. */
  | 'database-unreadable'
  /** La compilación nativa no incluye SQLCipher: los datos no quedarían cifrados. */
  | 'sqlcipher-unavailable'
  /** Se esperaba una base existente pero falta la identidad del dispositivo. No se creó otra. */
  | 'identity-missing';

const RECOVERABLE: ReadonlySet<LocalDatabaseErrorCode> = new Set(['secure-store-unavailable', 'secret-conflict']);

export class LocalDatabaseError extends Error {
  readonly code: LocalDatabaseErrorCode;
  readonly recoverable: boolean;

  constructor(code: LocalDatabaseErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'LocalDatabaseError';
    this.code = code;
    this.recoverable = RECOVERABLE.has(code);
  }
}

export function isLocalDatabaseError(error: unknown): error is LocalDatabaseError {
  return error instanceof LocalDatabaseError;
}

const KEY_PATTERN = /^[0-9a-f]{64}$/;
const messageOf = (e: unknown) => (e instanceof Error ? e.message : String(e));
const toHex = (bytes: Uint8Array) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');

/** Nombre de la entrada del almacén seguro con la clave de cada archivo (una clave por base, nunca compartida). */
export function databaseKeyName(databaseName: string): string {
  if (!/^[A-Za-z0-9._-]+$/.test(databaseName)) throw new Error('Nombre de base no válido');
  return `athlete3.sqlcipher-key.${databaseName}.v1`;
}

export async function readSecret(store: SecureKeyValueStorage, name: string): Promise<string | null> {
  try {
    return await store.getItem(name);
  } catch (error) {
    throw new LocalDatabaseError('secure-store-unavailable', `No se pudo leer ${name} del almacén seguro: ${messageOf(error)}`, { cause: error });
  }
}

/** Guarda solo si la entrada sigue vacía y comprueba la lectura. Nunca reemplaza un valor existente. */
export async function storeNewSecret(store: SecureKeyValueStorage, name: string, value: string): Promise<void> {
  if ((await readSecret(store, name)) !== null) {
    throw new LocalDatabaseError('secret-conflict', `${name} apareció en el almacén seguro durante la inicialización; no se sobrescribió.`);
  }
  await writeSecret(store, name, value);
}

/**
 * Sustituye un valor solo si el actual es exactamente `expected` (comparar-y-escribir). Para transiciones de estado
 * explícitas (p. ej. vincular la identidad local a una cuenta), nunca para claves de cifrado.
 */
export async function replaceSecret(store: SecureKeyValueStorage, name: string, expected: string, value: string): Promise<void> {
  if ((await readSecret(store, name)) !== expected) {
    throw new LocalDatabaseError('secret-conflict', `${name} cambió durante la operación; no se sobrescribió.`);
  }
  await writeSecret(store, name, value);
}

async function writeSecret(store: SecureKeyValueStorage, name: string, value: string): Promise<void> {
  try {
    await store.setItem(name, value);
  } catch (error) {
    throw new LocalDatabaseError('secure-store-unavailable', `No se pudo guardar ${name} en el almacén seguro: ${messageOf(error)}`, { cause: error });
  }
  if ((await readSecret(store, name)) !== value) {
    throw new LocalDatabaseError('secret-conflict', `${name} no coincide con el valor recién guardado; no se usará.`);
  }
}

export type OpenEncryptedDatabaseOptions = {
  /** Nombre del archivo (p. ej. `localDatabaseName(userId)`). */
  name: string;
  /** Abre (o crea) el archivo sin ejecutar ninguna sentencia: `(name) => SQLite.openDatabaseAsync(name)`. */
  open: (name: string) => Promise<ExpoSQLiteDatabaseLike>;
  secureStore: SecureKeyValueStorage;
  /** Bytes aleatorios criptográficos (`expo-crypto.getRandomBytes`). */
  randomBytes: (n: number) => Uint8Array;
  /** Entrada del almacén seguro con la clave. Por defecto `databaseKeyName(name)`. */
  keyName?: string;
  /**
   * La base debe existir ya (lo decidió `openActiveStore`): sin clave guardada → `database-key-missing`, sin abrir
   * el archivo ni generar clave. Evita tratar una base existente como instalación nueva.
   */
  requireExisting?: boolean;
};

export async function openEncryptedDatabase(options: OpenEncryptedDatabaseOptions): Promise<SqlDatabase> {
  const keyName = options.keyName ?? databaseKeyName(options.name);
  const storedKey = await readSecret(options.secureStore, keyName);
  if (storedKey !== null && !KEY_PATTERN.test(storedKey)) {
    throw new LocalDatabaseError('secret-invalid', 'La clave de la base guardada tiene un formato inválido; no se reemplazó.');
  }

  if (storedKey === null && options.requireExisting) {
    throw new LocalDatabaseError('database-key-missing', 'No hay clave para la base existente; no se generó ninguna.');
  }
  const raw = await options.open(options.name);
  try {
    const key = storedKey ?? toHex(options.randomBytes(32));
    // Debe ser la primera sentencia de la conexión. El formato hexadecimal validado evita inyección en el PRAGMA.
    await raw.execAsync(`PRAGMA key = "x'${key}'";`);

    const cipher = await raw.getAllAsync<{ cipher_version?: string }>('PRAGMA cipher_version;', []).catch(() => []);
    if (!cipher[0]?.cipher_version) {
      throw new LocalDatabaseError('sqlcipher-unavailable', 'La compilación nativa no incluye SQLCipher; no se abrirá la base sin cifrado.');
    }

    let objects: number | null;
    try {
      const rows = await raw.getAllAsync<{ objects: number }>('SELECT count(*) AS objects FROM sqlite_master;', []);
      objects = Number(rows[0]?.objects ?? 0);
    } catch {
      objects = null; // SQLCipher: "file is not a database"
    }

    if (storedKey !== null) {
      if (objects === null) {
        throw new LocalDatabaseError('database-unreadable', 'La clave guardada no abre la base local. No se ejecutaron migraciones ni se modificaron datos.');
      }
    } else {
      // Una clave aleatoria nueva solo puede leer un archivo vacío: un fallo o un esquema existente significa que hay
      // una base cifrada cuya clave se perdió. Se dejan intactos el archivo y el almacén seguro.
      if (objects !== 0) {
        throw new LocalDatabaseError('database-key-missing', 'Existe una base local cifrada sin clave en el almacén seguro. No se generó otra ni se modificaron datos.');
      }
      // Primera instalación: la clave se guarda antes de la primera escritura.
      await storeNewSecret(options.secureStore, keyName, key);
    }

    await raw.execAsync('PRAGMA journal_mode = WAL;');
  } catch (error) {
    await raw.closeAsync().catch(() => undefined);
    throw error;
  }

  return new SerializedDatabase({
    exec: (sql) => raw.execAsync(sql),
    run: async (sql, params) => ({ changes: (await raw.runAsync(sql, [...params])).changes }),
    all: (sql, params) => raw.getAllAsync(sql, [...params]),
    close: () => raw.closeAsync(),
  });
}
