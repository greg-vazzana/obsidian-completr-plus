import { Vault } from "obsidian";
import { SuggestionIgnorelist } from "../../src/provider/ignorelist";
import { Suggestion } from "../../src/provider/provider";
import { intoCompletrPath } from "../../src/settings";
import { CONFIG_FILES, PATTERNS } from "../../src/constants";

// Mock dependencies
jest.mock("obsidian");
jest.mock("../../src/settings");
jest.mock("../../src/constants");

describe("SuggestionIgnorelist", () => {
    let mockVault: jest.Mocked<Vault>;
    let suggestion1: Suggestion;
    let suggestion2: Suggestion;
    let suggestion3: Suggestion;

    beforeEach(() => {
        // Clear the ignorelist before each test
        (SuggestionIgnorelist as any).ignorelist.clear();

        // Mock vault
        mockVault = {
            adapter: {
                read: jest.fn().mockResolvedValue("suggestion1\nsuggestion2\n") as jest.Mock,
                write: jest.fn().mockResolvedValue(undefined) as jest.Mock,
                exists: jest.fn().mockResolvedValue(true) as jest.Mock,
            },
        } as any;

        // Mock helper functions
        (intoCompletrPath as jest.Mock).mockReturnValue("test/ignorelist.txt");
        (CONFIG_FILES.IGNORELIST as any) = "ignorelist.txt";
        (PATTERNS.NEW_LINE as any) = /\r?\n/;

        // Create test suggestions
        suggestion1 = new Suggestion("Test Suggestion 1", "test1");
        suggestion2 = new Suggestion("Test Suggestion 2", "test2");
        suggestion3 = new Suggestion("Test Suggestion 3", "test3");
    });

    describe("Basic Operations", () => {
        test("should add suggestion to ignorelist", () => {
            SuggestionIgnorelist.add(suggestion1);

            expect(SuggestionIgnorelist.has(suggestion1)).toBe(true);
            expect(SuggestionIgnorelist.hasText("Test Suggestion 1")).toBe(true);
        });

        test("should add text to ignorelist", () => {
            SuggestionIgnorelist.addFromText("Custom Text");

            expect(SuggestionIgnorelist.hasText("Custom Text")).toBe(true);
        });

        test("should remove text from ignorelist", () => {
            SuggestionIgnorelist.addFromText("To Remove");
            expect(SuggestionIgnorelist.hasText("To Remove")).toBe(true);

            SuggestionIgnorelist.removeFromText("To Remove");
            expect(SuggestionIgnorelist.hasText("To Remove")).toBe(false);
        });

        test("should check if suggestion exists", () => {
            expect(SuggestionIgnorelist.has(suggestion1)).toBe(false);
            
            SuggestionIgnorelist.add(suggestion1);
            expect(SuggestionIgnorelist.has(suggestion1)).toBe(true);
        });

        test("should check if text exists", () => {
            expect(SuggestionIgnorelist.hasText("Non-existent")).toBe(false);
            
            SuggestionIgnorelist.addFromText("Existing");
            expect(SuggestionIgnorelist.hasText("Existing")).toBe(true);
        });
    });

    describe("Filtering", () => {
        beforeEach(() => {
            // Add some suggestions to the ignorelist
            SuggestionIgnorelist.add(suggestion1);
            SuggestionIgnorelist.addFromText("Test Suggestion 3");
        });

        test("should filter suggestions array", () => {
            const suggestions = [suggestion1, suggestion2, suggestion3];
            const filtered = SuggestionIgnorelist.filter(suggestions);

            expect(filtered).toHaveLength(1);
            expect(filtered[0]).toBe(suggestion2);
            expect(filtered).not.toContain(suggestion1);
            expect(filtered).not.toContain(suggestion3);
        });

        test("should filter text array", () => {
            const texts = ["Test Suggestion 1", "Test Suggestion 2", "Test Suggestion 3"];
            const filtered = SuggestionIgnorelist.filterText(texts);

            expect(filtered).toHaveLength(1);
            expect(filtered[0]).toBe("Test Suggestion 2");
            expect(filtered).not.toContain("Test Suggestion 1");
            expect(filtered).not.toContain("Test Suggestion 3");
        });

        test("should return all suggestions when ignorelist is empty", () => {
            // Clear the ignorelist
            (SuggestionIgnorelist as any).ignorelist.clear();

            const suggestions = [suggestion1, suggestion2, suggestion3];
            const filtered = SuggestionIgnorelist.filter(suggestions);

            expect(filtered).toHaveLength(3);
            expect(filtered).toEqual(suggestions);
        });

        test("should return all texts when ignorelist is empty", () => {
            // Clear the ignorelist
            (SuggestionIgnorelist as any).ignorelist.clear();

            const texts = ["Text 1", "Text 2", "Text 3"];
            const filtered = SuggestionIgnorelist.filterText(texts);

            expect(filtered).toHaveLength(3);
            expect(filtered).toEqual(texts);
        });
    });

    describe("File Persistence", () => {
        test("should save ignorelist to file", async () => {
            SuggestionIgnorelist.addFromText("Item 1");
            SuggestionIgnorelist.addFromText("Item 2");

            await SuggestionIgnorelist.saveData(mockVault);

            expect(intoCompletrPath).toHaveBeenCalledWith(mockVault, CONFIG_FILES.IGNORELIST);
            expect(mockVault.adapter.write).toHaveBeenCalledWith(
                "test/ignorelist.txt",
                expect.stringContaining("Item 1")
            );
            expect(mockVault.adapter.write).toHaveBeenCalledWith(
                "test/ignorelist.txt",
                expect.stringContaining("Item 2")
            );
        });

        test("should load ignorelist from file", async () => {
            (mockVault.adapter.read as jest.Mock).mockResolvedValue("Word 1\nWord 2\nWord 3");

            await SuggestionIgnorelist.loadData(mockVault);

            expect(intoCompletrPath).toHaveBeenCalledWith(mockVault, CONFIG_FILES.IGNORELIST);
            expect(mockVault.adapter.read).toHaveBeenCalledWith("test/ignorelist.txt");
            expect(SuggestionIgnorelist.hasText("Word 1")).toBe(true);
            expect(SuggestionIgnorelist.hasText("Word 2")).toBe(true);
            expect(SuggestionIgnorelist.hasText("Word 3")).toBe(true);
        });

        test("should handle non-existent file gracefully", async () => {
            (mockVault.adapter.exists as jest.Mock).mockResolvedValue(false);

            await SuggestionIgnorelist.loadData(mockVault);

            expect(mockVault.adapter.read).not.toHaveBeenCalled();
        });

        test("should skip empty lines when loading", async () => {
            (mockVault.adapter.read as jest.Mock).mockResolvedValue("Word 1\n\nWord 2\n\n\nWord 3\n");

            await SuggestionIgnorelist.loadData(mockVault);

            expect(SuggestionIgnorelist.hasText("Word 1")).toBe(true);
            expect(SuggestionIgnorelist.hasText("Word 2")).toBe(true);
            expect(SuggestionIgnorelist.hasText("Word 3")).toBe(true);
            expect(SuggestionIgnorelist.hasText("")).toBe(false);
        });

        test("should handle different line endings", async () => {
            (mockVault.adapter.read as jest.Mock).mockResolvedValue("Word 1\r\nWord 2\nWord 3");

            await SuggestionIgnorelist.loadData(mockVault);

            expect(SuggestionIgnorelist.hasText("Word 1")).toBe(true);
            expect(SuggestionIgnorelist.hasText("Word 2")).toBe(true);
            expect(SuggestionIgnorelist.hasText("Word 3")).toBe(true);
        });
    });

    describe("Edge Cases", () => {
        test("should handle duplicate additions", () => {
            SuggestionIgnorelist.addFromText("Duplicate");
            SuggestionIgnorelist.addFromText("Duplicate");

            expect(SuggestionIgnorelist.hasText("Duplicate")).toBe(true);
            // Should not create duplicates in the set
            expect((SuggestionIgnorelist as any).ignorelist.size).toBe(1);
        });

        test("should handle empty text addition", () => {
            SuggestionIgnorelist.addFromText("");

            expect(SuggestionIgnorelist.hasText("")).toBe(true);
        });

        test("should handle removal of non-existent text", () => {
            expect(() => {
                SuggestionIgnorelist.removeFromText("Non-existent");
            }).not.toThrow();
        });

        test("should handle special characters in text", () => {
            const specialText = "Special!@#$%^&*()_+{}|:<>?[]\\;',./";
            SuggestionIgnorelist.addFromText(specialText);

            expect(SuggestionIgnorelist.hasText(specialText)).toBe(true);
        });

        test("should handle unicode characters", () => {
            const unicodeText = "Unicode: 你好世界 🌍 éñüḯøđė";
            SuggestionIgnorelist.addFromText(unicodeText);

            expect(SuggestionIgnorelist.hasText(unicodeText)).toBe(true);
        });

        test("should handle whitespace in text", () => {
            const whitespaceText = "  Text with spaces  ";
            SuggestionIgnorelist.addFromText(whitespaceText);

            expect(SuggestionIgnorelist.hasText(whitespaceText)).toBe(true);
        });

        test("should be case-sensitive", () => {
            SuggestionIgnorelist.addFromText("CaseSensitive");

            expect(SuggestionIgnorelist.hasText("CaseSensitive")).toBe(true);
            expect(SuggestionIgnorelist.hasText("casesensitive")).toBe(false);
            expect(SuggestionIgnorelist.hasText("CASESENSITIVE")).toBe(false);
        });
    });

    describe("Save and Load Integration", () => {
        test("should preserve data through save/load cycle", async () => {
            // Add some data
            SuggestionIgnorelist.addFromText("Item A");
            SuggestionIgnorelist.addFromText("Item B");
            SuggestionIgnorelist.addFromText("Item C");

            // Save data
            await SuggestionIgnorelist.saveData(mockVault);

            // Get the saved content
            const savedContent = (mockVault.adapter.write as jest.Mock).mock.calls[0][1];

            // Clear the ignorelist
            (SuggestionIgnorelist as any).ignorelist.clear();

            // Mock the read to return the saved content
            (mockVault.adapter.read as jest.Mock).mockResolvedValue(savedContent);

            // Load data
            await SuggestionIgnorelist.loadData(mockVault);

            // Verify data was restored
            expect(SuggestionIgnorelist.hasText("Item A")).toBe(true);
            expect(SuggestionIgnorelist.hasText("Item B")).toBe(true);
            expect(SuggestionIgnorelist.hasText("Item C")).toBe(true);
        });

        test("should handle file read errors gracefully", async () => {
            (mockVault.adapter.read as jest.Mock).mockRejectedValue(new Error("Read error"));

            await expect(SuggestionIgnorelist.loadData(mockVault)).rejects.toThrow("Read error");
        });

        test("should handle file write errors gracefully", async () => {
            (mockVault.adapter.write as jest.Mock).mockRejectedValue(new Error("Write error"));

            await expect(SuggestionIgnorelist.saveData(mockVault)).rejects.toThrow("Write error");
        });
    });
}); 