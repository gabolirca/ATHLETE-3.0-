import { createExpoDatabaseFiles, expoDatabaseFiles, BACKUP_DIRECTORY_NAME } from './expoDatabaseFiles';
import { Directory, File } from 'expo-file-system';
import * as Crypto from 'expo-crypto';

const mockExistingFiles = new Set<string>();
const mockExistingDirs = new Set<string>();
const mockDirectoryContents = new Map<string, unknown[]>();

jest.mock('expo-sqlite', () => ({
  defaultDatabaseDirectory: 'file:///data/user/0/com.athlete.mobile/files/SQLite',
}));

jest.mock('expo-crypto', () => ({
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  digest: jest.fn(),
}));

jest.mock('expo-file-system', () => {
  class MockDirectory {
    uri: string;

    constructor(...parts: (string | { uri: string })[]) {
      this.uri = parts.map((p) => (typeof p === 'string' ? p : p.uri)).join('/');
    }

    get exists() {
      return mockExistingDirs.has(this.uri);
    }

    list() {
      if (!this.exists) throw new Error(`Directory ${this.uri} does not exist`);
      return mockDirectoryContents.get(this.uri) ?? [];
    }

    create = jest.fn().mockImplementation(() => {
      mockExistingDirs.add(this.uri);
    });
  }

  class MockFile {
    uri: string;
    name: string;
    content = new ArrayBuffer(8);

    constructor(...parts: (string | { uri: string })[]) {
      this.uri = parts.map((p) => (typeof p === 'string' ? p : p.uri)).join('/');
      const segments = this.uri.split('/');
      this.name = segments[segments.length - 1] ?? '';
    }

    get exists() {
      return mockExistingFiles.has(this.uri);
    }

    copy = jest.fn().mockImplementation(async (destination: { uri: string }) => {
      mockExistingFiles.add(destination.uri);
    });

    arrayBuffer = jest.fn().mockImplementation(async () => this.content);
  }

  return {
    Directory: MockDirectory,
    File: MockFile,
    Paths: { document: 'file:///data/user/0/com.athlete.mobile/files' },
  };
});

