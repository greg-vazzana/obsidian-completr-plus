import { Editor, TFile, CachedMetadata, MetadataCache, getAllTags } from "obsidian";
import { FrontMatter } from "../../src/provider/front_matter_provider";
import { CompletrSettings, DEFAULT_SETTINGS } from "../../src/settings";
import { SuggestionContext, Suggestion } from "../../src/provider/provider";
import { ValidationUtils } from "../../src/utils/validation_utils";
import { TextUtils } from "../../src/utils/text_utils";
import { EditorUtils } from "../../src/utils/editor_utils";

// Mock dependencies
jest.mock("obsidian", () => ({
    ...jest.requireActual("obsidian"),
    getAllTags: jest.fn()
}));
jest.mock("../../src/utils/validation_utils");
jest.mock("../../src/utils/text_utils");
jest.mock("../../src/utils/editor_utils");

describe("FrontMatterSuggestionProvider", () => {
    let mockEditor: jest.Mocked<Editor>;
    let mockFile: jest.Mocked<TFile>;
    let mockMetadataCache: jest.Mocked<MetadataCache>;
    let settings: CompletrSettings;
    let mockCachedMetadata: CachedMetadata;

    beforeEach(() => {
        // Clear provider's internal state
        (FrontMatter as any).fileSuggestionCache.clear();

        // Mock editor
        mockEditor = {
            getLine: jest.fn(),
            getCursor: jest.fn(),
        } as any;

        // Mock file
        mockFile = {
            path: "test.md",
            name: "test.md",
        } as any;

        // Mock metadata cache
        mockMetadataCache = {
            getFileCache: jest.fn(),
        } as any;

        // Default settings
        settings = {
            ...DEFAULT_SETTINGS,
            frontMatterProviderEnabled: true,
            frontMatterIgnoreCase: false,
            frontMatterTagAppendSuffix: false,
            characterRegex: "\\p{L}\\p{N}",
            maxLookBackDistance: 50,
        };

        // Mock cached metadata
        mockCachedMetadata = {
            frontmatter: {
                tags: ["tag1", "tag2"],
                category: "test",
                status: "draft",
                author: "John Doe",
                keywords: ["keyword1", "keyword2"],
            },
        } as any;

        // Setup utility mocks
        (ValidationUtils.isInFrontMatterBlock as jest.Mock).mockReturnValue(true);
        (TextUtils.maybeLowerCase as jest.Mock).mockImplementation((text, ignoreCase) => 
            ignoreCase ? text.toLowerCase() : text
        );
        (EditorUtils.matchWordBackwards as jest.Mock).mockReturnValue({ query: "test" });
        (getAllTags as jest.Mock).mockReturnValue(["#tag1", "#tag2", "#tag3"]);
    });

    describe("Configuration", () => {
        test("should initialize with correct properties", () => {
            expect(FrontMatter.blocksAllOtherProviders).toBe(true);
            expect((FrontMatter as any).fileSuggestionCache).toBeDefined();
        });
    });

    describe("Basic Front Matter Detection", () => {
        test("should return empty array when provider disabled", () => {
            const disabledSettings = { ...settings, frontMatterProviderEnabled: false };
            
            const context: SuggestionContext = {
                editor: mockEditor,
                file: mockFile,
                start: { line: 1, ch: 0 },
                end: { line: 1, ch: 4 },
                query: "test",
                separatorChar: " "
            };

            const suggestions = FrontMatter.getSuggestions(context, disabledSettings);

            expect(suggestions).toEqual([]);
        });

        test("should suggest front matter block when on first line", () => {
            (ValidationUtils.isInFrontMatterBlock as jest.Mock).mockReturnValue(false);
            mockEditor.getLine.mockReturnValue("");
            
            const context: SuggestionContext = {
                editor: mockEditor,
                file: mockFile,
                start: { line: 0, ch: 0 },
                end: { line: 0, ch: 0 },
                query: "",
                separatorChar: " "
            };

            const suggestions = FrontMatter.getSuggestions(context, settings);

            expect(suggestions).toHaveLength(1);
            expect(suggestions[0].displayName).toBe("front-matter");
            expect(suggestions[0].replacement).toBe("---\n~\n---");
        });

        test("should suggest front matter block with partial match", () => {
            (ValidationUtils.isInFrontMatterBlock as jest.Mock).mockReturnValue(false);
            mockEditor.getLine.mockReturnValue("front");
            
            const context: SuggestionContext = {
                editor: mockEditor,
                file: mockFile,
                start: { line: 0, ch: 0 },
                end: { line: 0, ch: 5 },
                query: "front",
                separatorChar: " "
            };

            const suggestions = FrontMatter.getSuggestions(context, settings);

            expect(suggestions).toHaveLength(1);
            expect(suggestions[0].displayName).toBe("front-matter");
        });

        test("should return empty array when not in front matter and not on first line", () => {
            (ValidationUtils.isInFrontMatterBlock as jest.Mock).mockReturnValue(false);
            
            const context: SuggestionContext = {
                editor: mockEditor,
                file: mockFile,
                start: { line: 5, ch: 0 },
                end: { line: 5, ch: 4 },
                query: "test",
                separatorChar: " "
            };

            const suggestions = FrontMatter.getSuggestions(context, settings);

            expect(suggestions).toEqual([]);
        });
    });

    describe("YAML Key Suggestions", () => {
        beforeEach(() => {
            // Setup cache with some data
            mockMetadataCache.getFileCache.mockReturnValue(mockCachedMetadata);
            FrontMatter.loadYAMLKeyCompletions(mockMetadataCache, [mockFile]);
        });

        test("should provide key suggestions at start of line", () => {
            const context: SuggestionContext = {
                editor: mockEditor,
                file: mockFile,
                start: { line: 2, ch: 0 },
                end: { line: 2, ch: 0 },
                query: "",
                separatorChar: " "
            };

            const suggestions = FrontMatter.getSuggestions(context, settings);

            expect(suggestions.length).toBeGreaterThan(0);
            expect(suggestions.some(s => s.displayName.includes("category:"))).toBe(true);
            expect(suggestions.some(s => s.displayName.includes("status:"))).toBe(true);
        });

        test("should filter key suggestions by query", () => {
            mockEditor.getLine.mockReturnValue("cat");
            (EditorUtils.matchWordBackwards as jest.Mock).mockReturnValue({ query: "cat" });
            
            const context: SuggestionContext = {
                editor: mockEditor,
                file: mockFile,
                start: { line: 2, ch: 0 },
                end: { line: 2, ch: 3 },
                query: "cat",
                separatorChar: " "
            };

            const suggestions = FrontMatter.getSuggestions(context, settings);

            expect(suggestions.length).toBeGreaterThan(0);
            expect(suggestions.some(s => s.displayName.includes("category:"))).toBe(true);
            expect(suggestions.every(s => s.displayName.toLowerCase().includes("cat"))).toBe(true);
        });

        test("should provide different formats for list keys", () => {
            mockEditor.getLine.mockReturnValue("key");
            (EditorUtils.matchWordBackwards as jest.Mock).mockReturnValue({ query: "key" });
            
            const context: SuggestionContext = {
                editor: mockEditor,
                file: mockFile,
                start: { line: 2, ch: 0 },
                end: { line: 2, ch: 3 },
                query: "key",
                separatorChar: " "
            };

            const suggestions = FrontMatter.getSuggestions(context, settings);

            // Should have both inline and multiline formats for list keys
            expect(suggestions.some(s => s.displayName.includes("[#]"))).toBe(true);
            expect(suggestions.some(s => s.displayName.includes("\\..."))).toBe(true);
        });

        test("should include publish suggestion", () => {
            const context: SuggestionContext = {
                editor: mockEditor,
                file: mockFile,
                start: { line: 2, ch: 0 },
                end: { line: 2, ch: 0 },
                query: "",
                separatorChar: " "
            };

            const suggestions = FrontMatter.getSuggestions(context, settings);

            expect(suggestions.some(s => s.displayName.includes("publish:"))).toBe(true);
        });
    });

    describe("Publish Key Suggestions", () => {
        test("should provide publish value suggestions", () => {
            mockEditor.getLine.mockReturnValue("publish: ");
            
            const context: SuggestionContext = {
                editor: mockEditor,
                file: mockFile,
                start: { line: 2, ch: 9 },
                end: { line: 2, ch: 9 },
                query: "",
                separatorChar: " "
            };

            const suggestions = FrontMatter.getSuggestions(context, settings);

            expect(suggestions.some(s => s.displayName === "true")).toBe(true);
            expect(suggestions.some(s => s.displayName === "false")).toBe(true);
        });

        test("should filter publish suggestions by query", () => {
            mockEditor.getLine.mockReturnValue("publish: t");
            
            const context: SuggestionContext = {
                editor: mockEditor,
                file: mockFile,
                start: { line: 2, ch: 9 },
                end: { line: 2, ch: 10 },
                query: "t",
                separatorChar: " "
            };

            const suggestions = FrontMatter.getSuggestions(context, settings);

            expect(suggestions.length).toBe(1);
            expect(suggestions[0].displayName).toBe("true");
        });

        test("should prioritize opposite value when exact match", () => {
            mockEditor.getLine.mockReturnValue("publish: true");
            
            const context: SuggestionContext = {
                editor: mockEditor,
                file: mockFile,
                start: { line: 2, ch: 9 },
                end: { line: 2, ch: 13 },
                query: "true",
                separatorChar: " "
            };

            const suggestions = FrontMatter.getSuggestions(context, settings);

            expect(suggestions.length).toBe(2);
            expect(suggestions[0].displayName).toBe("false");
            expect(suggestions[1].displayName).toBe("true");
        });
    });

    describe("Tag Completion", () => {
        beforeEach(() => {
            // Setup cache with tag data
            mockMetadataCache.getFileCache.mockReturnValue(mockCachedMetadata);
            FrontMatter.loadYAMLKeyCompletions(mockMetadataCache, [mockFile]);
        });

        test("should provide tag suggestions for inline format", () => {
            mockEditor.getLine.mockReturnValue("tags: ");
            (EditorUtils.matchWordBackwards as jest.Mock).mockReturnValue({ query: "" });
            
            const context: SuggestionContext = {
                editor: mockEditor,
                file: mockFile,
                start: { line: 2, ch: 6 },
                end: { line: 2, ch: 6 },
                query: "",
                separatorChar: " "
            };

            const suggestions = FrontMatter.getSuggestions(context, settings);

            expect(suggestions.length).toBeGreaterThan(0);
            expect(suggestions.some(s => s.displayName === "tag1")).toBe(true);
            expect(suggestions.some(s => s.displayName === "tag2")).toBe(true);
        });

        test("should provide tag suggestions for multiline format", () => {
            // Ensure mock is set up correctly
            mockMetadataCache.getFileCache.mockReturnValue(mockCachedMetadata);
            (getAllTags as jest.Mock).mockReturnValue(["#tag1", "#tag2", "#tag3"]);
            
            // Populate cache with tags
            FrontMatter.loadYAMLKeyCompletions(mockMetadataCache, [mockFile]);
            
            // Mock specific lines
            mockEditor.getLine
                .mockImplementation((line: number) => {
                    if (line === 2) return "tags:";
                    if (line === 3) return "  - ";
                    return "";
                });
            (EditorUtils.matchWordBackwards as jest.Mock).mockReturnValue({ query: "" });
            (ValidationUtils.isInFrontMatterBlock as jest.Mock).mockReturnValue(true);
            
            const context: SuggestionContext = {
                editor: mockEditor,
                file: mockFile,
                start: { line: 3, ch: 4 },
                end: { line: 3, ch: 4 },
                query: "",
                separatorChar: " "
            };

            const suggestions = FrontMatter.getSuggestions(context, settings);

            expect(suggestions.length).toBeGreaterThan(0);
            expect(suggestions.some(s => s.displayName === "tag1")).toBe(true);
        });

        test("should append comma for inline tags when enabled", () => {
            const tagSettings = { ...settings, frontMatterTagAppendSuffix: true };
            mockEditor.getLine.mockReturnValue("tags: ");
            (EditorUtils.matchWordBackwards as jest.Mock).mockReturnValue({ query: "" });
            (ValidationUtils.isInFrontMatterBlock as jest.Mock).mockReturnValue(true);
            
            const context: SuggestionContext = {
                editor: mockEditor,
                file: mockFile,
                start: { line: 2, ch: 6 },
                end: { line: 2, ch: 6 },
                query: "",
                separatorChar: " "
            };

            const suggestions = FrontMatter.getSuggestions(context, tagSettings);

            expect(suggestions.length).toBeGreaterThan(0);
            expect(suggestions[0].replacement).toContain(", ");
        });

        test("should append new line for multiline tags when enabled", () => {
            const tagSettings = { ...settings, frontMatterTagAppendSuffix: true };
            
            // Ensure mock is set up correctly
            mockMetadataCache.getFileCache.mockReturnValue(mockCachedMetadata);
            (getAllTags as jest.Mock).mockReturnValue(["#tag1", "#tag2", "#tag3"]);
            
            // Populate cache with tags
            FrontMatter.loadYAMLKeyCompletions(mockMetadataCache, [mockFile]);
            
            // Mock specific lines
            mockEditor.getLine
                .mockImplementation((line: number) => {
                    if (line === 2) return "tags:";
                    if (line === 3) return "  - tag1";
                    return "";
                });
            (EditorUtils.matchWordBackwards as jest.Mock).mockReturnValue({ query: "tag1" });
            (ValidationUtils.isInFrontMatterBlock as jest.Mock).mockReturnValue(true);
            
            const context: SuggestionContext = {
                editor: mockEditor,
                file: mockFile,
                start: { line: 3, ch: 4 },
                end: { line: 3, ch: 8 },
                query: "tag1",
                separatorChar: " "
            };

            const suggestions = FrontMatter.getSuggestions(context, tagSettings);

            expect(suggestions.length).toBeGreaterThan(0);
            expect(suggestions[0].replacement).toContain("\n  - ");
        });

        test("should sort suggestions by length", () => {
            mockEditor.getLine.mockReturnValue("tags: ");
            
            const context: SuggestionContext = {
                editor: mockEditor,
                file: mockFile,
                start: { line: 2, ch: 6 },
                end: { line: 2, ch: 6 },
                query: "",
                separatorChar: " "
            };

            const suggestions = FrontMatter.getSuggestions(context, settings);

            // Should be sorted by length
            for (let i = 1; i < suggestions.length; i++) {
                expect(suggestions[i].displayName.length).toBeGreaterThanOrEqual(
                    suggestions[i - 1].displayName.length
                );
            }
        });
    });

    describe("Case Sensitivity", () => {
        test("should handle case insensitive matching", () => {
            const caseSettings = { ...settings, frontMatterIgnoreCase: true };
            
            // Ensure mock is set up correctly
            mockMetadataCache.getFileCache.mockReturnValue(mockCachedMetadata);
            (getAllTags as jest.Mock).mockReturnValue(["#tag1", "#tag2", "#tag3"]);
            
            // Populate cache with tags
            FrontMatter.loadYAMLKeyCompletions(mockMetadataCache, [mockFile]);
            
            mockEditor.getLine.mockReturnValue("tags: TAG");
            (EditorUtils.matchWordBackwards as jest.Mock).mockReturnValue({ query: "TAG" });
            (ValidationUtils.isInFrontMatterBlock as jest.Mock).mockReturnValue(true);
            
            const context: SuggestionContext = {
                editor: mockEditor,
                file: mockFile,
                start: { line: 2, ch: 6 },
                end: { line: 2, ch: 9 },
                query: "TAG",
                separatorChar: " "
            };

            const suggestions = FrontMatter.getSuggestions(context, caseSettings);

            expect(suggestions.length).toBeGreaterThan(0);
            expect(suggestions.some(s => s.displayName === "tag1")).toBe(true);
        });

        test("should handle case sensitive matching", () => {
            mockEditor.getLine.mockReturnValue("tags: TAG");
            
            const context: SuggestionContext = {
                editor: mockEditor,
                file: mockFile,
                start: { line: 2, ch: 6 },
                end: { line: 2, ch: 9 },
                query: "TAG",
                separatorChar: " "
            };

            const suggestions = FrontMatter.getSuggestions(context, settings);

            // Should not match lowercase tags
            expect(suggestions.length).toBe(0);
        });
    });

    describe("Cache Management", () => {
        test("should load YAML key completions from files", () => {
            const files = [mockFile];
            mockMetadataCache.getFileCache.mockReturnValue(mockCachedMetadata);

            FrontMatter.loadYAMLKeyCompletions(mockMetadataCache, files);

            expect(mockMetadataCache.getFileCache).toHaveBeenCalledWith(mockFile);
            expect((FrontMatter as any).fileSuggestionCache.has(mockFile.path)).toBe(true);
        });

        test("should handle files without front matter", () => {
            const files = [mockFile];
            mockMetadataCache.getFileCache.mockReturnValue(null);

            expect(() => {
                FrontMatter.loadYAMLKeyCompletions(mockMetadataCache, files);
            }).not.toThrow();
        });

        test("should handle files with empty front matter", () => {
            const files = [mockFile];
            mockMetadataCache.getFileCache.mockReturnValue({ frontmatter: null });

            expect(() => {
                FrontMatter.loadYAMLKeyCompletions(mockMetadataCache, files);
            }).not.toThrow();
        });

        test("should handle cache change events", () => {
            const newCachedMetadata = {
                frontmatter: {
                    newKey: "newValue",
                    anotherKey: ["item1", "item2"],
                },
            };

            FrontMatter.onCacheChange(mockFile, "data", newCachedMetadata as any);

            expect((FrontMatter as any).fileSuggestionCache.has(mockFile.path)).toBe(true);
        });

        test("should skip reserved keys", () => {
            const metadataWithReserved = {
                frontmatter: {
                    position: { start: 0, end: 10 },
                    publish: true,
                    tags: ["tag1"],
                    customKey: "customValue",
                },
            };

            mockMetadataCache.getFileCache.mockReturnValue(metadataWithReserved);
            FrontMatter.loadYAMLKeyCompletions(mockMetadataCache, [mockFile]);

            const context: SuggestionContext = {
                editor: mockEditor,
                file: mockFile,
                start: { line: 2, ch: 0 },
                end: { line: 2, ch: 0 },
                query: "",
                separatorChar: " "
            };

            const suggestions = FrontMatter.getSuggestions(context, settings);

            // Should not include reserved keys
            expect(suggestions.some(s => s.displayName.includes("position:"))).toBe(false);
            expect(suggestions.some(s => s.displayName.includes("customKey:"))).toBe(true);
        });
    });

    describe("Key Completion Aggregation", () => {
        test("should aggregate completions from multiple files", () => {
            const file1 = { path: "file1.md", name: "file1.md" } as TFile;
            const file2 = { path: "file2.md", name: "file2.md" } as TFile;
            
            const metadata1 = {
                frontmatter: {
                    category: "tech",
                    shared: "value1",
                },
            };
            
            const metadata2 = {
                frontmatter: {
                    author: "Jane",
                    shared: "value2",
                },
            };

            mockMetadataCache.getFileCache
                .mockReturnValueOnce(metadata1)
                .mockReturnValueOnce(metadata2);

            FrontMatter.loadYAMLKeyCompletions(mockMetadataCache, [file1, file2]);

            const context: SuggestionContext = {
                editor: mockEditor,
                file: mockFile,
                start: { line: 2, ch: 0 },
                end: { line: 2, ch: 0 },
                query: "",
                separatorChar: " "
            };

            const suggestions = FrontMatter.getSuggestions(context, settings);

            expect(suggestions.some(s => s.displayName.includes("category:"))).toBe(true);
            expect(suggestions.some(s => s.displayName.includes("author:"))).toBe(true);
            expect(suggestions.some(s => s.displayName.includes("shared:"))).toBe(true);
        });

        test("should handle array and non-array values", () => {
            const metadata = {
                frontmatter: {
                    singleValue: "test",
                    multipleValues: ["item1", "item2"],
                },
            };

            mockMetadataCache.getFileCache.mockReturnValue(metadata);
            FrontMatter.loadYAMLKeyCompletions(mockMetadataCache, [mockFile]);

            const context: SuggestionContext = {
                editor: mockEditor,
                file: mockFile,
                start: { line: 2, ch: 0 },
                end: { line: 2, ch: 0 },
                query: "",
                separatorChar: " "
            };

            const suggestions = FrontMatter.getSuggestions(context, settings);

            // Single value should have single format
            const singleSuggestion = suggestions.find(s => s.displayName.includes("singleValue:"));
            expect(singleSuggestion?.displayName).toBe("singleValue: #");

            // Multiple values should have both formats
            expect(suggestions.some(s => s.displayName.includes("multipleValues: [#]"))).toBe(true);
            expect(suggestions.some(s => s.displayName.includes("multipleValues: \\..."))).toBe(true);
        });
    });

    describe("Edge Cases", () => {
        test("should handle empty query", () => {
            const context: SuggestionContext = {
                editor: mockEditor,
                file: mockFile,
                start: { line: 2, ch: 0 },
                end: { line: 2, ch: 0 },
                query: "",
                separatorChar: " "
            };

            const suggestions = FrontMatter.getSuggestions(context, settings);

            expect(suggestions.length).toBeGreaterThan(0);
        });

        test("should handle null/undefined values in frontmatter", () => {
            const metadata = {
                frontmatter: {
                    nullValue: null as any,
                    undefinedValue: undefined as any,
                    emptyString: "",
                    validValue: "test",
                },
            };

            mockMetadataCache.getFileCache.mockReturnValue(metadata);
            
            expect(() => {
                FrontMatter.loadYAMLKeyCompletions(mockMetadataCache, [mockFile]);
            }).not.toThrow();
        });

        test("should handle special characters in keys", () => {
            const metadata = {
                frontmatter: {
                    "key-with-dash": "value",
                    "key_with_underscore": "value",
                    "key.with.dots": "value",
                },
            };

            mockMetadataCache.getFileCache.mockReturnValue(metadata);
            FrontMatter.loadYAMLKeyCompletions(mockMetadataCache, [mockFile]);

            const context: SuggestionContext = {
                editor: mockEditor,
                file: mockFile,
                start: { line: 2, ch: 0 },
                end: { line: 2, ch: 0 },
                query: "",
                separatorChar: " "
            };

            const suggestions = FrontMatter.getSuggestions(context, settings);

            expect(suggestions.some(s => s.displayName.includes("key-with-dash:"))).toBe(true);
            expect(suggestions.some(s => s.displayName.includes("key_with_underscore:"))).toBe(true);
            expect(suggestions.some(s => s.displayName.includes("key.with.dots:"))).toBe(true);
        });

        test("should handle Unicode characters in values", () => {
            const metadata = {
                frontmatter: {
                    unicode: "测试 🎉 éñüḯøđė",
                    emoji: ["🚀", "⭐", "🎯"],
                },
            };

            mockMetadataCache.getFileCache.mockReturnValue(metadata);
            
            expect(() => {
                FrontMatter.loadYAMLKeyCompletions(mockMetadataCache, [mockFile]);
            }).not.toThrow();
        });
    });

    describe("Tag Processing", () => {
        test("should extract tags using getAllTags", () => {
            const metadata = {
                frontmatter: {
                    tags: ["existing1", "existing2"],
                },
            };

            mockMetadataCache.getFileCache.mockReturnValue(metadata);
            (getAllTags as jest.Mock).mockReturnValue(["#tag1", "#tag2", "#tag3"]);

            FrontMatter.loadYAMLKeyCompletions(mockMetadataCache, [mockFile]);

            const context: SuggestionContext = {
                editor: mockEditor,
                file: mockFile,
                start: { line: 2, ch: 6 },
                end: { line: 2, ch: 6 },
                query: "",
                separatorChar: " "
            };

            mockEditor.getLine.mockReturnValue("tags: ");
            (EditorUtils.matchWordBackwards as jest.Mock).mockReturnValue({ query: "" });
            (ValidationUtils.isInFrontMatterBlock as jest.Mock).mockReturnValue(true);

            const suggestions = FrontMatter.getSuggestions(context, settings);

            expect(suggestions.some(s => s.displayName === "tag1")).toBe(true);
            expect(suggestions.some(s => s.displayName === "tag2")).toBe(true);
            expect(suggestions.some(s => s.displayName === "tag3")).toBe(true);
        });

        test("should handle empty tag arrays", () => {
            const metadata = {
                frontmatter: {
                    tags: [] as any[],
                },
            };

            mockMetadataCache.getFileCache.mockReturnValue(metadata);
            (getAllTags as jest.Mock).mockReturnValue([]);

            expect(() => {
                FrontMatter.loadYAMLKeyCompletions(mockMetadataCache, [mockFile]);
            }).not.toThrow();
        });

        test("should strip # prefix from tags", () => {
            const metadata = {
                frontmatter: {
                    tags: ["existing"],
                },
            };

            mockMetadataCache.getFileCache.mockReturnValue(metadata);
            (getAllTags as jest.Mock).mockReturnValue(["#prefixed-tag"]);

            FrontMatter.loadYAMLKeyCompletions(mockMetadataCache, [mockFile]);

            const context: SuggestionContext = {
                editor: mockEditor,
                file: mockFile,
                start: { line: 2, ch: 6 },
                end: { line: 2, ch: 6 },
                query: "",
                separatorChar: " "
            };

            mockEditor.getLine.mockReturnValue("tags: ");
            (EditorUtils.matchWordBackwards as jest.Mock).mockReturnValue({ query: "" });
            (ValidationUtils.isInFrontMatterBlock as jest.Mock).mockReturnValue(true);

            const suggestions = FrontMatter.getSuggestions(context, settings);

            expect(suggestions.some(s => s.displayName === "prefixed-tag")).toBe(true);
            expect(suggestions.some(s => s.displayName === "#prefixed-tag")).toBe(false);
        });
    });
}); 