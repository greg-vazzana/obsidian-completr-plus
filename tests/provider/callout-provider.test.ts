import { Editor, Notice, Vault } from "obsidian";
import { Callout, loadSuggestionsFromFile } from "../../src/provider/callout_provider";
import { CompletrSettings, DEFAULT_SETTINGS, CalloutProviderSource } from "../../src/settings";
import { SuggestionIgnorelist } from "../../src/provider/ignorelist";
import { SuggestionContext, Suggestion } from "../../src/provider/provider";
import { CONFIG_FILES, PATTERNS, ERROR_NOTICE_DURATION_MS } from "../../src/constants";
import CompletrPlugin from "../../src/main";

// Mock dependencies
jest.mock("obsidian");
jest.mock("obsidian-callout-manager");
jest.mock("../../src/provider/ignorelist");
jest.mock("../../src/constants");

describe("CalloutSuggestionProvider", () => {
    let mockVault: jest.Mocked<Vault>;
    let mockEditor: jest.Mocked<Editor>;
    let mockPlugin: jest.Mocked<CompletrPlugin>;
    let settings: CompletrSettings;
    let mockCalloutManagerApi: any;

    beforeEach(() => {
        // Clear all mocks
        jest.clearAllMocks();
        
        // Reset Callout's internal state and initialize with default suggestions
        (Callout as any).loadedSuggestions = [
            new Suggestion("Note", "note"),
            new Suggestion("Warning", "warning"),
            new Suggestion("Tip", "tip"),
            new Suggestion("Abstract", "abstract"),
            new Suggestion("Info", "info"),
            new Suggestion("Success", "success"),
            new Suggestion("Question", "question"),
            new Suggestion("Failure", "failure"),
            new Suggestion("Danger", "danger"),
            new Suggestion("Bug", "bug"),
            new Suggestion("Example", "example"),
            new Suggestion("Quote", "quote"),
            new Suggestion("Important", "important"),
            new Suggestion("Attention", "attention"),
            new Suggestion("Caution", "caution"),
            new Suggestion("Error", "error"),
            new Suggestion("Missing", "missing"),
            new Suggestion("Check", "check"),
            new Suggestion("Done", "done"),
            new Suggestion("Help", "help"),
            new Suggestion("FAQ", "faq"),
            new Suggestion("Tldr", "tldr"),
            new Suggestion("Todo", "todo"),
            new Suggestion("Summary", "summary"),
            new Suggestion("Conclusion", "conclusion"),
        ];

        // Mock vault with properly typed methods
        mockVault = {
            adapter: {
                read: jest.fn().mockResolvedValue("[]") as jest.Mock,
                write: jest.fn().mockResolvedValue(undefined) as jest.Mock,
                exists: jest.fn().mockResolvedValue(true) as jest.Mock,
            },
        } as any;

        // Mock editor
        mockEditor = {
            getLine: jest.fn(),
            getCursor: jest.fn().mockReturnValue({ line: 0, ch: 5 }),
        } as any;

        // Mock plugin
        mockPlugin = {
            settings: {
                ...DEFAULT_SETTINGS,
                calloutProviderEnabled: true,
                calloutProviderSource: CalloutProviderSource.COMPLETR,
            },
        } as any;

        // Default settings
        settings = {
            ...DEFAULT_SETTINGS,
            calloutProviderEnabled: true,
        };

        // Mock callout manager API
        mockCalloutManagerApi = {
            on: jest.fn(),
            off: jest.fn(),
            getCallouts: jest.fn().mockReturnValue([
                { id: "note", icon: "pencil", color: "255,0,0" },
                { id: "warning", icon: "alert-triangle", color: "255,255,0" },
            ]),
        };

        // Setup mocks
        (SuggestionIgnorelist.filter as jest.Mock).mockImplementation((suggestions) => suggestions);
        (CONFIG_FILES.CALLOUT_SUGGESTIONS as any) = "callout_suggestions.json";
        
        // Set up working regex patterns
        (PATTERNS.BLOCKQUOTE_PREFIX as any) = {
            exec: jest.fn().mockImplementation((line: string) => {
                const match = line.match(/^(?:[ \t]*>[ \t]*)+/);
                if (match) {
                    return match; // Return the full match array
                }
                return null;
            })
        };
        
        (PATTERNS.CALLOUT_HEADER as any) = {
            exec: jest.fn().mockImplementation((line: string) => {
                // Real pattern: /^(\[!?([^\]]*)\])([+-]?)([ \t]*)(.*)$/d
                const match = line.match(/^(\[!?([^\]]*)\])([+-]?)([ \t]*)(.*)$/);
                if (match) {
                    const result = [...match] as any;
                    // Calculate indices to match ES2022 'd' flag behavior
                    // Groups: [full, group1, group2, group3, group4, group5]
                    result.indices = [
                        [0, match[0].length],                    // Full match
                        [0, match[1].length],                    // Group 1: [!type]
                        [2, 2 + match[2].length],               // Group 2: type text
                        [match[1].length, match[1].length + match[3].length], // Group 3: foldable
                        [match[1].length + match[3].length, match[1].length + match[3].length + match[4].length], // Group 4: whitespace
                        [match[1].length + match[3].length + match[4].length, match[0].length] // Group 5: title
                    ];
                    return result;
                }
                return null;
            })
        };
        
        (PATTERNS.CALLOUT_HEADER_PARTIAL as any) = {
            exec: jest.fn().mockImplementation((line: string) => {
                // Real pattern: /^(\[!?([^\]]*))$/d
                const match = line.match(/^(\[!?([^\]]*))$/);
                if (match) {
                    const result = [...match] as any;
                    // Calculate indices to match ES2022 'd' flag behavior
                    // Groups: [full, group1, group2]
                    result.indices = [
                        [0, match[0].length],                    // Full match
                        [0, match[1].length],                    // Group 1: [!type (partial)
                        [2, 2 + match[2].length]                // Group 2: type text
                    ];
                    return result;
                }
                return null;
            })
        };
        
        (ERROR_NOTICE_DURATION_MS as any) = 5000;

        // Mock getApi from obsidian-callout-manager
        const { getApi } = require("obsidian-callout-manager");
        getApi.mockResolvedValue(mockCalloutManagerApi);
    });

    describe("Constructor and Configuration", () => {
        test("should initialize with correct properties", () => {
            expect(Callout.blocksAllOtherProviders).toBe(true);
            expect((Callout as any).loadedSuggestions.length).toBeGreaterThan(0);
        });
    });

    describe("Block Quote Detection", () => {
        test("should return empty array when not in block quote", () => {
            mockEditor.getLine.mockReturnValue("This is regular text");
            
            const context: SuggestionContext = {
                editor: mockEditor,
                file: {} as any,
                start: { line: 0, ch: 0 },
                end: { line: 0, ch: 4 },
                query: "test",
                separatorChar: " "
            };

            const suggestions = Callout.getSuggestions(context, settings);

            expect(suggestions).toEqual([]);
        });

        test("should return empty array when provider disabled", () => {
            const disabledSettings = { ...settings, calloutProviderEnabled: false };
            mockEditor.getLine.mockReturnValue("> [!note]");
            
            const context: SuggestionContext = {
                editor: mockEditor,
                file: {} as any,
                start: { line: 0, ch: 0 },
                end: { line: 0, ch: 4 },
                query: "test",
                separatorChar: " "
            };

            const suggestions = Callout.getSuggestions(context, disabledSettings);

            expect(suggestions).toEqual([]);
        });

        test("should detect single-level block quote", () => {
            // Set up loaded suggestions
            (Callout as any).loadedSuggestions = [
                new Suggestion("Note", "note"),
                new Suggestion("Warning", "warning"),
                new Suggestion("Tip", "tip"),
            ];
            
            const line = "> [!no";
            mockEditor.getLine.mockReturnValue(line);
            
            // Set cursor position to be within the callout type area
            // Line: "> [!no"
            //       0123456
            // Cursor at position 6 (after "no")
            // Blockquote prefix "> " ends at position 2
            // So cursor relative to callout content is at position 4 (6 - 2)
            // Callout content "[!no" - cursor should be inside the "no" part
            mockEditor.getCursor.mockReturnValue({ line: 0, ch: 6 });
            
            const context: SuggestionContext = {
                editor: mockEditor,
                file: {} as any,
                start: { line: 0, ch: 4 },  // Position after "> [!"
                end: { line: 0, ch: 6 },    // Position after "> [!no"
                query: "no",
                separatorChar: " "
            };

            const suggestions = Callout.getSuggestions(context, settings);

            expect(suggestions.length).toBeGreaterThan(0);
            expect(suggestions[0].replacement).toContain("[!note]");
        });

        test("should handle multi-level block quotes", () => {
            // Set up loaded suggestions
            (Callout as any).loadedSuggestions = [
                new Suggestion("Note", "note"),
                new Suggestion("Warning", "warning"),
                new Suggestion("Tip", "tip"),
            ];
            
            mockEditor.getLine.mockReturnValue("> > > [!war");
            mockEditor.getCursor.mockReturnValue({ line: 0, ch: 10 });
            
            const context: SuggestionContext = {
                editor: mockEditor,
                file: {} as any,
                start: { line: 0, ch: 6 },
                end: { line: 0, ch: 10 },
                query: "war",
                separatorChar: " "
            };

            const suggestions = Callout.getSuggestions(context, settings);

            expect(suggestions.length).toBeGreaterThan(0);
            expect(suggestions[0].replacement).toContain("[!warning]");
        });

        test("should reject continuation of block quote", () => {
            mockEditor.getLine
                .mockReturnValueOnce("> > > [!note]") // previous line
                .mockReturnValueOnce("> > > [!war"); // current line
            
            const context: SuggestionContext = {
                editor: mockEditor,
                file: {} as any,
                start: { line: 1, ch: 6 },
                end: { line: 1, ch: 10 },
                query: "war",
                separatorChar: " "
            };

            const suggestions = Callout.getSuggestions(context, settings);

            expect(suggestions).toEqual([]);
        });
    });

    describe("Callout Header Parsing", () => {
        test("should parse complete callout header", () => {
            mockEditor.getLine.mockReturnValue("> [!note|+] Title here");
            mockEditor.getCursor.mockReturnValue({ line: 0, ch: 8 });
            
            (Callout as any).loadedSuggestions = [
                new Suggestion("Note", "note"),
            ];
            
            const context: SuggestionContext = {
                editor: mockEditor,
                file: {} as any,
                start: { line: 0, ch: 2 },
                end: { line: 0, ch: 8 },
                query: "note",
                separatorChar: " "
            };

            const suggestions = Callout.getSuggestions(context, settings);

            expect(suggestions.length).toBeGreaterThan(0);
            expect(suggestions[0].replacement).toContain("[!note]");
            expect(suggestions[0].replacement).toContain("Title here");
        });

        test("should parse partial callout header", () => {
            mockEditor.getLine.mockReturnValue("> [!not");
            mockEditor.getCursor.mockReturnValue({ line: 0, ch: 7 });
            
            (Callout as any).loadedSuggestions = [
                new Suggestion("Note", "note"),
            ];
            
            const context: SuggestionContext = {
                editor: mockEditor,
                file: {} as any,
                start: { line: 0, ch: 2 },
                end: { line: 0, ch: 7 },
                query: "not",
                separatorChar: " "
            };

            const suggestions = Callout.getSuggestions(context, settings);

            expect(suggestions.length).toBeGreaterThan(0);
        });

        test("should handle cursor outside callout type area", () => {
            mockEditor.getLine.mockReturnValue("> [!note] Some title");
            mockEditor.getCursor.mockReturnValue({ line: 0, ch: 15 }); // In title area
            
            const context: SuggestionContext = {
                editor: mockEditor,
                file: {} as any,
                start: { line: 0, ch: 2 },
                end: { line: 0, ch: 7 },
                query: "note",
                separatorChar: " "
            };

            const suggestions = Callout.getSuggestions(context, settings);

            expect(suggestions).toEqual([]);
        });
    });

    describe("Suggestion Generation", () => {
        beforeEach(() => {
            (Callout as any).loadedSuggestions = [
                new Suggestion("Note", "note"),
                new Suggestion("Warning", "warning"),
                new Suggestion("Tip", "tip"),
            ];
        });

        test("should filter suggestions by display name", () => {
            mockEditor.getLine.mockReturnValue("> [!war");
            mockEditor.getCursor.mockReturnValue({ line: 0, ch: 7 });
            
            const context: SuggestionContext = {
                editor: mockEditor,
                file: {} as any,
                start: { line: 0, ch: 2 },
                end: { line: 0, ch: 7 },
                query: "war",
                separatorChar: " "
            };

            const suggestions = Callout.getSuggestions(context, settings);

            expect(suggestions.length).toBe(1);
            expect(suggestions[0].replacement).toContain("[!warning]");
        });

        test("should filter suggestions by replacement text", () => {
            mockEditor.getLine.mockReturnValue("> [!tip");
            mockEditor.getCursor.mockReturnValue({ line: 0, ch: 6 });
            
            const context: SuggestionContext = {
                editor: mockEditor,
                file: {} as any,
                start: { line: 0, ch: 2 },
                end: { line: 0, ch: 6 },
                query: "tip",
                separatorChar: " "
            };

            const suggestions = Callout.getSuggestions(context, settings);

            expect(suggestions.length).toBe(1);
            expect(suggestions[0].replacement).toContain("[!tip]");
        });

        test("should set correct override positions", () => {
            // Set up loaded suggestions
            (Callout as any).loadedSuggestions = [
                new Suggestion("Note", "note"),
                new Suggestion("Warning", "warning"),
                new Suggestion("Tip", "tip"),
            ];
            
            mockEditor.getLine.mockReturnValue("> [!note] Title");
            mockEditor.getCursor.mockReturnValue({ line: 0, ch: 8 });
            
            const context: SuggestionContext = {
                editor: mockEditor,
                file: {} as any,
                start: { line: 0, ch: 2 },
                end: { line: 0, ch: 8 },
                query: "note",
                separatorChar: " "
            };

            const suggestions = Callout.getSuggestions(context, settings);

            expect(suggestions.length).toBeGreaterThan(0);
            expect(suggestions[0].overrideStart).toEqual({ line: 0, ch: 2 });
            expect(suggestions[0].overrideEnd).toEqual({ line: 0, ch: 15 });
        });
    });

    describe("Suggestion Loading", () => {
        test("should load suggestions using Completr source", async () => {
            mockPlugin.settings.calloutProviderSource = CalloutProviderSource.COMPLETR;
            (mockVault.adapter.exists as jest.Mock).mockResolvedValue(true);
            (mockVault.adapter.read as jest.Mock).mockResolvedValue(JSON.stringify([
                { displayName: "Custom Note", replacement: "custom-note" }
            ]));

            await Callout.loadSuggestions(mockVault, mockPlugin);

            expect(mockVault.adapter.read).toHaveBeenCalled();
            expect((Callout as any).loadedSuggestions.length).toBeGreaterThan(0);
        });

        test("should load suggestions using Callout Manager", async () => {
            mockPlugin.settings.calloutProviderSource = CalloutProviderSource.CALLOUT_MANAGER;

            await Callout.loadSuggestions(mockVault, mockPlugin);

            expect(mockCalloutManagerApi.on).toHaveBeenCalledWith('change', expect.any(Function));
            expect(mockCalloutManagerApi.getCallouts).toHaveBeenCalled();
            expect((Callout as any).loadedSuggestions.length).toBe(2);
        });

        test("should fall back to Completr when Callout Manager unavailable", async () => {
            const { getApi } = require("obsidian-callout-manager");
            getApi.mockResolvedValue(null);
            
            (mockVault.adapter.exists as jest.Mock).mockResolvedValue(false);

            await Callout.loadSuggestions(mockVault, mockPlugin);

            expect(mockVault.adapter.write).toHaveBeenCalled(); // Should create default file
        });

        test("should create default suggestions file when missing", async () => {
            (mockVault.adapter.exists as jest.Mock).mockResolvedValue(false);

            await (Callout as any).loadSuggestionsUsingCompletr(mockVault);

            expect(mockVault.adapter.write).toHaveBeenCalled();
            expect((Callout as any).loadedSuggestions.length).toBeGreaterThan(0);
        });

        test("should handle file parsing errors", async () => {
            (mockVault.adapter.exists as jest.Mock).mockResolvedValue(true);
            (mockVault.adapter.read as jest.Mock).mockResolvedValue("invalid json");
            
            const OriginalNotice = Notice;
            const noticeSpy = jest.fn();
            (Notice as any) = noticeSpy;

            await (Callout as any).loadSuggestionsUsingCompletr(mockVault);

            expect(noticeSpy).toHaveBeenCalled();
            expect((Callout as any).loadedSuggestions.length).toBeGreaterThan(0); // Should fall back to defaults
            
            // Restore original Notice
            (Notice as any) = OriginalNotice;
        });

        test("should apply ignore list filter", async () => {
            (SuggestionIgnorelist.filter as jest.Mock).mockImplementation((suggestions) => {
                return suggestions.filter((s: Suggestion) => s.displayName !== "Note");
            });

            await (Callout as any).loadSuggestionsUsingCompletr(mockVault);

            expect(SuggestionIgnorelist.filter).toHaveBeenCalled();
        });
    });

    describe("File Parsing", () => {
        test("should parse valid suggestions file", async () => {
            const validData = [
                { displayName: "Custom", replacement: "custom", icon: "star", color: "#ff0000" },
                "simple-string-suggestion"
            ];
            (mockVault.adapter.read as jest.Mock).mockResolvedValue(JSON.stringify(validData));

            const suggestions = await loadSuggestionsFromFile(mockVault, "test.json", {
                allowIcons: true,
                allowColors: true
            });

            expect(suggestions.length).toBe(2);
            expect(suggestions[0].displayName).toBe("Custom");
            expect(suggestions[0].icon).toBe("star");
            expect(suggestions[0].color).toBe("#ff0000");
            expect(suggestions[1].displayName).toBe("simple-string-suggestion");
        });

        test("should strip icons when not allowed", async () => {
            const validData = [
                { displayName: "Custom", replacement: "custom", icon: "star", color: "#ff0000" }
            ];
            (mockVault.adapter.read as jest.Mock).mockResolvedValue(JSON.stringify(validData));

            const suggestions = await loadSuggestionsFromFile(mockVault, "test.json", {
                allowIcons: false,
                allowColors: true
            });

            expect(suggestions[0].icon).toBeUndefined();
            expect(suggestions[0].color).toBe("#ff0000");
        });

        test("should strip colors when not allowed", async () => {
            const validData = [
                { displayName: "Custom", replacement: "custom", icon: "star", color: "#ff0000" }
            ];
            (mockVault.adapter.read as jest.Mock).mockResolvedValue(JSON.stringify(validData));

            const suggestions = await loadSuggestionsFromFile(mockVault, "test.json", {
                allowIcons: true,
                allowColors: false
            });

            expect(suggestions[0].icon).toBe("star");
            expect(suggestions[0].color).toBeUndefined();
        });

        test("should reject invalid JSON", async () => {
            (mockVault.adapter.read as jest.Mock).mockResolvedValue("invalid json");

            await expect(loadSuggestionsFromFile(mockVault, "test.json")).rejects.toThrow("Failed to parse file test.json");
        });

        test("should reject non-array JSON", async () => {
            (mockVault.adapter.read as jest.Mock).mockResolvedValue('{"not": "array"}');

            await expect(loadSuggestionsFromFile(mockVault, "test.json")).rejects.toThrow("Invalid suggestions file test.json: JSON root must be array");
        });

        test("should reject suggestions with newlines in display name", async () => {
            const invalidData = [
                { displayName: "Invalid\nNewline", replacement: "invalid" }
            ];
            (mockVault.adapter.read as jest.Mock).mockResolvedValue(JSON.stringify(invalidData));

            await expect(loadSuggestionsFromFile(mockVault, "test.json")).rejects.toThrow("Display name cannot contain a newline");
        });
    });

    describe("Default Suggestions", () => {
        test("should generate default callout suggestions", async () => {
            // Mock that the file doesn't exist to trigger default generation
            (mockVault.adapter.exists as jest.Mock).mockResolvedValue(false);
            
            await (Callout as any).loadSuggestionsUsingCompletr(mockVault);

            const suggestions = (Callout as any).loadedSuggestions;
            expect(suggestions.length).toBeGreaterThan(20); // Should have many default suggestions
            
            const noteExists = suggestions.some((s: Suggestion) => s.displayName === "Note");
            const warningExists = suggestions.some((s: Suggestion) => s.displayName === "Warning");
            expect(noteExists).toBe(true);
            expect(warningExists).toBe(true);
        });
    });

    describe("Callout Manager Integration", () => {
        test("should register change listener", async () => {
            mockPlugin.settings.calloutProviderSource = CalloutProviderSource.CALLOUT_MANAGER;

            await Callout.loadSuggestions(mockVault, mockPlugin);

            expect(mockCalloutManagerApi.on).toHaveBeenCalledWith('change', expect.any(Function));
        });

        test("should unregister previous listener", async () => {
            await Callout.loadSuggestions(mockVault, mockPlugin);

            expect(mockCalloutManagerApi.off).toHaveBeenCalledWith('change', expect.any(Function));
        });

        test("should convert callout manager data to suggestions", async () => {
            await (Callout as any).loadSuggestionsUsingCalloutManager();

            const suggestions = (Callout as any).loadedSuggestions;
            expect(suggestions.length).toBe(2);
            expect(suggestions[0].displayName).toBe("note");
            expect(suggestions[0].replacement).toBe("note");
            expect(suggestions[0].icon).toBe("pencil");
            expect(suggestions[0].color).toBe("rgb(255,0,0)");
        });

        test("should sort suggestions alphabetically", async () => {
            mockCalloutManagerApi.getCallouts.mockReturnValue([
                { id: "zebra", icon: "z", color: "0,0,0" },
                { id: "alpha", icon: "a", color: "0,0,0" },
            ]);

            await (Callout as any).loadSuggestionsUsingCalloutManager();

            const suggestions = (Callout as any).loadedSuggestions;
            expect(suggestions[0].displayName).toBe("alpha");
            expect(suggestions[1].displayName).toBe("zebra");
        });
    });

    describe("Edge Cases", () => {
        test("should handle empty callout type", () => {
            mockEditor.getLine.mockReturnValue("> [!");
            
            const context: SuggestionContext = {
                editor: mockEditor,
                file: {} as any,
                start: { line: 0, ch: 2 },
                end: { line: 0, ch: 4 },
                query: "",
                separatorChar: " "
            };

            const suggestions = Callout.getSuggestions(context, settings);

            expect(suggestions).toEqual([]);
        });

        test("should handle malformed block quote", () => {
            // Use a truly malformed block quote that doesn't match the pattern
            // Pattern requires at least one >, but this has none
            mockEditor.getLine.mockReturnValue("not a block quote [!note");
            
            const context: SuggestionContext = {
                editor: mockEditor,
                file: {} as any,
                start: { line: 0, ch: 0 },
                end: { line: 0, ch: 4 },
                query: "note",
                separatorChar: " "
            };

            const suggestions = Callout.getSuggestions(context, settings);

            expect(suggestions).toEqual([]);
        });

        test("should handle case-insensitive matching", () => {
            const caseSettings = { ...settings, calloutIgnoreCase: true };
            
            mockEditor.getLine.mockReturnValue("> [!NOT");
            mockEditor.getCursor.mockReturnValue({ line: 0, ch: 7 });
            
            (Callout as any).loadedSuggestions = [
                new Suggestion("Note", "note"),
            ];
            
            const context: SuggestionContext = {
                editor: mockEditor,
                file: {} as any,
                start: { line: 0, ch: 2 },
                end: { line: 0, ch: 7 },
                query: "NOT",
                separatorChar: " "
            };

            const suggestions = Callout.getSuggestions(context, caseSettings);

            expect(suggestions.length).toBe(1);
            expect(suggestions[0].replacement).toContain("[!note]");
        });

        test("should preserve foldable markers", () => {
            mockEditor.getLine.mockReturnValue("> [!note]+ Title");
            mockEditor.getCursor.mockReturnValue({ line: 0, ch: 8 });
            
            (Callout as any).loadedSuggestions = [
                new Suggestion("Note", "note"),
            ];
            
            const context: SuggestionContext = {
                editor: mockEditor,
                file: {} as any,
                start: { line: 0, ch: 2 },
                end: { line: 0, ch: 8 },
                query: "note",
                separatorChar: " "
            };

            const suggestions = Callout.getSuggestions(context, settings);

            expect(suggestions.length).toBeGreaterThan(0);
            expect(suggestions[0].replacement).toContain("]+ Title");
        });
    });
}); 