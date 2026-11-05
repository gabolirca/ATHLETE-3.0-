import { createExpoDatabaseFiles, expoDatabaseFiles } from './expoDatabaseFiles';
import { Directory, File } from 'expo-file-system';

const mockExistingFiles = new Set<string>();
const mockExistingDirs = new Set<string>();
const mockDirectoryContents = new Map<string, unknown[]>();

jest.mock('expo-sqlite', () => ({
  defaultDatabaseDirectory: 'file:///data/user/0/com.athlete.mobile/files/SQLite',
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

    constructor(...parts: (string | { uri: string })[]) {
      this.uri = parts.map((p) => (typeof p === 'string' ? p : p.uri)).join('/');
      const segments = this.uri.split('/');
      this.name = segments[segments.length - 1] ?? '';
    }

    get exists() {
      return mockExistingFiles.has(this.uri);
    }

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
  });

  test('implementa el puerto DatabaseFiles oficial (solo listar)', () => {
    expect(Object.keys(expoDatabaseFiles)).toEqual(['listDatabases']);
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
});
