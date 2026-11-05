/**
 * Adaptador `node:sqlite` (Node ≥ 22). Solo para pruebas y herramientas: NO importar desde la app
 * (se expone como subruta `@athlete/data/node-sqlite` para que Metro no lo empaquete).
 */
import { DatabaseSync } from 'node:sqlite';
import { SerializedDatabase, type RawSqlDriver, type SqlDatabase, type SqlRow } from './types';

export function openNodeSqlite(path: string): SqlDatabase {
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;');
  const driver: RawSqlDriver = {
    exec: async (sql) => {
      db.exec(sql);
    },
    run: async (sql, params) => {
      const r = db.prepare(sql).run(...params);
      return { changes: Number(r.changes) };
    },
    all: async (sql, params) => db.prepare(sql).all(...params) as SqlRow[],
    close: async () => db.close(),
  };
  return new SerializedDatabase(driver);
}
