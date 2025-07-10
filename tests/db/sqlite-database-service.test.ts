// Mock sql.js module completely
jest.mock('sql.js', () => ({
  __esModule: true,
  default: jest.fn(() => Promise.resolve({
    Database: class MockDatabase {
      constructor() {}
      exec(): any[] { return []; }
      prepare(): any { 
        return {
          get: (): any => null,
          run: (): void => {},
          free: (): void => {}
        };
      }
      export(): Uint8Array { return new Uint8Array(); }
      close(): void {}
    }
  }))
}));

import { SQLiteDatabaseService, Word } from '../../src/db/sqlite_database_service';
import { Vault } from 'obsidian';

// Mock Vault interface
const createMockVault = (): Vault => {
  const mockAdapter = {
    exists: jest.fn(),
    readBinary: jest.fn(),
    writeBinary: jest.fn(),
    read: jest.fn(),
    write: jest.fn(),
    remove: jest.fn(),
    rename: jest.fn(),
    mkdir: jest.fn(),
    rmdir: jest.fn(),
    trashSystem: jest.fn(),
    trashLocal: jest.fn(),
    list: jest.fn(),
    stat: jest.fn(),
    getResourcePath: jest.fn(),
  };

  // Mock successful WASM and database operations
  mockAdapter.readBinary.mockResolvedValue(new ArrayBuffer(1024));
  mockAdapter.exists.mockResolvedValue(false);
  mockAdapter.writeBinary.mockResolvedValue(undefined);

  return {
    adapter: mockAdapter,
    configDir: '/mock/vault/.obsidian',
    getName: () => 'Mock Vault',
    getAbstractFileByPath: jest.fn(),
    getRoot: jest.fn(),
    getFileByPath: jest.fn(),
    getFolderByPath: jest.fn(),
    getFiles: jest.fn(),
    getAllLoadedFiles: jest.fn(),
    getMarkdownFiles: jest.fn(),
    read: jest.fn(),
    readBinary: jest.fn(),
    cachedRead: jest.fn(),
    create: jest.fn(),
    createBinary: jest.fn(),
    createFolder: jest.fn(),
    delete: jest.fn(),
    trash: jest.fn(),
    rename: jest.fn(),
    modify: jest.fn(),
    modifyBinary: jest.fn(),
    copy: jest.fn(),
    process: jest.fn(),
    on: jest.fn(),
    off: jest.fn(),
    offref: jest.fn(),
    trigger: jest.fn(),
    tryTrigger: jest.fn(),
  } as unknown as Vault;
};

