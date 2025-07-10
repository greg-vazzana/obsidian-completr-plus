import { TFile, Vault } from "obsidian";
import { Scanner } from "../../src/provider/scanner_provider";
import { SQLiteDatabaseService, Word } from "../../src/db/sqlite_database_service";
import { CompletrSettings, DEFAULT_SETTINGS } from "../../src/settings";
import { SuggestionIgnorelist } from "../../src/provider/ignorelist";
import { WordPatterns } from "../../src/word_patterns";
import { SuggestionContext } from "../../src/provider/provider";

// Mock dependencies
jest.mock("../../src/db/sqlite_database_service");
jest.mock("../../src/provider/ignorelist");
jest.mock("../../src/word_patterns");

describe("ScannerSuggestionProvider", () => {
    let mockVault: jest.Mocked<Vault>;
    let mockDatabase: jest.Mocked<SQLiteDatabaseService>;
    let mockFile: jest.Mocked<TFile>;
    let settings: CompletrSettings;

    beforeEach(() => {
        // Clear all mocks
        jest.clearAllMocks();
        
        // Reset Scanner's internal state
        Scanner.wordMap.clear();
        (Scanner as any).db = null;
        (Scanner as any).scanSourceId = null;
        (Scanner as any).frequencyUpdates = new Map();

        // Mock vault
        mockVault = {
            adapter: {
                read: jest.fn(),
                write: jest.fn(),
                exists: jest.fn(),
                mkdir: jest.fn(),
                remove: jest.fn(),
                list: jest.fn(),
                readBinary: jest.fn(),
            },
            cachedRead: jest.fn(),
        } as any;

        // Mock database
        mockDatabase = {
            initialize: jest.fn(),
            initializeSources: jest.fn(),
            getScanSourceId: jest.fn(),
            getAllWordsBySource: jest.fn(),
            deleteScanWords: jest.fn(),
            addOrIncrementWord: jest.fn(),
            deleteWordListSource: jest.fn(),
            shutdown: jest.fn(),
        } as any;

        // Mock TFile
        mockFile = {
            vault: mockVault,
            name: "test.md",
            path: "test.md",
            basename: "test",
            extension: "md",
        } as any;

        // Default settings
        settings = {
            ...DEFAULT_SETTINGS,
            scanEnabled: true,
            minWordLength: 3,
        };

        // Setup mocks
        (SQLiteDatabaseService as jest.Mock).mockImplementation(() => mockDatabase);
        (SuggestionIgnorelist.hasText as jest.Mock).mockReturnValue(false);
        (WordPatterns.SCANNER_PATTERN as any) = /\b\w+\b/g;
    });

    describe("Constructor and Initialization", () => {
        test("should initialize with empty wordMap", () => {
            expect(Scanner.wordMap.size).toBe(0);
            expect((Scanner as any).db).toBeNull();
            expect((Scanner as any).scanSourceId).toBeNull();
        });

        test("should set vault and create database instance", () => {
            Scanner.setVault(mockVault);
            expect((Scanner as any).db).toBe(mockDatabase);
        });

        test("should initialize successfully with database", async () => {
            Scanner.setVault(mockVault);
            mockDatabase.initialize.mockResolvedValue(undefined);
            mockDatabase.initializeSources.mockResolvedValue(undefined);
            mockDatabase.getScanSourceId.mockResolvedValue(1);
            mockDatabase.getAllWordsBySource.mockResolvedValue(new Map());

            await Scanner.initialize();

            expect(mockDatabase.initialize).toHaveBeenCalled();
            expect(mockDatabase.initializeSources).toHaveBeenCalled();
        });

        test("should handle database initialization failure gracefully", async () => {
            Scanner.setVault(mockVault);
            mockDatabase.initialize.mockRejectedValue(new Error("Database error"));
            
            const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

            await Scanner.initialize();

            expect(consoleSpy).toHaveBeenCalledWith('Scanner: Database initialization failed, using in-memory only mode:', expect.any(Error));
            expect((Scanner as any).db).toBeNull();
            
            consoleSpy.mockRestore();
        });

        test("should warn when database not set", async () => {
            const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

            await Scanner.initialize();

            expect(consoleSpy).toHaveBeenCalledWith('Scanner: Database not set, using in-memory only mode');
            consoleSpy.mockRestore();
        });
    });

    describe("Provider Configuration", () => {
        test("should be enabled when scanEnabled is true", () => {
            expect(Scanner.isEnabled(settings)).toBe(true);
        });

        test("should be disabled when scanEnabled is false", () => {
            const disabledSettings = { ...settings, scanEnabled: false };
            expect(Scanner.isEnabled(disabledSettings)).toBe(false);
        });
    });

    describe("Database Connection", () => {
        test("should connect database successfully", async () => {
            mockDatabase.initializeSources.mockResolvedValue(undefined);
            mockDatabase.getScanSourceId.mockResolvedValue(1);
            mockDatabase.getAllWordsBySource.mockResolvedValue(new Map());

            await Scanner.connectDatabase(mockDatabase);

            expect((Scanner as any).db).toBe(mockDatabase);
            expect(mockDatabase.initializeSources).toHaveBeenCalled();
        });

        test("should handle database connection failure", async () => {
            mockDatabase.initializeSources.mockRejectedValue(new Error("Connection failed"));
            
            const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

            await Scanner.connectDatabase(mockDatabase);

            expect(consoleSpy).toHaveBeenCalledWith('Scanner: Failed to connect database:', expect.any(Error));
            expect((Scanner as any).db).toBeNull();
            
            consoleSpy.mockRestore();
        });
    });

    describe("File Scanning", () => {
        beforeEach(() => {
            Scanner.setVault(mockVault);
        });

        test("should scan single file successfully", async () => {
            const fileContent = "This is a test file with some words.";
            mockVault.cachedRead.mockResolvedValue(fileContent);
            mockDatabase.getScanSourceId.mockResolvedValue(1);
            
            // Mock WordPatterns.SCANNER_PATTERN to return matches
            const matches = ["This", "test", "file", "with", "some", "words"];
            (WordPatterns.SCANNER_PATTERN as any) = {
                [Symbol.matchAll]: function*(str: string) {
                    for (const match of matches) {
                        if (str.includes(match)) {
                            yield [match];
                        }
                    }
                }
            };

            await Scanner.scanFile(settings, mockFile);

            expect(mockVault.cachedRead).toHaveBeenCalledWith(mockFile);
            expect(Scanner.wordMap.size).toBeGreaterThan(0);
        });

        test("should skip words shorter than minimum length", async () => {
            const fileContent = "a is to be or not to be";
            mockVault.cachedRead.mockResolvedValue(fileContent);
            settings.minWordLength = 3;
            
            const matches = ["a", "is", "to", "be", "or", "not", "to", "be"];
            (WordPatterns.SCANNER_PATTERN as any) = {
                [Symbol.matchAll]: function*(str: string) {
                    for (const match of matches) {
                        if (str.includes(match)) {
                            yield [match];
                        }
                    }
                }
            };

            await Scanner.scanFile(settings, mockFile);

            // Should not contain single-letter words
            expect(Scanner.wordMap.get("a")).toBeUndefined();
            expect(Scanner.wordMap.get("i")).toBeUndefined();
        });

        test("should scan multiple files", async () => {
            const files = [
                { ...mockFile, name: "file1.md", path: "file1.md" },
                { ...mockFile, name: "file2.md", path: "file2.md" },
            ] as TFile[];

            mockVault.cachedRead.mockResolvedValue("test content");
            mockDatabase.deleteScanWords.mockResolvedValue(undefined);
            
            const matches = ["test", "content"];
            (WordPatterns.SCANNER_PATTERN as any) = {
                [Symbol.matchAll]: function*(str: string) {
                    for (const match of matches) {
                        if (str.includes(match)) {
                            yield [match];
                        }
                    }
                }
            };

            await Scanner.scanFiles(settings, files);

            expect(mockVault.cachedRead).toHaveBeenCalledTimes(2);
            expect(mockDatabase.deleteScanWords).toHaveBeenCalled();
        });

        test("should handle file reading errors gracefully", async () => {
            mockVault.cachedRead.mockRejectedValue(new Error("File read error"));

            await expect(Scanner.scanFile(settings, mockFile)).rejects.toThrow("File read error");
        });
    });

    describe("Word Management", () => {
        beforeEach(() => {
            Scanner.setVault(mockVault);
        });

        test("should add new word to wordMap", async () => {
            const word = "testword";
            mockDatabase.getScanSourceId.mockResolvedValue(1);

            await (Scanner as any).addOrIncrementWord(word);

            const firstLetter = word.charAt(0);
            expect(Scanner.wordMap.get(firstLetter)).toBeDefined();
            expect(Scanner.wordMap.get(firstLetter)!.get(word)).toEqual({
                word: word,
                frequency: 1
            });
        });

        test("should increment frequency for existing word", async () => {
            const word = "testword";
            const firstLetter = word.charAt(0);
            
            // Add word first time
            Scanner.wordMap.set(firstLetter, new Map([[word, { word, frequency: 1 }]]));
            
            await (Scanner as any).addOrIncrementWord(word);

            expect(Scanner.wordMap.get(firstLetter)!.get(word)!.frequency).toBe(2);
        });

        test("should skip ignored words", async () => {
            const word = "ignored";
            (SuggestionIgnorelist.hasText as jest.Mock).mockReturnValue(true);

            await (Scanner as any).addOrIncrementWord(word);

            expect(Scanner.wordMap.size).toBe(0);
        });

        test("should skip empty words", async () => {
            await (Scanner as any).addOrIncrementWord("");
            await (Scanner as any).addOrIncrementWord(null);
            await (Scanner as any).addOrIncrementWord(undefined);

            expect(Scanner.wordMap.size).toBe(0);
        });

        test("should track frequency updates for database", async () => {
            const word = "testword";
            mockDatabase.getScanSourceId.mockResolvedValue(1);

            await (Scanner as any).addOrIncrementWord(word);

            const frequencyUpdates = (Scanner as any).frequencyUpdates;
            expect(frequencyUpdates.get(word)).toBe(1);
        });

        test("should increment word frequency for live tracking", () => {
            const word = "liveword";
            const firstLetter = word.charAt(0);

            Scanner.incrementWordFrequency(word);

            expect(Scanner.wordMap.get(firstLetter)).toBeDefined();
            expect(Scanner.wordMap.get(firstLetter)!.get(word)).toEqual({
                word: word,
                frequency: 1
            });
        });

        test("should increment existing word frequency for live tracking", () => {
            const word = "liveword";
            const firstLetter = word.charAt(0);
            
            // Add word first
            Scanner.wordMap.set(firstLetter, new Map([[word, { word, frequency: 1 }]]));
            
            Scanner.incrementWordFrequency(word);

            expect(Scanner.wordMap.get(firstLetter)!.get(word)!.frequency).toBe(2);
        });

        test("should skip ignored words in live tracking", () => {
            (SuggestionIgnorelist.hasText as jest.Mock).mockReturnValue(true);

            Scanner.incrementWordFrequency("ignored");

            expect(Scanner.wordMap.size).toBe(0);
        });
    });

    describe("Database Operations", () => {
        beforeEach(() => {
            Scanner.setVault(mockVault);
        });

        test("should load words from database", async () => {
            const scanSourceId = 1;
            const mockWords = new Map([
                ["t", [{ word: "test", frequency: 2 }, { word: "testing", frequency: 1 }]],
                ["h", [{ word: "hello", frequency: 3 }]]
            ]);

            mockDatabase.getScanSourceId.mockResolvedValue(scanSourceId);
            mockDatabase.getAllWordsBySource.mockResolvedValue(mockWords);

            await (Scanner as any).loadWordsFromDb();

            expect(Scanner.wordMap.size).toBe(2);
            expect(Scanner.wordMap.get("t")!.size).toBe(2);
            expect(Scanner.wordMap.get("h")!.size).toBe(1);
            expect(Scanner.wordMap.get("t")!.get("test")!.frequency).toBe(2);
        });

        test("should handle missing scan source", async () => {
            mockDatabase.getScanSourceId.mockResolvedValue(null);

            await (Scanner as any).loadWordsFromDb();

            expect(Scanner.wordMap.size).toBe(0);
        });

        test("should warn when database not available", async () => {
            (Scanner as any).db = null;
            const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

            await (Scanner as any).loadWordsFromDb();

            expect(consoleSpy).toHaveBeenCalledWith('Scanner: Database not available, cannot load words');
            consoleSpy.mockRestore();
        });

        test("should flush frequency updates to database", async () => {
            const word1 = "word1";
            const word2 = "word2";
            const scanSourceId = 1;
            
            (Scanner as any).scanSourceId = scanSourceId;
            (Scanner as any).frequencyUpdates.set(word1, 3);
            (Scanner as any).frequencyUpdates.set(word2, 1);

            await (Scanner as any).flushFrequencyUpdates();

            expect(mockDatabase.addOrIncrementWord).toHaveBeenCalledWith(word1, scanSourceId, 3);
            expect(mockDatabase.addOrIncrementWord).toHaveBeenCalledWith(word2, scanSourceId, 1);
            expect((Scanner as any).frequencyUpdates.size).toBe(0);
        });

        test("should handle database errors during flush", async () => {
            const word = "testword";
            const scanSourceId = 1;
            
            (Scanner as any).scanSourceId = scanSourceId;
            (Scanner as any).frequencyUpdates.set(word, 1);
            mockDatabase.addOrIncrementWord.mockRejectedValue(new Error("Database error"));
            
            const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

            await (Scanner as any).flushFrequencyUpdates();

            expect(consoleSpy).toHaveBeenCalledWith(`Failed to update frequency for word "${word}":`, expect.any(Error));
            consoleSpy.mockRestore();
        });

        test("should skip flush when no database", async () => {
            (Scanner as any).db = null;
            (Scanner as any).frequencyUpdates.set("test", 1);

            await (Scanner as any).flushFrequencyUpdates();

            expect(mockDatabase.addOrIncrementWord).not.toHaveBeenCalled();
        });

        test("should skip flush when no updates", async () => {
            await (Scanner as any).flushFrequencyUpdates();

            expect(mockDatabase.addOrIncrementWord).not.toHaveBeenCalled();
        });
    });

    describe("Word Deletion", () => {
        beforeEach(() => {
            Scanner.setVault(mockVault);
            // Add some test words
            Scanner.wordMap.set("t", new Map([["test", { word: "test", frequency: 1 }]]));
            Scanner.wordMap.set("h", new Map([["hello", { word: "hello", frequency: 1 }]]));
        });

        test("should delete all words", async () => {
            mockDatabase.deleteScanWords.mockResolvedValue(undefined);

            await Scanner.deleteAllWords();

            expect(Scanner.wordMap.size).toBe(0);
            expect(mockDatabase.deleteScanWords).toHaveBeenCalled();
        });

        test("should delete scan words", async () => {
            mockDatabase.deleteScanWords.mockResolvedValue(undefined);

            await Scanner.deleteScanWords();

            expect(Scanner.wordMap.size).toBe(0);
            expect(mockDatabase.deleteScanWords).toHaveBeenCalled();
        });

        test("should handle deletion without database", async () => {
            (Scanner as any).db = null;

            await Scanner.deleteAllWords();

            expect(Scanner.wordMap.size).toBe(0);
        });
    });

    describe("Data Persistence", () => {
        test("should save data (no-op for scanner)", async () => {
            // Scanner doesn't implement saveData as it uses database
            await Scanner.saveData(mockVault);
            // Should not throw
        });

        test("should load data and initialize", async () => {
            (Scanner as any).db = null; // Start with no database
            mockDatabase.initialize.mockResolvedValue(undefined);
            mockDatabase.initializeSources.mockResolvedValue(undefined);
            mockDatabase.getScanSourceId.mockResolvedValue(1);
            mockDatabase.getAllWordsBySource.mockResolvedValue(new Map());
            
            await Scanner.loadData(mockVault);

            // Should have created a new database instance and initialized it
            expect((Scanner as any).db).not.toBeNull();
            expect(mockDatabase.initialize).toHaveBeenCalled();
        });

        test("should handle loadData initialization failure", async () => {
            (Scanner as any).db = null; // Start with no database
            mockDatabase.initialize.mockRejectedValue(new Error("Init error"));
            
            const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

            await Scanner.loadData(mockVault);

            expect(consoleSpy).toHaveBeenCalledWith('Scanner: Database initialization failed, using in-memory only mode:', expect.any(Error));
            consoleSpy.mockRestore();
        });

        test("should not reinitialize if already initialized", async () => {
            Scanner.setVault(mockVault);
            (Scanner as any).db = mockDatabase;

            await Scanner.loadData(mockVault);

            expect(mockDatabase.initialize).not.toHaveBeenCalled();
        });
    });

    describe("Suggestion Generation", () => {
        beforeEach(() => {
            Scanner.setVault(mockVault);
            // Add test words
            Scanner.wordMap.set("t", new Map([
                ["test", { word: "test", frequency: 3 }],
                ["testing", { word: "testing", frequency: 1 }]
            ]));
            Scanner.wordMap.set("h", new Map([
                ["hello", { word: "hello", frequency: 2 }]
            ]));
        });

        test("should generate suggestions for query", () => {
            const context: SuggestionContext = {
                editor: {} as any,
                file: {} as any,
                start: { line: 0, ch: 0 },
                end: { line: 0, ch: 2 },
                query: "te",
                separatorChar: " "
            };

            const suggestions = Scanner.getSuggestions(context, settings);

            expect(suggestions.length).toBe(2);
            expect(suggestions[0].displayName).toBe("test");
            expect(suggestions[1].displayName).toBe("testing");
            // Should be sorted by frequency * 1000 - word length
            expect(suggestions[0].displayName).toBe("test"); // Higher frequency
        });

        test("should return empty array when disabled", () => {
            const disabledSettings = { ...settings, scanEnabled: false };
            const context: SuggestionContext = {
                editor: {} as any,
                file: {} as any,
                start: { line: 0, ch: 0 },
                end: { line: 0, ch: 2 },
                query: "te",
                separatorChar: " "
            };

            const suggestions = Scanner.getSuggestions(context, disabledSettings);

            expect(suggestions).toEqual([]);
        });

        test("should return empty array for short query", () => {
            const shortQuerySettings = { ...settings, minWordTriggerLength: 3 };
            const context: SuggestionContext = {
                editor: {} as any,
                file: {} as any,
                start: { line: 0, ch: 0 },
                end: { line: 0, ch: 1 },
                query: "t",
                separatorChar: " "
            };

            const suggestions = Scanner.getSuggestions(context, shortQuerySettings);

            expect(suggestions).toEqual([]);
        });
    });

    describe("Edge Cases", () => {
        test("should handle scan source not found warning", async () => {
            Scanner.setVault(mockVault);
            mockDatabase.getScanSourceId.mockResolvedValue(null);
            
            const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

            await (Scanner as any).addOrIncrementWord("test");

            expect(consoleSpy).toHaveBeenCalledWith('Scanner: Scan source not found in database');
            consoleSpy.mockRestore();
        });

        test("should handle words with special characters", async () => {
            const specialWords = ["test-word", "test_word", "test.word"];
            
            for (const word of specialWords) {
                await (Scanner as any).addOrIncrementWord(word);
            }

            expect(Scanner.wordMap.size).toBe(1); // All start with 't'
            expect(Scanner.wordMap.get("t")!.size).toBe(3);
        });

        test("should handle very long words", async () => {
            const longWord = "a".repeat(1000);
            
            await (Scanner as any).addOrIncrementWord(longWord);

            expect(Scanner.wordMap.get("a")!.get(longWord)).toBeDefined();
        });

        test("should handle unicode characters", async () => {
            const unicodeWord = "café";
            
            await (Scanner as any).addOrIncrementWord(unicodeWord);

            expect(Scanner.wordMap.get("c")!.get(unicodeWord)).toBeDefined();
        });
    });
}); 