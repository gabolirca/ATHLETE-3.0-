import * as SQLite from 'expo-sqlite';
import { Directory, File } from 'expo-file-system';
import type { DatabaseFiles } from '@athlete/data';

export interface ExpoDatabaseFilesOptions {
  databaseDirectory?: Directory;
}

/** Puerto `DatabaseFiles` de `@athlete/data`: solo lista el directorio de bases; nunca abre ni modifica archivos. */
export function createExpoDatabaseFiles(options?: ExpoDatabaseFilesOptions): DatabaseFiles {
  const databaseDirectory = options?.databaseDirectory ?? new Directory(SQLite.defaultDatabaseDirectory);
  return {
    async listDatabases(): Promise<string[]> {
      if (!databaseDirectory.exists) return [];
      return databaseDirectory.list().filter((entry): entry is File => entry instanceof File).map((file) => file.name);
    },
  };
}

export const expoDatabaseFiles: DatabaseFiles = createExpoDatabaseFiles();