describe('expoDatabaseFiles', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockExistingFiles.clear();
    mockExistingDirs.clear();
    mockDirectoryContents.clear();
    (Crypto.digest as jest.Mock).mockResolvedValue(new Uint8Array([0xab, 0xcd, 0xef, 0x01]).buffer);
  });

  test('conforms to the official DatabaseFiles interface', () => {
    expect(typeof expoDatabaseFiles.listDatabases).toBe('function');
    expect(typeof expoDatabaseFiles.hashDatabaseFile).toBe('function');
    expect(typeof expoDatabaseFiles.copyToBackup).toBe('function');
    expect(typeof expoDatabaseFiles.hashBackupFile).toBe('function');
    expect(BACKUP_DIRECTORY_NAME).toBe('athlete3-backups');
  });

  describe('listDatabases', () => {
    test('returns empty array if database directory does not exist', async () => {
      const mockDir = new Directory('file:///databases');
      const files = createExpoDatabaseFiles({ databaseDirectory: mockDir });

      const result = await files.listDatabases();
      expect(result).toEqual([]);
    });

    test('returns file names and filters out subdirectories', async () => {
      const mockDir = new Directory('file:///databases');
      mockExistingDirs.add(mockDir.uri);

      const dbFile1 = new File(mockDir, 'athlete3.db');
      const dbFile2 = new File(mockDir, 'athlete3-wal');
      const subDir = new Directory(mockDir, 'subfolder');
      mockDirectoryContents.set(mockDir.uri, [dbFile1, subDir, dbFile2]);

      const files = createExpoDatabaseFiles({ databaseDirectory: mockDir });
      const result = await files.listDatabases();
      expect(result).toEqual(['athlete3.db', 'athlete3-wal']);
    });
  });

  describe('hashDatabaseFile', () => {
    test('returns null if database file does not exist', async () => {
      const mockDir = new Directory('file:///databases');
      mockExistingDirs.add(mockDir.uri);
      const files = createExpoDatabaseFiles({ databaseDirectory: mockDir });

      const hash = await files.hashDatabaseFile('non-existent.db');
      expect(hash).toBeNull();
    });

    test('computes lowercase hex SHA-256 if file exists', async () => {
      const mockDir = new Directory('file:///databases');
      mockExistingDirs.add(mockDir.uri);
      const targetFile = new File(mockDir, 'athlete3.db');
      mockExistingFiles.add(targetFile.uri);

      const files = createExpoDatabaseFiles({ databaseDirectory: mockDir });
      const hash = await files.hashDatabaseFile('athlete3.db');
      expect(hash).toBe('abcdef01');
      expect(Crypto.digest).toHaveBeenCalledWith(
        Crypto.CryptoDigestAlgorithm.SHA256,
        expect.any(ArrayBuffer)
      );
    });
  });

  describe('copyToBackup', () => {
    test('creates backup directory if it does not exist and copies source file', async () => {
      const mockDbDir = new Directory('file:///databases');
      mockExistingDirs.add(mockDbDir.uri);
      const sourceFile = new File(mockDbDir, 'athlete3.db');
      mockExistingFiles.add(sourceFile.uri);

      const mockBackupRoot = new Directory('file:///backups');
      mockExistingDirs.add(mockBackupRoot.uri);

      const files = createExpoDatabaseFiles({
        databaseDirectory: mockDbDir,
        backupRoot: mockBackupRoot,
      });

      await files.copyToBackup('athlete3.db', 'dir-1');

      const expectedBackupDir = new Directory(mockBackupRoot, 'dir-1');
      expect(mockExistingDirs.has(expectedBackupDir.uri)).toBe(true);

      const expectedDestFile = new File(expectedBackupDir, 'athlete3.db');
      expect(mockExistingFiles.has(expectedDestFile.uri)).toBe(true);
    });

    test('throws if destination file already exists (protects against overwriting)', async () => {
      const mockDbDir = new Directory('file:///databases');
      mockExistingDirs.add(mockDbDir.uri);
      const sourceFile = new File(mockDbDir, 'athlete3.db');
      mockExistingFiles.add(sourceFile.uri);

      const mockBackupRoot = new Directory('file:///backups');
      mockExistingDirs.add(mockBackupRoot.uri);
      const targetDir = new Directory(mockBackupRoot, 'dir-1');
      mockExistingDirs.add(targetDir.uri);

      const existingDest = new File(targetDir, 'athlete3.db');
      mockExistingFiles.add(existingDest.uri);

      const files = createExpoDatabaseFiles({
        databaseDirectory: mockDbDir,
        backupRoot: mockBackupRoot,
      });

      await expect(files.copyToBackup('athlete3.db', 'dir-1')).rejects.toThrow(
        'dir-1/athlete3.db ya existe; no se sobrescribe.'
      );
    });

    test('throws if source database file does not exist', async () => {
      const mockDbDir = new Directory('file:///databases');
      mockExistingDirs.add(mockDbDir.uri);

      const mockBackupRoot = new Directory('file:///backups');
      mockExistingDirs.add(mockBackupRoot.uri);

      const files = createExpoDatabaseFiles({
        databaseDirectory: mockDbDir,
        backupRoot: mockBackupRoot,
      });

      await expect(files.copyToBackup('missing.db', 'dir-1')).rejects.toThrow(
        'El archivo de origen missing.db no existe en el directorio de bases.'
      );
    });
  });

  describe('hashBackupFile', () => {
    test('returns null if backup file does not exist', async () => {
      const mockBackupRoot = new Directory('file:///backups');
      mockExistingDirs.add(mockBackupRoot.uri);
      const files = createExpoDatabaseFiles({ backupRoot: mockBackupRoot });

      const hash = await files.hashBackupFile('dir-1', 'nonexistent.db');
      expect(hash).toBeNull();
    });

    test('returns lowercase hex SHA-256 if backup file exists', async () => {
      const mockBackupRoot = new Directory('file:///backups');
      mockExistingDirs.add(mockBackupRoot.uri);
      const targetDir = new Directory(mockBackupRoot, 'dir-1');
      mockExistingDirs.add(targetDir.uri);

      const backupFile = new File(targetDir, 'athlete3.db');
      mockExistingFiles.add(backupFile.uri);

      const files = createExpoDatabaseFiles({ backupRoot: mockBackupRoot });
      const hash = await files.hashBackupFile('dir-1', 'athlete3.db');
      expect(hash).toBe('abcdef01');
    });
  });
});
