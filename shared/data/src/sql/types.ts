/**
 * Puerto mínimo de SQLite. Implementaciones:
 *  - `node-sqlite.ts` (pruebas y herramientas en Node; subruta `@athlete/data/node-sqlite`)
 *  - `expo-sqlite.ts` (app móvil, Expo SDK 54)
 * Todas las operaciones se serializan: una transacción nunca se intercala con otra escritura.
 */
export type SqlValue = string | number | null;
export type SqlRow = Record<string, SqlValue>;

export interface SqlExecutor {
  exec(sql: string): Promise<void>;
  run(sql: string, params?: readonly SqlValue[]): Promise<{ changes: number }>;
  all<T extends SqlRow = SqlRow>(sql: string, params?: readonly SqlValue[]): Promise<T[]>;
  get<T extends SqlRow = SqlRow>(sql: string, params?: readonly SqlValue[]): Promise<T | null>;
}

export interface SqlDatabase extends SqlExecutor {
  /** Ejecuta `fn` dentro de BEGIN IMMEDIATE / COMMIT; ROLLBACK si lanza. */
  transaction<T>(fn: (tx: SqlExecutor) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

/** Driver crudo asíncrono que adaptan las implementaciones concretas. */
export interface RawSqlDriver {
  exec(sql: string): Promise<void>;
  run(sql: string, params: readonly SqlValue[]): Promise<{ changes: number }>;
  all(sql: string, params: readonly SqlValue[]): Promise<SqlRow[]>;
  close(): Promise<void>;
}

class Mutex {
  private tail: Promise<void> = Promise.resolve();
  async lock<T>(fn: () => Promise<T>): Promise<T> {
    const previous = this.tail;
    let release!: () => void;
    this.tail = new Promise<void>((r) => (release = r));
    await previous;
    try {
      return await fn();
    } finally {
      release();
    }
  }
}

/** Envuelve un driver crudo con serialización y transacciones. */
export class SerializedDatabase implements SqlDatabase {
  private readonly mutex = new Mutex();
  private readonly direct: SqlExecutor;

  constructor(private readonly driver: RawSqlDriver) {
    this.direct = {
      exec: (sql) => driver.exec(sql),
      run: (sql, params = []) => driver.run(sql, params),
      all: async <T extends SqlRow>(sql: string, params: readonly SqlValue[] = []) => (await driver.all(sql, params)) as T[],
      get: async <T extends SqlRow>(sql: string, params: readonly SqlValue[] = []) => ((await driver.all(sql, params))[0] as T | undefined) ?? null,
    };
  }

  exec(sql: string) {
    return this.mutex.lock(() => this.direct.exec(sql));
  }
  run(sql: string, params?: readonly SqlValue[]) {
    return this.mutex.lock(() => this.direct.run(sql, params));
  }
  all<T extends SqlRow = SqlRow>(sql: string, params?: readonly SqlValue[]) {
    return this.mutex.lock(() => this.direct.all<T>(sql, params));
  }
  get<T extends SqlRow = SqlRow>(sql: string, params?: readonly SqlValue[]) {
    return this.mutex.lock(() => this.direct.get<T>(sql, params));
  }

  transaction<T>(fn: (tx: SqlExecutor) => Promise<T>): Promise<T> {
    return this.mutex.lock(async () => {
      await this.direct.exec('BEGIN IMMEDIATE');
      try {
        const result = await fn(this.direct);
        await this.direct.exec('COMMIT');
        return result;
      } catch (error) {
        await this.direct.exec('ROLLBACK').catch(() => undefined);
        throw error;
      }
    });
  }

  close() {
    return this.mutex.lock(() => this.driver.close());
  }
}