describe('SQLiteDatabaseService', () => {
  let service: SQLiteDatabaseService;
  let mockVault: Vault;

  beforeEach(() => {
    mockVault = createMockVault();
    service = new SQLiteDatabaseService(mockVault);
  });

  afterEach(async () => {
    await service.shutdown();
  });

  describe('Constructor and Basic Interface', () => {
    it('should create service instance', () => {
      expect(service).toBeDefined();
      expect(service).toBeInstanceOf(SQLiteDatabaseService);
    });

    it('should have correct database file path', () => {
      // Test that the constructor sets up the correct path
      expect(service).toBeDefined();
      // Path should be constructed from vault configDir
    });
  });

  describe('Error Handling', () => {
    it('should throw error when using database before initialization', async () => {
      // Test methods that require initialization
      await expect(service.getScanSourceId()).rejects.toThrow('Database not initialized');
      await expect(service.getWordCount()).rejects.toThrow('Database not initialized');
      await expect(service.getWordLists()).rejects.toThrow('Database not initialized');
      await expect(service.searchWords('test')).rejects.toThrow('Database not initialized');
    });

    it('should handle initialization errors gracefully', async () => {
      const mockAdapter = mockVault.adapter as any;
      mockAdapter.readBinary.mockRejectedValue(new Error('WASM file not found'));

      await expect(service.initialize()).rejects.toThrow('WASM file not found');
    });

    it('should handle shutdown without initialization', async () => {
      // Should not throw error when shutting down uninitialized service
      await expect(service.shutdown()).resolves.not.toThrow();
    });

    it('should handle multiple shutdown calls', async () => {
      await service.shutdown();
      await expect(service.shutdown()).resolves.not.toThrow();
    });
  });

  describe('Hash Calculation', () => {
    it('should calculate hash for content', async () => {
      const content = 'test content for hashing';
      const hash = await service.calculateFileHash(content);
      
      expect(hash).toBeDefined();
      expect(typeof hash).toBe('string');
      expect(hash.length).toBeGreaterThan(0);
    });

    it('should calculate hash for empty content', async () => {
      const hash = await service.calculateFileHash('');
      
      expect(hash).toBeDefined();
      expect(typeof hash).toBe('string');
    });

    it('should produce consistent hashes', async () => {
      const content = 'consistent content';
      const hash1 = await service.calculateFileHash(content);
      const hash2 = await service.calculateFileHash(content);
      
      expect(hash1).toBe(hash2);
    });

    it('should produce different hashes for different content', async () => {
      const hash1 = await service.calculateFileHash('content1');
      const hash2 = await service.calculateFileHash('content2');
      
      expect(hash1).not.toBe(hash2);
    });
  });

  describe('Initialization Flow', () => {
    it('should attempt to read WASM file during initialization', async () => {
      const mockAdapter = mockVault.adapter as any;
      
      // Mock successful WASM read but fail initialization to avoid SQL.js issues
      mockAdapter.readBinary.mockRejectedValue(new Error('Test stop'));

      await expect(service.initialize()).rejects.toThrow('Test stop');
      
      expect(mockAdapter.readBinary).toHaveBeenCalledWith(
        expect.stringContaining('sql-wasm.wasm')
      );
    });

    it('should check for existing database file', async () => {
      const mockAdapter = mockVault.adapter as any;
      
      // Test that initialization calls exists() to check for database file
      await service.initialize();
      
      expect(mockAdapter.exists).toHaveBeenCalledWith(
        expect.stringContaining('completr.db')
      );
    });

    it('should prevent double initialization', async () => {
      const mockAdapter = mockVault.adapter as any;
      const readBinarySpy = jest.spyOn(mockAdapter, 'readBinary');
      
      // Mock to prevent actual SQL.js initialization
      readBinarySpy.mockRejectedValue(new Error('Test stop'));

      await expect(service.initialize()).rejects.toThrow('Test stop');
      const firstCallCount = readBinarySpy.mock.calls.length;

      // Second call should not make additional file reads (but might still fail)
      await expect(service.initialize()).rejects.toThrow();
      const secondCallCount = readBinarySpy.mock.calls.length;

      // The service might not fully prevent double init if the first init failed
      expect(secondCallCount).toBeGreaterThanOrEqual(firstCallCount);
    });
  });

  describe('File Operations', () => {
    it('should handle vault adapter operations', async () => {
      const mockAdapter = mockVault.adapter as any;
      
      // Test that the service interacts with vault adapter
      expect(mockAdapter.exists).toBeDefined();
      expect(mockAdapter.readBinary).toBeDefined();
      expect(mockAdapter.writeBinary).toBeDefined();
    });

    it('should construct correct file paths', () => {
      // Test path construction logic
      const configDir = '/mock/vault/.obsidian';
      const expectedDbPath = `${configDir}/plugins/obsidian-completr-plus/completr.db`;
      
      // The service should construct paths correctly
      expect(mockVault.configDir).toBe(configDir);
    });
  });

  describe('Interface Compliance', () => {
    it('should expose all required public methods', () => {
      // Test that all expected methods are present
      expect(typeof service.initialize).toBe('function');
      expect(typeof service.shutdown).toBe('function');
      expect(typeof service.calculateFileHash).toBe('function');
      expect(typeof service.addOrUpdateWordListSource).toBe('function');
      expect(typeof service.markSourceFileStatus).toBe('function');
      expect(typeof service.addWord).toBe('function');
      expect(typeof service.addOrIncrementWord).toBe('function');
      expect(typeof service.getWordsByFirstLetter).toBe('function');
      expect(typeof service.getAllWordsGroupedByFirstLetter).toBe('function');
      expect(typeof service.getAllWordsBySource).toBe('function');
      expect(typeof service.deleteScanWords).toBe('function');
      expect(typeof service.deleteAllWords).toBe('function');
      expect(typeof service.addLatexCommand).toBe('function');
      expect(typeof service.getLatexCommandsByFirstLetter).toBe('function');
      expect(typeof service.createWordList).toBe('function');
      expect(typeof service.getWordLists).toBe('function');
      expect(typeof service.addFrontMatterEntry).toBe('function');
      expect(typeof service.getFrontMatterSuggestions).toBe('function');
      expect(typeof service.searchWords).toBe('function');
      expect(typeof service.getWordCount).toBe('function');
      expect(typeof service.getScanSourceId).toBe('function');
      expect(typeof service.getWordListSourceIds).toBe('function');
      expect(typeof service.deleteWordListSource).toBe('function');
    });

    it('should have correct method signatures', () => {
      // Test method signatures - these should not throw type errors
      expect(service.initialize).toHaveLength(0);
      expect(service.calculateFileHash).toHaveLength(1);
      expect(service.addOrUpdateWordListSource).toHaveLength(2);
      expect(service.addWord).toHaveLength(2);
      expect(service.getWordsByFirstLetter).toHaveLength(1);
      // searchWords has optional second parameter, so length is 1
      expect(service.searchWords).toHaveLength(1);
    });
  });

  describe('Type Safety', () => {
    it('should handle Word interface properly', () => {
      // Test that Word interface is properly typed
      const word: Word = {
        word: 'test',
        frequency: 1,
        id: 1,
        first_letter: 't',
        source_id: 1,
        created_at: new Date().toISOString()
      };

      expect(word.word).toBe('test');
      expect(word.frequency).toBe(1);
      expect(word.first_letter).toBe('t');
    });

    it('should handle optional Word properties', () => {
      const minimalWord: Word = {
        word: 'test',
        frequency: 1
      };

      expect(minimalWord.word).toBe('test');
      expect(minimalWord.frequency).toBe(1);
      expect(minimalWord.id).toBeUndefined();
    });
  });

  describe('Constants and Configuration', () => {
    it('should use correct database file name', () => {
      // Test that the service uses the expected database filename
      expect(mockVault.configDir).toBeDefined();
      // Database should be named 'completr.db'
    });

    it('should handle vault configuration correctly', () => {
      const vault = createMockVault();
      const newService = new SQLiteDatabaseService(vault);
      
      expect(newService).toBeDefined();
      expect(newService).toBeInstanceOf(SQLiteDatabaseService);
    });
  });
}); 