import { Vault } from "obsidian";
import { WordList } from "../../src/provider/word_list_provider";
import { SQLiteDatabaseService, Word } from "../../src/db/sqlite_database_service";
import { CompletrSettings, DEFAULT_SETTINGS, WordInsertionMode } from "../../src/settings";
import { SuggestionIgnorelist } from "../../src/provider/ignorelist";
import { WordPatterns } from "../../src/word_patterns";
import { SuggestionContext } from "../../src/provider/provider";
import { FOLDERS, PATTERNS, ERROR_MESSAGES } from "../../src/constants";

// Mock dependencies
jest.mock("../../src/db/sqlite_database_service");
jest.mock("../../src/provider/ignorelist");
jest.mock("../../src/word_patterns");
jest.mock("../../src/constants");

describe("WordListSuggestionProvider", () => {
    let mockVault: jest.Mocked<Vault>;
    let mockDatabase: jest.Mocked<SQLiteDatabaseService>;
    let settings: CompletrSettings;

    beforeEach(() => {
        // Clear all mocks
        jest.clearAllMocks();
        
        // Reset WordList's internal state
        WordList.wordMap.clear();
        (WordList as any).db = null;
        (WordList as any).vault = null;

        // Mock vault
        mockVault = {
            adapter: {
                read: jest.fn().mockResolvedValue(""),
                write: jest.fn().mockResolvedValue(undefined),
                exists: jest.fn().mockResolvedValue(true),
                mkdir: jest.fn().mockResolvedValue(undefined),
                remove: jest.fn().mockResolvedValue(undefined),
                list: jest.fn().mockResolvedValue({ files: [], folders: [] }),
                readBinary: jest.fn().mockResolvedValue(new ArrayBuffer(0)),
            },
            cachedRead: jest.fn().mockResolvedValue(""),
        } as any;

        // Mock database
        mockDatabase = {
            initialize: jest.fn(),
            initializeSources: jest.fn(),
            addOrUpdateWordListSource: jest.fn(),
            addWord: jest.fn(),
            getWordListSourceIds: jest.fn(),
            getAllWordsBySource: jest.fn(),
            deleteWordListSource: jest.fn(),
            shutdown: jest.fn(),
        } as any;

        // Default settings
        settings = {
            ...DEFAULT_SETTINGS,
            wordListProviderEnabled: true,
            minWordLength: 3,
        };

        // Setup mocks
        (SQLiteDatabaseService as jest.Mock).mockImplementation(() => mockDatabase);
        (SuggestionIgnorelist.hasText as jest.Mock).mockReturnValue(false);
        (WordPatterns.isValidWord as jest.Mock).mockReturnValue(true);
        (FOLDERS.WORD_LISTS as any) = "wordLists";
        (PATTERNS.NEW_LINE as any) = "\n";
        (ERROR_MESSAGES.PROVIDER_NOT_INITIALIZED as any) = (provider: string) => `${provider} provider not initialized`;
        (ERROR_MESSAGES.FILE_READ_ERROR as any) = (file: string) => `Failed to read ${file}`;
    });

    describe("Constructor and Initialization", () => {
        test("should initialize with empty wordMap", () => {
            expect(WordList.wordMap.size).toBe(0);
            expect((WordList as any).db).toBeNull();
            expect((WordList as any).vault).toBeNull();
        });

        test("should set vault and create database instance", () => {
            WordList.setVault(mockVault);
            expect((WordList as any).vault).toBe(mockVault);
            expect((WordList as any).db).toBe(mockDatabase);
        });

        test("should initialize successfully", async () => {
            WordList.setVault(mockVault);
            mockDatabase.initialize.mockResolvedValue(undefined);
            mockDatabase.initializeSources.mockResolvedValue(undefined);

            await WordList.initialize();

            expect(mockDatabase.initialize).toHaveBeenCalled();
            expect(mockDatabase.initializeSources).toHaveBeenCalled();
        });

        test("should throw error when initializing without database", async () => {
            await expect(WordList.initialize()).rejects.toThrow("Word list provider not initialized");
        });
    });

    describe("Provider Configuration", () => {
        test("should be enabled when wordListProviderEnabled is true", () => {
            expect(WordList.isEnabled(settings)).toBe(true);
        });

        test("should be disabled when wordListProviderEnabled is false", () => {
            const disabledSettings = { ...settings, wordListProviderEnabled: false };
            expect(WordList.isEnabled(disabledSettings)).toBe(false);
        });
    });

    describe("File Path Management", () => {
        beforeEach(() => {
            WordList.setVault(mockVault);
        });

        test("should get relative file paths", async () => {
            const mockFiles = ["file1.txt", "file2.txt", "file3.dic"];
            (mockVault.adapter.exists as jest.Mock).mockResolvedValue(true);
            (mockVault.adapter.list as jest.Mock).mockResolvedValue({ files: mockFiles, folders: [] });

            const paths = await WordList.getRelativeFilePaths(mockVault);

            expect(paths).toEqual(mockFiles);
            expect(mockVault.adapter.exists).toHaveBeenCalled();
            expect(mockVault.adapter.list).toHaveBeenCalled();
        });

        test("should create directory if it doesn't exist", async () => {
            (mockVault.adapter.exists as jest.Mock).mockResolvedValue(false);
            (mockVault.adapter.mkdir as jest.Mock).mockResolvedValue(undefined);
            (mockVault.adapter.list as jest.Mock).mockResolvedValue({ files: [], folders: [] });

            await WordList.getRelativeFilePaths(mockVault);

            expect(mockVault.adapter.mkdir).toHaveBeenCalled();
        });
    });

    describe("File Loading", () => {
        beforeEach(() => {
            WordList.setVault(mockVault);
        });

        test("should load words from files successfully", async () => {
            const mockFiles = ["test1.txt", "test2.txt"];
            const fileContent1 = "hello\nworld\ntest\n";
            const fileContent2 = "word\nlist\ntest\n";
            
            (mockVault.adapter.exists as jest.Mock).mockResolvedValue(true);
            (mockVault.adapter.list as jest.Mock).mockResolvedValue({ files: mockFiles, folders: [] });
            (mockVault.adapter.read as jest.Mock)
                .mockResolvedValueOnce(fileContent1)
                .mockResolvedValueOnce(fileContent2);
            
            mockDatabase.addOrUpdateWordListSource.mockResolvedValue(1);
            mockDatabase.addWord.mockResolvedValue(undefined);
            mockDatabase.getWordListSourceIds.mockResolvedValue([1]);
            mockDatabase.getAllWordsBySource.mockResolvedValue(new Map([
                ["h", [{ word: "hello", frequency: 1 }]],
                ["w", [{ word: "world", frequency: 1 }, { word: "word", frequency: 1 }]],
                ["t", [{ word: "test", frequency: 2 }]], // Should appear twice
                ["l", [{ word: "list", frequency: 1 }]]
            ]));

            const wordCount = await WordList.loadFromFiles(mockVault, settings);

            expect(wordCount).toBe(5); // hello, world, word, test, list
            expect(mockDatabase.addOrUpdateWordListSource).toHaveBeenCalledTimes(2);
            expect(mockDatabase.addWord).toHaveBeenCalledTimes(6); // 3 + 3 words
            expect(WordList.wordMap.size).toBeGreaterThan(0);
        });

        test("should skip empty lines and short words", async () => {
            const mockFiles = ["test.txt"];
            const fileContent = "hello\n\nhi\n   \nworld\n";
            
            (mockVault.adapter.exists as jest.Mock).mockResolvedValue(true);
            (mockVault.adapter.list as jest.Mock).mockResolvedValue({ files: mockFiles, folders: [] });
            (mockVault.adapter.read as jest.Mock).mockResolvedValue(fileContent);
            
            mockDatabase.addOrUpdateWordListSource.mockResolvedValue(1);
            mockDatabase.addWord.mockResolvedValue(undefined);
            mockDatabase.getWordListSourceIds.mockResolvedValue([1]);
            mockDatabase.getAllWordsBySource.mockResolvedValue(new Map());

            await WordList.loadFromFiles(mockVault, settings);

            // Should only process "hello" and "world", skip "hi" (too short)
            expect(mockDatabase.addWord).toHaveBeenCalledWith("hello", 1);
            expect(mockDatabase.addWord).toHaveBeenCalledWith("world", 1);
            expect(mockDatabase.addWord).not.toHaveBeenCalledWith("hi", 1);
        });

        test("should skip invalid words", async () => {
            const mockFiles = ["test.txt"];
            const fileContent = "hello\n123\nworld\n";
            
            (mockVault.adapter.exists as jest.Mock).mockResolvedValue(true);
            (mockVault.adapter.list as jest.Mock).mockResolvedValue({ files: mockFiles, folders: [] });
            (mockVault.adapter.read as jest.Mock).mockResolvedValue(fileContent);
            
            (WordPatterns.isValidWord as jest.Mock).mockImplementation((word) => {
                return word !== "123"; // Reject numbers
            });
            
            mockDatabase.addOrUpdateWordListSource.mockResolvedValue(1);
            mockDatabase.addWord.mockResolvedValue(undefined);
            mockDatabase.getWordListSourceIds.mockResolvedValue([1]);
            mockDatabase.getAllWordsBySource.mockResolvedValue(new Map());

            await WordList.loadFromFiles(mockVault, settings);

            expect(mockDatabase.addWord).toHaveBeenCalledWith("hello", 1);
            expect(mockDatabase.addWord).toHaveBeenCalledWith("world", 1);
            expect(mockDatabase.addWord).not.toHaveBeenCalledWith("123", 1);
        });

        test("should handle file read errors", async () => {
            const mockFiles = ["test.txt"];
            
            (mockVault.adapter.exists as jest.Mock).mockResolvedValue(true);
            (mockVault.adapter.list as jest.Mock).mockResolvedValue({ files: mockFiles, folders: [] });
            (mockVault.adapter.read as jest.Mock).mockRejectedValue(new Error("File not found"));
            
            mockDatabase.getWordListSourceIds.mockResolvedValue([]);
            mockDatabase.getAllWordsBySource.mockResolvedValue(new Map());
            
            const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

            const wordCount = await WordList.loadFromFiles(mockVault, settings);

            expect(wordCount).toBe(0);
            expect(consoleSpy).toHaveBeenCalledWith("Failed to read test.txt");
            consoleSpy.mockRestore();
        });

        test("should return 0 when provider disabled", async () => {
            const disabledSettings = { ...settings, wordListProviderEnabled: false };

            const wordCount = await WordList.loadFromFiles(mockVault, disabledSettings);

            expect(wordCount).toBe(0);
            expect(mockVault.adapter.list).not.toHaveBeenCalled();
        });

        test("should throw error when database not initialized", async () => {
            (WordList as any).db = null;

            await expect(WordList.loadFromFiles(mockVault, settings)).rejects.toThrow("Word list provider not initialized");
        });
    });

    describe("Database Operations", () => {
        beforeEach(() => {
            WordList.setVault(mockVault);
        });

        test("should load words from database", async () => {
            const mockWords = new Map([
                ["h", [{ word: "hello", frequency: 3 }]],
                ["w", [{ word: "world", frequency: 2 }, { word: "word", frequency: 1 }]],
                ["t", [{ word: "test", frequency: 5 }]]
            ]);

            mockDatabase.getWordListSourceIds.mockResolvedValue([1, 2]);
            mockDatabase.getAllWordsBySource.mockResolvedValue(mockWords);

            await (WordList as any).loadWordsFromDb();

            expect(WordList.wordMap.size).toBe(3);
            expect(WordList.wordMap.get("h")!.size).toBe(1);
            expect(WordList.wordMap.get("w")!.size).toBe(2);
            expect(WordList.wordMap.get("t")!.size).toBe(1);
        });

        test("should sort words by frequency and length", async () => {
            const mockWords = new Map([
                ["t", [
                    { word: "test", frequency: 1 },
                    { word: "testing", frequency: 1 },
                    { word: "top", frequency: 5 }
                ]]
            ]);

            mockDatabase.getWordListSourceIds.mockResolvedValue([1]);
            mockDatabase.getAllWordsBySource.mockResolvedValue(mockWords);

            await (WordList as any).loadWordsFromDb();

            const tWords = Array.from(WordList.wordMap.get("t")!.keys());
            expect(tWords[0]).toBe("top"); // Highest frequency
            expect(tWords[1]).toBe("test"); // Same frequency but shorter
            expect(tWords[2]).toBe("testing"); // Same frequency but longer
        });

        test("should filter ignored words", async () => {
            const mockWords = new Map([
                ["t", [
                    { word: "test", frequency: 1 },
                    { word: "ignored", frequency: 2 }
                ]]
            ]);

            (SuggestionIgnorelist.hasText as jest.Mock).mockImplementation((word) => {
                return word === "ignored";
            });

            mockDatabase.getWordListSourceIds.mockResolvedValue([1]);
            mockDatabase.getAllWordsBySource.mockResolvedValue(mockWords);

            await (WordList as any).loadWordsFromDb();

            expect(WordList.wordMap.get("t")!.size).toBe(1);
            expect(WordList.wordMap.get("t")!.has("test")).toBe(true);
            expect(WordList.wordMap.get("t")!.has("ignored")).toBe(false);
        });

        test("should throw error when loading without database", async () => {
            (WordList as any).db = null;

            await expect((WordList as any).loadWordsFromDb()).rejects.toThrow("Word list provider not initialized");
        });

        test("should handle mark non-existent files", async () => {
            const existingFiles = new Set(["file1.txt", "file2.txt"]);
            mockDatabase.getWordListSourceIds.mockResolvedValue([1, 2]);
            mockDatabase.getAllWordsBySource.mockResolvedValue(new Map());

            await (WordList as any).markNonExistentFiles(existingFiles);

            expect(mockDatabase.getWordListSourceIds).toHaveBeenCalled();
        });

        test("should throw error when marking files without database", async () => {
            (WordList as any).db = null;
            const existingFiles = new Set(["file1.txt"]);

            await expect((WordList as any).markNonExistentFiles(existingFiles)).rejects.toThrow("Word list provider not initialized");
        });
    });

    describe("Word List Management", () => {
        beforeEach(() => {
            WordList.setVault(mockVault);
        });

        test("should import word list successfully", async () => {
            const name = "custom.txt";
            const text = "custom\nword\nlist\n";
            
            (mockVault.adapter.exists as jest.Mock).mockResolvedValue(false);
            (mockVault.adapter.write as jest.Mock).mockResolvedValue(undefined);

            const result = await WordList.importWordList(mockVault, name, text, settings);

            expect(result).toBe(true);
            expect(mockVault.adapter.write).toHaveBeenCalled();
        });

        test("should not import if file already exists", async () => {
            const name = "existing.txt";
            const text = "some\ntext\n";
            
            (mockVault.adapter.exists as jest.Mock).mockResolvedValue(true);

            const result = await WordList.importWordList(mockVault, name, text, settings);

            expect(result).toBe(false);
            expect(mockVault.adapter.write).not.toHaveBeenCalled();
        });

        test("should not import when provider disabled", async () => {
            const disabledSettings = { ...settings, wordListProviderEnabled: false };
            const name = "test.txt";
            const text = "test\n";

            const result = await WordList.importWordList(mockVault, name, text, disabledSettings);

            expect(result).toBe(false);
            expect(mockVault.adapter.exists).not.toHaveBeenCalled();
        });

        test("should delete word list successfully", async () => {
            const name = "delete.txt";
            
            (mockVault.adapter.exists as jest.Mock).mockResolvedValue(true);
            (mockVault.adapter.remove as jest.Mock).mockResolvedValue(undefined);
            mockDatabase.deleteWordListSource.mockResolvedValue(undefined);

            await WordList.deleteWordList(mockVault, name);

            expect(mockVault.adapter.remove).toHaveBeenCalled();
            expect(mockDatabase.deleteWordListSource).toHaveBeenCalledWith(name);
        });

        test("should handle delete when file doesn't exist", async () => {
            const name = "nonexistent.txt";
            
            (mockVault.adapter.exists as jest.Mock).mockResolvedValue(false);
            mockDatabase.deleteWordListSource.mockResolvedValue(undefined);

            await WordList.deleteWordList(mockVault, name);

            expect(mockVault.adapter.remove).not.toHaveBeenCalled();
            expect(mockDatabase.deleteWordListSource).toHaveBeenCalledWith(name);
        });

        test("should delete without database", async () => {
            const name = "test.txt";
            
            (WordList as any).db = null;
            (mockVault.adapter.exists as jest.Mock).mockResolvedValue(true);
            (mockVault.adapter.remove as jest.Mock).mockResolvedValue(undefined);

            await WordList.deleteWordList(mockVault, name);

            expect(mockVault.adapter.remove).toHaveBeenCalled();
        });
    });

    describe("Suggestion Generation", () => {
        beforeEach(() => {
            WordList.setVault(mockVault);
            // Add test words
            WordList.wordMap.set("t", new Map([
                ["test", { word: "test", frequency: 3 }],
                ["testing", { word: "testing", frequency: 1 }]
            ]));
            WordList.wordMap.set("h", new Map([
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

            const suggestions = WordList.getSuggestions(context, settings);

            expect(suggestions.length).toBe(2);
            expect(suggestions[0].displayName).toBe("test");
            expect(suggestions[1].displayName).toBe("testing");
        });

        test("should return empty array when disabled", () => {
            const disabledSettings = { ...settings, wordListProviderEnabled: false };
            const context: SuggestionContext = {
                editor: {} as any,
                file: {} as any,
                start: { line: 0, ch: 0 },
                end: { line: 0, ch: 2 },
                query: "te",
                separatorChar: " "
            };

            const suggestions = WordList.getSuggestions(context, disabledSettings);

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

            const suggestions = WordList.getSuggestions(context, shortQuerySettings);

            expect(suggestions).toEqual([]);
        });

        test("should handle case-insensitive matching", () => {
            const caseInsensitiveSettings = { 
                ...settings, 
                wordInsertionMode: WordInsertionMode.IGNORE_CASE_REPLACE 
            };
            
            // Add words to both lowercase and uppercase letter maps for case-insensitive testing
            WordList.wordMap.set("T", new Map([
                ["test", { word: "test", frequency: 3 }],
                ["testing", { word: "testing", frequency: 1 }]
            ]));
            
            const context: SuggestionContext = {
                editor: {} as any,
                file: {} as any,
                start: { line: 0, ch: 0 },
                end: { line: 0, ch: 2 },
                query: "TE",
                separatorChar: " "
            };

            const suggestions = WordList.getSuggestions(context, caseInsensitiveSettings);

            // Should find matches in both lowercase and uppercase maps (duplicates expected)
            expect(suggestions.length).toBe(4);
            const suggestionNames = suggestions.map(s => s.displayName);
            expect(suggestionNames).toContain("test");
            expect(suggestionNames).toContain("testing");
        });
    });

    describe("Utility Methods", () => {
        beforeEach(() => {
            WordList.setVault(mockVault);
        });

        test("should calculate total word count", () => {
            WordList.wordMap.set("t", new Map([
                ["test", { word: "test", frequency: 1 }],
                ["testing", { word: "testing", frequency: 1 }]
            ]));
            WordList.wordMap.set("h", new Map([
                ["hello", { word: "hello", frequency: 1 }]
            ]));

            const count = (WordList as any).getTotalWordCount();

            expect(count).toBe(3);
        });

        test("should handle empty wordMap", () => {
            WordList.wordMap.clear();

            const count = (WordList as any).getTotalWordCount();

            expect(count).toBe(0);
        });
    });

    describe("Edge Cases", () => {
        beforeEach(() => {
            WordList.setVault(mockVault);
        });

        test("should handle unicode words", async () => {
            const mockFiles = ["unicode.txt"];
            const fileContent = "café\nnaïve\nrésumé\n";
            
            (mockVault.adapter.exists as jest.Mock).mockResolvedValue(true);
            (mockVault.adapter.list as jest.Mock).mockResolvedValue({ files: mockFiles, folders: [] });
            (mockVault.adapter.read as jest.Mock).mockResolvedValue(fileContent);
            
            mockDatabase.addOrUpdateWordListSource.mockResolvedValue(1);
            mockDatabase.addWord.mockResolvedValue(undefined);
            mockDatabase.getWordListSourceIds.mockResolvedValue([1]);
            mockDatabase.getAllWordsBySource.mockResolvedValue(new Map([
                ["c", [{ word: "café", frequency: 1 }]],
                ["n", [{ word: "naïve", frequency: 1 }]],
                ["r", [{ word: "résumé", frequency: 1 }]]
            ]));

            await WordList.loadFromFiles(mockVault, settings);

            expect(WordList.wordMap.get("c")!.has("café")).toBe(true);
            expect(WordList.wordMap.get("n")!.has("naïve")).toBe(true);
            expect(WordList.wordMap.get("r")!.has("résumé")).toBe(true);
        });

        test("should handle very long words", async () => {
            const longWord = "a".repeat(1000);
            const mockFiles = ["long.txt"];
            const fileContent = longWord + "\n";
            
            (mockVault.adapter.exists as jest.Mock).mockResolvedValue(true);
            (mockVault.adapter.list as jest.Mock).mockResolvedValue({ files: mockFiles, folders: [] });
            (mockVault.adapter.read as jest.Mock).mockResolvedValue(fileContent);
            
            mockDatabase.addOrUpdateWordListSource.mockResolvedValue(1);
            mockDatabase.addWord.mockResolvedValue(undefined);
            mockDatabase.getWordListSourceIds.mockResolvedValue([1]);
            mockDatabase.getAllWordsBySource.mockResolvedValue(new Map([
                ["a", [{ word: longWord, frequency: 1 }]]
            ]));

            await WordList.loadFromFiles(mockVault, settings);

            expect(WordList.wordMap.get("a")!.has(longWord)).toBe(true);
        });

        test("should handle empty files", async () => {
            const mockFiles = ["empty.txt"];
            const fileContent = "";
            
            (mockVault.adapter.exists as jest.Mock).mockResolvedValue(true);
            (mockVault.adapter.list as jest.Mock).mockResolvedValue({ files: mockFiles, folders: [] });
            (mockVault.adapter.read as jest.Mock).mockResolvedValue(fileContent);
            
            mockDatabase.addOrUpdateWordListSource.mockResolvedValue(1);
            mockDatabase.getWordListSourceIds.mockResolvedValue([1]);
            mockDatabase.getAllWordsBySource.mockResolvedValue(new Map());

            const wordCount = await WordList.loadFromFiles(mockVault, settings);

            expect(wordCount).toBe(0);
            expect(mockDatabase.addWord).not.toHaveBeenCalled();
        });

        test("should handle files with only whitespace", async () => {
            const mockFiles = ["whitespace.txt"];
            const fileContent = "   \n\t\n   \n";
            
            (mockVault.adapter.exists as jest.Mock).mockResolvedValue(true);
            (mockVault.adapter.list as jest.Mock).mockResolvedValue({ files: mockFiles, folders: [] });
            (mockVault.adapter.read as jest.Mock).mockResolvedValue(fileContent);
            
            mockDatabase.addOrUpdateWordListSource.mockResolvedValue(1);
            mockDatabase.getWordListSourceIds.mockResolvedValue([1]);
            mockDatabase.getAllWordsBySource.mockResolvedValue(new Map());

            const wordCount = await WordList.loadFromFiles(mockVault, settings);

            expect(wordCount).toBe(0);
            expect(mockDatabase.addWord).not.toHaveBeenCalled();
        });

        test("should handle mixed line endings", async () => {
            const mockFiles = ["mixed.txt"];
            const fileContent = "hello\r\nworld\ntest\r\n";
            
            (mockVault.adapter.exists as jest.Mock).mockResolvedValue(true);
            (mockVault.adapter.list as jest.Mock).mockResolvedValue({ files: mockFiles, folders: [] });
            (mockVault.adapter.read as jest.Mock).mockResolvedValue(fileContent);
            
            mockDatabase.addOrUpdateWordListSource.mockResolvedValue(1);
            mockDatabase.addWord.mockResolvedValue(undefined);
            mockDatabase.getWordListSourceIds.mockResolvedValue([1]);
            mockDatabase.getAllWordsBySource.mockResolvedValue(new Map([
                ["h", [{ word: "hello", frequency: 1 }]],
                ["w", [{ word: "world", frequency: 1 }]],
                ["t", [{ word: "test", frequency: 1 }]]
            ]));

            await WordList.loadFromFiles(mockVault, settings);

            expect(WordList.wordMap.get("h")!.has("hello")).toBe(true);
            expect(WordList.wordMap.get("w")!.has("world")).toBe(true);
            expect(WordList.wordMap.get("t")!.has("test")).toBe(true);
        });
    });
}); 