import * as Crypto from 'expo-crypto';
import * as SQLite from 'expo-sqlite';
import { Directory, File, Paths } from 'expo-file-system';
import type { DatabaseFiles } from '@athlete/data';

export const BACKUP_DIRECTORY_NAME = 'athlete3-backups';

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function sha256OfFile(file: File): Promise<string | null> {
  if (!file.exists) return null;
  const content = await file.arrayBuffer();
  const hash = await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, content);
  return toHex(hash);
}

export interface ExpoDatabaseFilesOptions {
  databaseDirectory?: Directory;
  backupRoot?: Directory;
}

export function createExpoDatabaseFiles(options?: ExpoDatabaseFilesOptions): DatabaseFiles {
  const databaseDirectory = options?.databaseDirectory ?? new Directory(SQLite.defaultDatabaseDirectory);
  const backupRoot = options?.backupRoot ?? new Directory(Paths.document, BACKUP_DIRECTORY_NAME);

  return {
    async listDatabases(): Promise<string[]> {
      if (!databaseDirectory.exists) return [];
      const entries = databaseDirectory.list();
      return entries.filter((entry): entry is File => entry instanceof File).map((file) => file.name);
    },

    async hashDatabaseFile(name: string): Promise<string | null> {
      const file = new File(databaseDirectory, name);
      return sha256OfFile(file);
    },

    async copyToBackup(name: string, backupDir: string): Promise<void> {
      const targetDir = new Directory(backupRoot, backupDir);
      if (!targetDir.exists) {
        targetDir.create({ intermediates: true, idempotent: true });
      }
      const destination = new File(targetDir, name);
      if (destination.exists) {
        throw new Error(`${backupDir}/${name} ya existe; no se sobrescribe.`);
      }
      const source = new File(databaseDirectory, name);
      if (!source.exists) {
        throw new Error(`El archivo de origen ${name} no existe en el directorio de bases.`);
      }
      await source.copy(destination);
    },

    async hashBackupFile(backupDir: string, name: string): Promise<string | null> {
      const file = new File(backupRoot, backupDir, name);
      return sha256OfFile(file);
    },
  };
}

export const expoDatabaseFiles: DatabaseFiles = createExpoDatabaseFiles();
