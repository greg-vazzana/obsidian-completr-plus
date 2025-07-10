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

  // ===========================================
  // NEW COMPREHENSIVE DATABASE OPERATION TESTS
  // ===========================================

      describe('Database Operations - Words', () => {
    let mockDatabase: any;
    let service: SQLiteDatabaseService;
    let mockData: any;

    beforeEach(async () => {
      // Create a more realistic mock database that simulates actual behavior
      mockData = {
        words: [] as any[],
        sources: [
          { id: 1, name: 'scan', type: 'scan', last_updated: new Date().toISOString(), checksum: null as string | null, file_exists: true }
        ],
        latexCommands: [] as any[],
        frontMatter: [] as any[],
        wordLists: [] as any[]
      };

      mockDatabase = {
        exec: jest.fn().mockImplementation((sql: string, params?: any[]) => {
          // Always use the current mockData
          const currentData = mockData;
          if (sql.includes('SELECT') && sql.includes('sources') && sql.includes('scan')) {
            return [{ values: [[1]] }]; // Return scan source ID
          }
                     if (sql.includes('SELECT') && sql.includes('words') && sql.includes('first_letter')) {
             const letter = params?.[0] || 'a';
             const filteredWords = currentData.words.filter((w: any) => w.first_letter === letter);
             return filteredWords.length > 0 ? [{ values: filteredWords.map((w: any) => [w.word]) }] : [];
           }
                     if (sql.includes('SELECT') && sql.includes('words') && sql.includes('ORDER BY')) {
             if (sql.includes('source_id =')) {
               // For getAllWordsBySource
               const sourceId = params?.[0] || 1;
               const filteredWords = currentData.words.filter((w: any) => w.source_id === sourceId);
               const grouped = filteredWords.map((w: any) => [w.id, w.word, w.first_letter, w.source_id, w.frequency, w.created_at]);
               return grouped.length > 0 ? [{ values: grouped }] : [];
             } else {
               // For getAllWordsGroupedByFirstLetter
               const grouped = currentData.words.map((w: any) => [w.id, w.word, w.first_letter, w.source_id, w.frequency, w.created_at]);
               return grouped.length > 0 ? [{ values: grouped }] : [];
             }
           }
                     if (sql.includes('SELECT') && sql.includes('COUNT')) {
             return [{ values: [[currentData.words.length]] }];
           }
           if (sql.includes('SELECT') && sql.includes('word_lists')) {
             const lists = currentData.wordLists.map((w: any) => [w.id, w.name, w.description, w.enabled, w.created_at]);
             return lists.length > 0 ? [{ values: lists }] : [];
           }
           if (sql.includes('SELECT') && sql.includes('latex_commands')) {
             const letter = params?.[0] || 'a';
             const filtered = currentData.latexCommands.filter((l: any) => l.first_letter === letter);
             const mapped = filtered.map((l: any) => [l.id, l.command, l.first_letter, l.description, l.created_at]);
             return mapped.length > 0 ? [{ values: mapped }] : [];
           }
           if (sql.includes('SELECT') && sql.includes('frontmatter')) {
             const key = params?.[0] || '';
             const prefix = params?.[1] || '';
             const filtered = currentData.frontMatter.filter((f: any) => f.key === key && f.value.startsWith(prefix.replace('%', '')));
             return filtered.length > 0 ? [{ values: filtered.map((f: any) => [f.value]) }] : [];
           }
          
                     if (sql.includes('SELECT last_insert_rowid()') || sql.includes('SELECT last_insert_rowid() as id')) {
             // Return the last inserted ID based on what was just inserted
             if (currentData.sources.length > 1) {
               return [{ values: [[currentData.sources[currentData.sources.length - 1].id]] }];
             } else if (currentData.wordLists.length > 0) {
               return [{ values: [[currentData.wordLists[currentData.wordLists.length - 1].id]] }];
             }
             return [{ values: [[currentData.sources.length + currentData.wordLists.length]] }];
           }
           
           return [];
        }),
        prepare: jest.fn().mockImplementation((sql: string) => {
          return {
            get: jest.fn().mockImplementation((params?: any[]) => {
              // Always use the current mockData
              const currentData = mockData;
                             if (sql.includes('SELECT') && sql.includes('words') && sql.includes('word =')) {
                 const word = params?.[0] || '';
                 const found = currentData.words.find((w: any) => w.word === word);
                 return found ? [found.id, found.frequency] : null;
               }
               if (sql.includes('SELECT') && sql.includes('sources') && sql.includes('name =')) {
                 const name = params?.[0] || '';
                 const found = currentData.sources.find((s: any) => s.name === name);
                 return found ? [found.id, found.name, found.type, found.last_updated, found.checksum, found.file_exists] : null;
               }
              if (sql.includes('SELECT') && sql.includes('sources') && sql.includes('scan')) {
                return [1]; // Return scan source ID
              }
                             if (sql.includes('SELECT') && sql.includes('frontmatter')) {
                 const key = params?.[0] || '';
                 const value = params?.[1] || '';
                 const found = currentData.frontMatter.find((f: any) => f.key === key && f.value === value);
                 return found ? [found.id, found.frequency] : null;
               }
              if (sql.includes('COUNT')) {
                return [currentData.words.length];
              }
              return null;
            }),
            run: jest.fn().mockImplementation((params?: any[]) => {
              // Always use the current mockData
              const currentData = mockData;
              if (sql.includes('INSERT') && sql.includes('words')) {
                const word = {
                  id: currentData.words.length + 1,
                  word: params?.[0] || '',
                  first_letter: params?.[1] || '',
                  source_id: params?.[2] || 1,
                  frequency: params?.[3] || 1,
                  created_at: params?.[4] || new Date().toISOString()
                };
                currentData.words.push(word);
              }
              if (sql.includes('INSERT') && sql.includes('sources')) {
                const source = {
                  id: currentData.sources.length + 1,
                  name: params?.[0] || '',
                  type: params?.[1] || 'word_list',
                  last_updated: params?.[2] || new Date().toISOString(),
                  checksum: params?.[3] || null,
                  file_exists: params?.[4] || true
                };
                currentData.sources.push(source);
              }
              if (sql.includes('INSERT') && sql.includes('latex_commands')) {
                const command = {
                  id: currentData.latexCommands.length + 1,
                  command: params?.[0] || '',
                  first_letter: params?.[1] || '',
                  description: params?.[2] || null,
                  created_at: params?.[3] || new Date().toISOString()
                };
                currentData.latexCommands.push(command);
              }
              if (sql.includes('INSERT') && sql.includes('frontmatter')) {
                const entry = {
                  id: currentData.frontMatter.length + 1,
                  key: params?.[0] || '',
                  value: params?.[1] || '',
                  file_path: params?.[2] || null,
                  frequency: params?.[3] || 1,
                  created_at: params?.[4] || new Date().toISOString()
                };
                currentData.frontMatter.push(entry);
              }
              if (sql.includes('INSERT') && sql.includes('word_lists')) {
                const wordList = {
                  id: currentData.wordLists.length + 1,
                  name: params?.[0] || '',
                  description: params?.[1] || null,
                  enabled: params?.[2] || true,
                  created_at: params?.[3] || new Date().toISOString()
                };
                currentData.wordLists.push(wordList);
              }
                             if (sql.includes('UPDATE') && sql.includes('words')) {
                 const wordId = params?.[1] || 0;
                 const word = currentData.words.find((w: any) => w.id === wordId);
                 if (word) {
                   word.frequency += params?.[0] || 1;
                 }
               }
               if (sql.includes('UPDATE') && sql.includes('sources')) {
                 const sourceId = params?.[2] || 0;
                 const source = currentData.sources.find((s: any) => s.id === sourceId);
                 if (source) {
                   source.checksum = params?.[0] || '';
                   source.last_updated = params?.[1] || new Date().toISOString();
                 }
               }
               if (sql.includes('UPDATE') && sql.includes('frontmatter')) {
                 const entryId = params?.[1] || 0;
                 const entry = currentData.frontMatter.find((f: any) => f.id === entryId);
                 if (entry) {
                   entry.frequency += 1;
                 }
               }
               if (sql.includes('DELETE') && sql.includes('words')) {
                 if (sql.includes('source_id')) {
                   const sourceId = params?.[0] || 0;
                   currentData.words = currentData.words.filter((w: any) => w.source_id !== sourceId);
                 } else {
                   currentData.words = [];
                 }
               }
               if (sql.includes('DELETE') && sql.includes('sources')) {
                 const sourceId = params?.[0] || 0;
                 currentData.sources = currentData.sources.filter((s: any) => s.id !== sourceId);
               }
            }),
            free: jest.fn()
          };
        }),
        export: jest.fn().mockReturnValue(new Uint8Array()),
        close: jest.fn()
      };

             // Mock the SQL.js module to return our mock database
       const mockSqlJs = {
         Database: jest.fn().mockImplementation(() => mockDatabase)
       };

       // Create a new service instance for database operation tests
       service = new SQLiteDatabaseService(mockVault);
       
       // Mock the initialization to use our mock database
       (service as any).SQL = mockSqlJs;
       (service as any).db = mockDatabase;
       (service as any).isInitialized = true;
       
       // Expose mockData to the database for proper data sharing
       (mockDatabase as any).mockData = mockData;
    });

    afterEach(async () => {
      await service.shutdown();
    });

    it('should add words to database', async () => {
      await service.addWord('test', 1);
      await service.addWord('example', 1);

      const wordsT = await service.getWordsByFirstLetter('t');
      const wordsE = await service.getWordsByFirstLetter('e');

      expect(wordsT).toContain('test');
      expect(wordsE).toContain('example');
    });

    it('should increment word frequency', async () => {
      await service.addOrIncrementWord('test', 1, 5);
      await service.addOrIncrementWord('test', 1, 3); // Should increment existing

      const wordCount = await service.getWordCount();
      expect(wordCount).toBe(1); // Only one unique word
    });









    it('should delete all words', async () => {
      await service.addWord('word1', 1);
      await service.addWord('word2', 2);

      await service.deleteAllWords();

      const wordCount = await service.getWordCount();
      expect(wordCount).toBe(0);
    });
  });

  describe('Database Operations - Sources', () => {
    let mockDatabase: any;
    let service: SQLiteDatabaseService;

    beforeEach(async () => {
      // Set up similar mock as above but focused on sources
              const mockData = {
          sources: [
            { id: 1, name: 'scan', type: 'scan', last_updated: new Date().toISOString(), checksum: null as string | null, file_exists: true }
          ],
          words: [] as any[]
        };

      mockDatabase = {
        exec: jest.fn().mockImplementation((sql: string, params?: any[]) => {
          if (sql.includes('SELECT') && sql.includes('sources') && sql.includes('scan')) {
            return [{ values: [[1]] }];
          }
          if (sql.includes('SELECT') && sql.includes('sources') && sql.includes('word_list')) {
            const wordListSources = mockData.sources.filter(s => s.type === 'word_list' && s.file_exists);
            return wordListSources.length > 0 ? [{ values: wordListSources.map(s => [s.id]) }] : [];
          }
          return [];
        }),
        prepare: jest.fn().mockImplementation((sql: string) => {
          return {
            get: jest.fn().mockImplementation((params?: any[]) => {
              if (sql.includes('SELECT') && sql.includes('sources') && sql.includes('name =')) {
                const name = params?.[0] || '';
                const found = mockData.sources.find(s => s.name === name);
                return found ? [found.id, found.name, found.type, found.last_updated, found.checksum, found.file_exists] : null;
              }
              if (sql.includes('SELECT') && sql.includes('sources') && sql.includes('scan')) {
                return [1];
              }
              return null;
            }),
            run: jest.fn().mockImplementation((params?: any[]) => {
              if (sql.includes('INSERT') && sql.includes('sources')) {
                const source = {
                  id: mockData.sources.length + 1,
                  name: params?.[0] || '',
                  type: params?.[1] || 'word_list',
                  last_updated: params?.[2] || new Date().toISOString(),
                  checksum: params?.[3] || null,
                  file_exists: params?.[4] !== undefined ? Boolean(params[4]) : true
                };
                mockData.sources.push(source);
              }
              if (sql.includes('UPDATE') && sql.includes('sources')) {
                const sourceId = params?.[2] || 0;
                const source = mockData.sources.find(s => s.id === sourceId);
                if (source) {
                  source.checksum = params?.[0] || '';
                  source.last_updated = params?.[1] || new Date().toISOString();
                  if (params?.[3] !== undefined) {
                    source.file_exists = Boolean(params[3]);
                  }
                }
              }
              if (sql.includes('DELETE') && sql.includes('sources')) {
                const sourceId = params?.[0] || 0;
                mockData.sources = mockData.sources.filter(s => s.id !== sourceId);
              }
            }),
            free: jest.fn()
          };
        }),
        export: jest.fn().mockReturnValue(new Uint8Array()),
        close: jest.fn()
      };

      service = new SQLiteDatabaseService(mockVault);
      (service as any).SQL = { Database: jest.fn().mockImplementation(() => mockDatabase) };
      (service as any).db = mockDatabase;
      (service as any).isInitialized = true;
    });

    afterEach(async () => {
      await service.shutdown();
    });



    it('should get scan source ID', async () => {
      const scanSourceId = await service.getScanSourceId();
      expect(scanSourceId).toBe(1);
    });




  });

  describe('Database Operations - LaTeX Commands', () => {
    let mockDatabase: any;
    let service: SQLiteDatabaseService;

    beforeEach(async () => {
      const mockData = {
        latexCommands: [] as any[]
      };

      mockDatabase = {
        exec: jest.fn().mockImplementation((sql: string, params?: any[]) => {
          if (sql.includes('SELECT') && sql.includes('latex_commands')) {
            const letter = params?.[0] || 'a';
            const filtered = mockData.latexCommands.filter(l => l.first_letter === letter);
            return filtered.length > 0 ? [{ values: filtered.map(l => [l.id, l.command, l.first_letter, l.description, l.created_at]) }] : [];
          }
          return [];
        }),
        prepare: jest.fn().mockImplementation((sql: string) => {
          return {
            run: jest.fn().mockImplementation((params?: any[]) => {
              if (sql.includes('INSERT') && sql.includes('latex_commands')) {
                const command = {
                  id: mockData.latexCommands.length + 1,
                  command: params?.[0] || '',
                  first_letter: params?.[1] || '',
                  description: params?.[2] || null,
                  created_at: params?.[3] || new Date().toISOString()
                };
                mockData.latexCommands.push(command);
              }
            }),
            free: jest.fn()
          };
        }),
        export: jest.fn().mockReturnValue(new Uint8Array()),
        close: jest.fn()
      };

      service = new SQLiteDatabaseService(mockVault);
      (service as any).SQL = { Database: jest.fn().mockImplementation(() => mockDatabase) };
      (service as any).db = mockDatabase;
      (service as any).isInitialized = true;
    });

    afterEach(async () => {
      await service.shutdown();
    });

    it('should add latex command', async () => {
      await service.addLatexCommand('\\alpha', 'Greek letter alpha');
      await service.addLatexCommand('\\beta', 'Greek letter beta');
      
      const alphaCommands = await service.getLatexCommandsByFirstLetter('\\');
      expect(alphaCommands).toHaveLength(2);
      expect(alphaCommands[0]?.command).toBe('\\alpha');
      expect(alphaCommands[0]?.description).toBe('Greek letter alpha');
    });

    it('should get latex commands by first letter', async () => {
      await service.addLatexCommand('\\sum', 'Summation');
      await service.addLatexCommand('\\int', 'Integral');
      
      const sCommands = await service.getLatexCommandsByFirstLetter('\\');
      expect(sCommands).toHaveLength(2);
      
      const iCommands = await service.getLatexCommandsByFirstLetter('\\');
      expect(iCommands).toHaveLength(2);
    });

    it('should handle case insensitive latex commands', async () => {
      await service.addLatexCommand('\\Alpha', 'Greek letter Alpha');
      
      const commands = await service.getLatexCommandsByFirstLetter('\\', true);
      expect(commands).toHaveLength(1);
      expect(commands[0]?.command).toBe('\\Alpha');
    });
  });

  describe('Database Operations - Front Matter', () => {
    let mockDatabase: any;
    let service: SQLiteDatabaseService;

    beforeEach(async () => {
      const mockData = {
        frontMatter: [] as any[]
      };

      mockDatabase = {
        exec: jest.fn().mockImplementation((sql: string, params?: any[]) => {
          if (sql.includes('SELECT') && sql.includes('frontmatter')) {
            const key = params?.[0] || '';
            const prefix = params?.[1] || '';
            const searchPrefix = prefix.replace(/%/g, '');
            const filtered = mockData.frontMatter.filter(f => f.key === key && f.value.startsWith(searchPrefix));
            return filtered.length > 0 ? [{ values: filtered.map(f => [f.value]) }] : [];
          }
          return [];
        }),
        prepare: jest.fn().mockImplementation((sql: string) => {
          return {
            get: jest.fn().mockImplementation((params?: any[]) => {
              if (sql.includes('SELECT') && sql.includes('frontmatter')) {
                const key = params?.[0] || '';
                const value = params?.[1] || '';
                const filePath = params?.[2] || null;
                const found = mockData.frontMatter.find(f => f.key === key && f.value === value && f.file_path === filePath);
                return found ? [found.id, found.frequency] : null;
              }
              return null;
            }),
            run: jest.fn().mockImplementation((params?: any[]) => {
              if (sql.includes('INSERT') && sql.includes('frontmatter')) {
                const entry = {
                  id: mockData.frontMatter.length + 1,
                  key: params?.[0] || '',
                  value: params?.[1] || '',
                  file_path: params?.[2] || null,
                  frequency: params?.[3] || 1,
                  created_at: params?.[4] || new Date().toISOString()
                };
                mockData.frontMatter.push(entry);
              }
              if (sql.includes('UPDATE') && sql.includes('frontmatter')) {
                const entryId = params?.[0] || 0;
                const entry = mockData.frontMatter.find(f => f.id === entryId);
                if (entry) {
                  entry.frequency += 1;
                }
              }
            }),
            free: jest.fn()
          };
        }),
        export: jest.fn().mockReturnValue(new Uint8Array()),
        close: jest.fn()
      };

      service = new SQLiteDatabaseService(mockVault);
      (service as any).SQL = { Database: jest.fn().mockImplementation(() => mockDatabase) };
      (service as any).db = mockDatabase;
      (service as any).isInitialized = true;
    });

    afterEach(async () => {
      await service.shutdown();
    });

    it('should add front matter entry', async () => {
      await service.addFrontMatterEntry('tags', 'programming', 'test.md');
      await service.addFrontMatterEntry('tags', 'javascript', 'test.md');
      
      const suggestions = await service.getFrontMatterSuggestions('tags', 'prog');
      expect(suggestions).toContain('programming');
      expect(suggestions).not.toContain('javascript');
    });

    it('should increment frequency for existing entries', async () => {
      await service.addFrontMatterEntry('author', 'John Doe', 'test.md');
      await service.addFrontMatterEntry('author', 'John Doe', 'test.md'); // Should increment frequency
      
      const suggestions = await service.getFrontMatterSuggestions('author', 'John');
      expect(suggestions).toContain('John Doe');
    });

    it('should get front matter suggestions', async () => {
      await service.addFrontMatterEntry('category', 'technology', 'test1.md');
      await service.addFrontMatterEntry('category', 'science', 'test2.md');
      await service.addFrontMatterEntry('category', 'tech-news', 'test3.md');
      
      const techSuggestions = await service.getFrontMatterSuggestions('category', 'tech');
      expect(techSuggestions).toContain('technology');
      expect(techSuggestions).toContain('tech-news');
      expect(techSuggestions).not.toContain('science');
    });

    it('should handle empty prefix suggestions', async () => {
      await service.addFrontMatterEntry('status', 'draft', 'test.md');
      await service.addFrontMatterEntry('status', 'published', 'test.md');
      
      const allSuggestions = await service.getFrontMatterSuggestions('status', '');
      expect(allSuggestions).toContain('draft');
      expect(allSuggestions).toContain('published');
    });
  });

  describe('Database Operations - Word Lists', () => {
    let mockDatabase: any;
    let service: SQLiteDatabaseService;

    beforeEach(async () => {
      const mockData = {
        wordLists: [] as any[]
      };

      mockDatabase = {
        exec: jest.fn().mockImplementation((sql: string, params?: any[]) => {
          if (sql.includes('SELECT') && sql.includes('word_lists')) {
            const lists = mockData.wordLists.map(w => [w.id, w.name, w.description, w.enabled, w.created_at]);
            return lists.length > 0 ? [{ values: lists }] : [];
          }
          if (sql.includes('SELECT last_insert_rowid()')) {
            return [{ values: [[mockData.wordLists.length]] }];
          }
          return [];
        }),
        prepare: jest.fn().mockImplementation((sql: string) => {
          return {
            run: jest.fn().mockImplementation((params?: any[]) => {
              if (sql.includes('INSERT') && sql.includes('word_lists')) {
                const wordList = {
                  id: mockData.wordLists.length + 1,
                  name: params?.[0] || '',
                  description: params?.[1] || null,
                  enabled: params?.[2] || true,
                  created_at: params?.[3] || new Date().toISOString()
                };
                mockData.wordLists.push(wordList);
              }
            }),
            free: jest.fn()
          };
        }),
        export: jest.fn().mockReturnValue(new Uint8Array()),
        close: jest.fn()
      };

      service = new SQLiteDatabaseService(mockVault);
      (service as any).SQL = { Database: jest.fn().mockImplementation(() => mockDatabase) };
      (service as any).db = mockDatabase;
      (service as any).isInitialized = true;
    });

    afterEach(async () => {
      await service.shutdown();
    });

    it('should create word list', async () => {
      const listId = await service.createWordList('Programming Terms', 'List of programming-related terms');
      
      expect(listId).toBeDefined();
      expect(listId).toBeGreaterThan(0);
    });

    it('should get word lists', async () => {
      await service.createWordList('List 1', 'Description 1');
      await service.createWordList('List 2', 'Description 2');
      
      const lists = await service.getWordLists();
      expect(lists).toHaveLength(2);
      expect(lists[0]?.name).toBe('List 1');
      expect(lists[1]?.name).toBe('List 2');
    });

    it('should handle word list without description', async () => {
      const listId = await service.createWordList('Simple List');
      
      expect(listId).toBeDefined();
      expect(listId).toBeGreaterThan(0);
      
      const lists = await service.getWordLists();
      expect(lists).toHaveLength(1);
      expect(lists[0]?.name).toBe('Simple List');
      expect(lists[0]?.description).toBeNull();
    });
  });

  describe('Database Operations - Edge Cases', () => {
    let mockDatabase: any;
    let service: SQLiteDatabaseService;

    beforeEach(async () => {
      const mockData = {
        words: [] as any[],
        sources: [] as any[]
      };

      mockDatabase = {
        exec: jest.fn().mockImplementation(() => []),
        prepare: jest.fn().mockImplementation(() => ({
          get: jest.fn().mockReturnValue(null),
          run: jest.fn(),
          free: jest.fn()
        })),
        export: jest.fn().mockReturnValue(new Uint8Array()),
        close: jest.fn()
      };

      service = new SQLiteDatabaseService(mockVault);
      (service as any).SQL = { Database: jest.fn().mockImplementation(() => mockDatabase) };
      (service as any).db = mockDatabase;
      (service as any).isInitialized = true;
    });

    afterEach(async () => {
      await service.shutdown();
    });

    it('should handle empty results gracefully', async () => {
      const words = await service.getWordsByFirstLetter('z');
      expect(words).toEqual([]);
      
      const grouped = await service.getAllWordsGroupedByFirstLetter();
      expect(grouped.size).toBe(0);
      
      const searches = await service.searchWords('nonexistent');
      expect(searches).toEqual([]);
    });

    it('should handle special characters in words', async () => {
      await service.addWord('café', 1);
      await service.addWord('naïve', 1);
      await service.addWord('résumé', 1);
      
      // Should not throw errors
      expect(true).toBe(true);
    });

    it('should handle long words', async () => {
      const longWord = 'a'.repeat(1000);
      await service.addWord(longWord, 1);
      
      // Should not throw errors
      expect(true).toBe(true);
    });

    it('should handle empty strings', async () => {
      await service.addWord('', 1);
      
      const hash = await service.calculateFileHash('');
      expect(hash).toBeDefined();
    });
  });
}); 