import * as SQLite from 'expo-sqlite';
import { Directory, File } from 'expo-file-system';
import type { DatabaseFiles } from '@athlete/data';

export interface ExpoDatabaseFilesOptions {
  databaseDirectory?: Directory;
}

/**
 * La carpeta de bases como URI. En Android `defaultDatabaseDirectory` es una ruta simple (`/data/user/0/…/SQLite`)
 * y expo-file-system necesita `file://`; sin esto la app no podía revisar sus bases y quedaba en "open-failed".
 */
export function databaseDirectoryUri(dir: string): string {
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(dir) ? dir : `file://${dir.startsWith('/') ? '' : '/'}${dir}`;
}

/** Puerto `DatabaseFiles` de `@athlete/data`: solo lista el directorio de bases; nunca abre ni modifica archivos. */
export function createExpoDatabaseFiles(options?: ExpoDatabaseFilesOptions): DatabaseFiles {
  const databaseDirectory = options?.databaseDirectory ?? new Directory(databaseDirectoryUri(SQLite.defaultDatabaseDirectory));
  return {
    async listDatabases(): Promise<string[]> {
      if (!databaseDirectory.exists) return [];
      return databaseDirectory.list().filter((entry): entry is File => entry instanceof File).map((file) => file.name);
    },
  };
}

export const expoDatabaseFiles: DatabaseFiles = createExpoDatabaseFiles();
