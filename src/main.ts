import { EditorPosition, KeymapContext, MarkdownView, Notice, Plugin, TFile, } from "obsidian";
import SnippetManager from "./snippet_manager";
import SuggestionPopup, { SelectionDirection } from "./popup";
import { CompletrSettings, DEFAULT_SETTINGS } from "./settings";
import { WordList } from "./provider/word_list_provider";
import { Scanner } from "./provider/scanner_provider";
import CompletrSettingsTab from "./settings_tab";
import { EditorView, ViewUpdate } from "@codemirror/view";
import { editorToCodeMirrorState, posFromIndex } from "./editor_helpers";
import { markerStateField } from "./marker_state_field";
import { FrontMatter } from "./provider/front_matter_provider";
import { Latex } from "./provider/latex_provider";
import { Callout } from "./provider/callout_provider";
import { SuggestionIgnorelist } from "./provider/ignorelist";
import PeriodInserter from "./period_inserter";
import NLPCapitalizer from "./nlp_capitalizer";
import { DatabaseService } from "./db/database";
import { WordPatterns } from "./word_patterns";

class LiveWordTracker {
    private db: DatabaseService | null = null;
    private settings: CompletrSettings;
    private batchUpdates: Map<string, number> = new Map();
    private batchTimeout: NodeJS.Timeout | null = null;
    private readonly BATCH_DELAY_MS = 1000; // 1 second delay for batching

    constructor(settings: CompletrSettings) {
        this.settings = settings;
    }

    private debugLog(message: string, ...args: any[]) {
        if (this.settings.debugCapitalization) {
            console.log(message, ...args);
        }
    }

    setDatabase(db: DatabaseService) {
        this.db = db;
    }

    updateSettings(settings: CompletrSettings) {
        this.settings = settings;
    }

    async trackWordCompletion(editor: any, oldCursor: EditorPosition, newCursor: EditorPosition): Promise<void> {
        if (!this.db || !this.settings.scanEnabled || !this.settings.liveWordTracking) {
            this.debugLog('LiveWordTracker: Skipping - db:', !!this.db, 'scanEnabled:', this.settings.scanEnabled, 'liveWordTracking:', this.settings.liveWordTracking);
            return;
        }

        const isLineChange = newCursor.line !== oldCursor.line;
        const isBackwardMovement = !isLineChange && newCursor.ch <= oldCursor.ch;
        
        // Skip only backward movement on the same line (navigation)
        if (isBackwardMovement) {
            this.debugLog('LiveWordTracker: Skipping - backward movement on same line');
            return;
        }

        let currentChar: string;
        let checkCursor: EditorPosition;
        
        if (isLineChange) {
            // Line changed - check for completed word at the end of the OLD line
            if (oldCursor.ch === 0) {
                this.debugLog('LiveWordTracker: Skipping - old cursor was at beginning of line');
                return;
            }
            
            // Simulate newline character as the completion trigger
            currentChar = '\n';
            checkCursor = oldCursor;
            this.debugLog('LiveWordTracker: Line change detected - checking old line for completed word');
        } else {
            // Same line - normal logic
            if (newCursor.ch === 0) {
                this.debugLog('LiveWordTracker: Skipping - cursor at beginning of line');
                return;
            }
            
            currentChar = editor.getRange(
                { line: newCursor.line, ch: newCursor.ch - 1 },
                { line: newCursor.line, ch: newCursor.ch }
            );
            checkCursor = newCursor;
        }

        this.debugLog('LiveWordTracker: Current char:', currentChar.replace(/\n/g, '\\n'), 'isWordChar:', this.isWordCharacter(currentChar));

        // If current character is not a word character, we might have completed a word
        if (!this.isWordCharacter(currentChar)) {
            const completedWord = this.extractCompletedWord(editor, checkCursor);
            this.debugLog('LiveWordTracker: Completed word:', completedWord);
            if (completedWord && completedWord.length >= this.settings.minWordLength) {
                this.debugLog('LiveWordTracker: Incrementing frequency for:', completedWord);
                await this.incrementWordFrequency(completedWord);
            }
        }
    }

    private isWordCharacter(char: string): boolean {
        return WordPatterns.isWordCharacter(char);
    }

    private extractCompletedWord(editor: any, cursor: EditorPosition): string | null {
        const line = editor.getLine(cursor.line);
        this.debugLog('LiveWordTracker: Line:', line, 'Cursor ch:', cursor.ch);
        
        const word = WordPatterns.findWordAtPosition(line, cursor.ch - 1);
        
        if (word && word.length >= this.settings.minWordLength) {
            this.debugLog('LiveWordTracker: Extracted word:', `"${word}"`, 'using WordPatterns');
            return word;
        }
        
        this.debugLog('LiveWordTracker: No valid word found at cursor position');
        return null;
    }

    private async incrementWordFrequency(word: string): Promise<void> {
        if (!this.db) return;

        // Check ignore list
        if (SuggestionIgnorelist.hasText(word)) {
            return;
        }

        try {
            // Get scan source ID
            const scanSourceId = await this.db.getScanSourceId();
            if (!scanSourceId) return;

            // Add to batch updates
            const currentCount = this.batchUpdates.get(word) || 0;
            this.batchUpdates.set(word, currentCount + 1);

            // Update in-memory frequency immediately for Scanner provider
            Scanner.incrementWordFrequency(word);

            // Schedule batch database update
            this.scheduleBatchUpdate(scanSourceId);

        } catch (error) {
            console.error('Error tracking word completion:', error);
        }
    }

    private scheduleBatchUpdate(scanSourceId: number): void {
        if (this.batchTimeout) {
            clearTimeout(this.batchTimeout);
        }

        this.batchTimeout = setTimeout(async () => {
            await this.flushBatchUpdates(scanSourceId);
        }, this.BATCH_DELAY_MS);
    }

    private async flushBatchUpdates(scanSourceId: number): Promise<void> {
        if (!this.db || this.batchUpdates.size === 0) {
            return;
        }

        try {
            // Process all batched updates
            for (const [word, incrementBy] of this.batchUpdates) {
                await this.db.addOrIncrementWord(word, scanSourceId, incrementBy);
            }

            // Clear the batch
            this.batchUpdates.clear();
            this.batchTimeout = null;

        } catch (error) {
            console.error('Error flushing batch updates:', error);
        }
    }

    async onUnload(): Promise<void> {
        // Flush any pending updates before unloading
        if (this.batchTimeout) {
            clearTimeout(this.batchTimeout);
            const scanSourceId = await this.db?.getScanSourceId();
            if (scanSourceId) {
                await this.flushBatchUpdates(scanSourceId);
            }
        }
    }
}

export default class CompletrPlugin extends Plugin {

    settings: CompletrSettings;

    private snippetManager: SnippetManager;
    private _suggestionPopup: SuggestionPopup;
    private _periodInserter: PeriodInserter;
    private _nlpCapitalizer: NLPCapitalizer;
    private _liveWordTracker: LiveWordTracker;
    private _cursorActivityListener: CursorActivityListener;

    async onload() {
        this.snippetManager = new SnippetManager();
        this._periodInserter = new PeriodInserter();
        this._nlpCapitalizer = new NLPCapitalizer(); // Will be configured after loadSettings
        
        // Initialize LiveWordTracker early so it's available in loadSettings
        this._liveWordTracker = new LiveWordTracker(DEFAULT_SETTINGS); // Use defaults initially
        
        await this.loadSettings();

        this._suggestionPopup = new SuggestionPopup(this.app, this.settings, this.snippetManager);

        this.registerEditorSuggest(this._suggestionPopup);

        this.registerEvent(this.app.workspace.on('file-open', this.onFileOpened, this));
        this.registerEvent(this.app.metadataCache.on('changed', FrontMatter.onCacheChange, FrontMatter));
        this.app.workspace.onLayoutReady(() => FrontMatter.loadYAMLKeyCompletions(this.app.metadataCache, this.app.vault.getMarkdownFiles()));

        this.registerEditorExtension(markerStateField);
        this._cursorActivityListener = new CursorActivityListener(this.snippetManager, this._suggestionPopup, this._periodInserter, this._nlpCapitalizer, this._liveWordTracker, this);
        this.registerEditorExtension(EditorView.updateListener.of(this._cursorActivityListener.listener));

        this.addSettingTab(new CompletrSettingsTab(this.app, this));

        this.setupCommands();
        this.setupContextMenu();

        if ((this.app.vault as any).config?.legacyEditor) {
            // This is an important warning, but respect debug setting
            if (this.settings.debugCapitalization) {
                console.log("Completr: Without Live Preview enabled, most features of Completr will not work properly!");
            }
        }
    }

    private setupCommands() {
        // This replaces the default handler for commands. This is needed because the default handler always consumes
        // the event if the command exists.
        const app = this.app as any;
        app.scope.keys = [];

        const isHotkeyMatch = (hotkey: any, context: KeymapContext, isBypassCommand: boolean): boolean => {
            //Copied from original isMatch function, modified to not require exactly the same modifiers for
            // completr-bypass commands. This allows triggering for example Ctrl+Enter even when
            // pressing Ctrl+Shift+Enter. The additional modifier is then passed to the editor.

            /* Original isMatch function:
            var n = e.modifiers
                , i = e.key;
            return (null === n || n === t.modifiers) && (!i || (i === t.vkey || !(!t.key || i.toLowerCase() !== t.key.toLowerCase())))
            */

            const modifiers = hotkey.modifiers, key = hotkey.key;
            if (modifiers !== null && (isBypassCommand ? !context.modifiers.contains(modifiers) : modifiers !== context.modifiers))
                return false;
            return (!key || (key === context.vkey || !(!context.key || key.toLowerCase() !== context.key.toLowerCase())))
        }
        this.app.scope.register(null, null, (e: KeyboardEvent, t: KeymapContext) => {
            const hotkeyManager = app.hotkeyManager;
            hotkeyManager.bake();
            for (let bakedHotkeys = hotkeyManager.bakedHotkeys, bakedIds = hotkeyManager.bakedIds, r = 0; r < bakedHotkeys.length; r++) {
                const hotkey = bakedHotkeys[r];
                const id = bakedIds[r];
                const command = app.commands.findCommand(id);
                const isBypassCommand = command?.isBypassCommand?.();
                if (isHotkeyMatch(hotkey, t, isBypassCommand)) {
                    // Condition taken from original function
                    if (!command || (e.repeat && !command.repeatable)) {
                        continue;
                    } else if (command.isVisible && !command.isVisible()) {
                        //HACK: Hide our commands when to popup is not visible to allow the keybinds to execute their default action.
                        continue;
                    } else if (isBypassCommand) {
                        this._suggestionPopup.close();

                        const validMods = t.modifiers.replace(new RegExp(`${hotkey.modifiers},*`), "").split(",");
                        //Sends the event again, only keeping the modifiers which didn't activate this command
                        let event = new KeyboardEvent("keydown", {
                            key: hotkeyManager.defaultKeys[id][0].key,
                            ctrlKey: validMods.contains("Ctrl"),
                            shiftKey: validMods.contains("Shift"),
                            altKey: validMods.contains("Alt"),
                            metaKey: validMods.contains("Meta")
                        });
                        e.target.dispatchEvent(event);
                        return false;
                    }

                    if (app.commands.executeCommandById(id))
                        return false
                }
            }
        });

        this.addCommand({
            id: 'completr-open-suggestion-popup',
            name: 'Open suggestion popup',
            hotkeys: [
                {
                    key: " ",
                    modifiers: ["Mod"]
                }
            ],
            editorCallback: (editor) => {
                // This is the same function that is called by obsidian when you type a character
                (this._suggestionPopup as any).trigger(editor, /* Passing null here is a signal that this was triggered manually by the user */ null, true);
            },
            // @ts-ignore
            isVisible: () => !this._suggestionPopup.isVisible()
        });
        this.addCommand({
            id: 'completr-select-next-suggestion',
            name: 'Select next suggestion',
            hotkeys: [
                {
                    key: "ArrowDown",
                    modifiers: []
                },
                {
                    key: "Tab",
                    modifiers: []
                }
            ],
            repeatable: true,
            editorCallback: (_) => {
                this.suggestionPopup.selectNextItem(SelectionDirection.NEXT);
            },
            // @ts-ignore
            isVisible: () => this._suggestionPopup.isVisible(),
        });
        this.addCommand({
            id: 'completr-select-previous-suggestion',
            name: 'Select previous suggestion',
            hotkeys: [
                {
                    key: "ArrowUp",
                    modifiers: []
                },
                {
                    key: "Tab",
                    modifiers: ["Shift"]
                }
            ],
            repeatable: true,
            editorCallback: (_) => {
                this.suggestionPopup.selectNextItem(SelectionDirection.PREVIOUS);
            },
            // @ts-ignore
            isVisible: () => this._suggestionPopup.isVisible(),
        });
        this.addCommand({
            id: 'completr-insert-selected-suggestion',
            name: 'Insert selected suggestion',
            hotkeys: [
                {
                    key: "Enter",
                    modifiers: []
                }
            ],
            editorCallback: (editor) => {
                this.suggestionPopup.applySelectedItem();
                this.suggestionPopup.postApplySelectedItem(editor);
                
                // Only allow period insertion if we're not in the middle of a word
                const cursor = editor.getCursor();
                const line = editor.getLine(cursor.line);
                if (cursor.ch < line.length && !WordPatterns.isWordCharacter(line[cursor.ch])) {
                    this._periodInserter.allowInsertPeriod();
                }
            },
            // @ts-ignore
            isBypassCommand: () => !this._suggestionPopup.isFocused(),
            isVisible: () => this._suggestionPopup.isVisible(),
        });
        this.addCommand({
            id: 'completr-space-period-insert',
            name: 'Add period after word',
            hotkeys: [
                {
                    key: " ",
                    modifiers: []
                }
            ],
            editorCallback: (editor) => this._periodInserter.attemptInsert(editor),
            // @ts-ignore
            isBypassCommand: () => false,
            isVisible: () => this.settings.insertPeriodAfterSpaces && this._periodInserter.canInsertPeriod()
        });
        this.addCommand({
            id: 'completr-bypass-enter-key',
            name: 'Bypass the popup and press Enter',
            hotkeys: [
                {
                    key: "Enter",
                    modifiers: ["Ctrl"]
                }
            ],
            editorCallback: (_) => {
            },
            // @ts-ignore
            isBypassCommand: () => true,
            isVisible: () => this._suggestionPopup.isVisible(),
        });
        this.addCommand({
            id: 'completr-bypass-tab-key',
            name: 'Bypass the popup and press Tab',
            hotkeys: [
                {
                    key: "Tab",
                    modifiers: ["Ctrl"]
                }
            ],
            editorCallback: (_) => {
            },
            // @ts-ignore
            isBypassCommand: () => true,
            isVisible: () => this._suggestionPopup.isVisible(),
        });
        this.addCommand({
            id: 'completr-ignore-current-word',
            name: 'Add the currently selected word to the ignore list',
            hotkeys: [
                {
                    key: "D",
                    modifiers: ["Shift"]
                }
            ],
            editorCallback: (editor) => {
                SuggestionIgnorelist.add(this._suggestionPopup.getSelectedItem());
                SuggestionIgnorelist.saveData(this.app.vault);
                (this._suggestionPopup as any).trigger(editor, this.app.workspace.getActiveFile(), true);
            },
            // @ts-ignore
            isBypassCommand: () => !this._suggestionPopup.isFocused(),
            isVisible: () => this._suggestionPopup.isVisible(),
        });
        this.addCommand({
            id: 'completr-close-suggestion-popup',
            name: 'Close suggestion popup',
            hotkeys: [
                {
                    key: "Escape",
                    modifiers: []
                }
            ],
            editorCallback: (_) => this.suggestionPopup.close(),
            // @ts-ignore
            isVisible: () => this._suggestionPopup.isVisible(),
        });
        this.addCommand({
            id: 'completr-jump-to-next-snippet-placeholder',
            name: 'Jump to next snippet placeholder',
            hotkeys: [
                {
                    key: "Enter",
                    modifiers: []
                }
            ],
            editorCallback: (editor, _) => {
                const placeholder = this.snippetManager.placeholderAtPos(editor.getCursor());
                //Sanity check
                if (!placeholder)
                    return;
                const placeholderEnd = posFromIndex(editorToCodeMirrorState(placeholder.editor).doc, placeholder.marker.to);

                if (!this.snippetManager.consumeAndGotoNextMarker(editor)) {
                    editor.setSelections([{
                        anchor: {
                            ...placeholderEnd,
                            ch: Math.min(editor.getLine(placeholderEnd.line).length, placeholderEnd.ch + 1)
                        }
                    }]);
                }
            },
            // @ts-ignore
            isVisible: () => {
                const view = this.app.workspace.getActiveViewOfType(MarkdownView);
                if (!view)
                    return false;
                const placeholder = this.snippetManager.placeholderAtPos(view.editor.getCursor());
                return placeholder != null;
            },
        });

        // Here are some notes about this command and the isBypassCommand function:
        // - This command is registered last so that other hotkeys can be bound to tab without being overridden
        // - The isBypassCommand function exists, because obsidian has editor suggest related event handlers for Enter,
        //   Tab, ArrowUp and ArrowDown which completely prevent those keys from getting to the editor while an editor
        //   suggest is open. This function bypasses that using the custom hotkey hook above which will dispatch an
        //   event to the editor if the isBypassCommand function returns true.
        // - All of this restores the default behavior for all keys while the suggestion popup is open, but not focused.
        this.addCommand({
            id: 'completr-fake-tab',
            name: '(internal)',
            hotkeys: [
                {
                    key: "Tab",
                    modifiers: []
                }
            ],
            editorCallback: (_) => {
            },
            // @ts-ignore
            isBypassCommand: () => true,
            isVisible: () => this._suggestionPopup.isVisible(),
        });
        this.addCommand({
            id: 'completr-fake-enter',
            name: '(internal)',
            hotkeys: [
                {
                    key: "Enter",
                    modifiers: []
                }
            ],
            editorCallback: (_) => {
            },
            // @ts-ignore
            isBypassCommand: () => true,
            isVisible: () => this._suggestionPopup.isVisible(),
        });
        this.addCommand({
            id: 'completr-fake-arrow-up',
            name: '(internal)',
            hotkeys: [
                {
                    key: "ArrowUp",
                    modifiers: []
                }
            ],
            editorCallback: (_) => {
            },
            // @ts-ignore
            isBypassCommand: () => true,
            isVisible: () => this._suggestionPopup.isVisible(),
        });
        this.addCommand({
            id: 'completr-fake-arrow-down',
            name: '(internal)',
            hotkeys: [
                {
                    key: "ArrowDown",
                    modifiers: []
                }
            ],
            editorCallback: (_) => {
            },
            // @ts-ignore
            isBypassCommand: () => true,
            isVisible: () => this._suggestionPopup.isVisible(),
        });
    }

    private setupContextMenu() {
        this.registerEvent(
            this.app.workspace.on('editor-menu', (menu, editor, view) => {
                const cursor = editor.getCursor();
                const line = editor.getLine(cursor.line);
                
                // Find the word at the current cursor position
                const word = this.getWordAtCursor(line, cursor.ch);
                
                // Only add menu item if there's a valid word
                if (word) {
                    const isIgnored = SuggestionIgnorelist.hasText(word);
                    
                    menu.addItem((item) => {
                        if (isIgnored) {
                            item
                                .setTitle(`Remove "${word}" from ignore list`)
                                .setIcon("plus")
                                .onClick(async () => {
                                    await this.removeWordFromIgnoreList(word);
                                });
                        } else {
                            item
                                .setTitle(`Add "${word}" to ignore list`)
                                .setIcon("x")
                                .onClick(async () => {
                                    await this.addWordToIgnoreList(word);
                                });
                        }
                    });
                }
            })
        );
    }

    private async addWordToIgnoreList(word: string) {
        // Add to ignore list
        SuggestionIgnorelist.addFromText(word);
        await SuggestionIgnorelist.saveData(this.app.vault);
        
        // Create a success notice with custom styling
        this.showSuccessNotice(`Added "${word}" to ignore list`);
    }

    private async removeWordFromIgnoreList(word: string) {
        // Remove from ignore list
        SuggestionIgnorelist.removeFromText(word);
        await SuggestionIgnorelist.saveData(this.app.vault);
        
        // Create a success notice with custom styling
        this.showSuccessNotice(`Removed "${word}" from ignore list`);
    }

    private showSuccessNotice(message: string) {
        // Add a success icon to make it visually distinct from error notices
        new Notice(`✅ ${message}`, 4000); // Show for 4 seconds
    }

    private getWordAtCursor(line: string, cursorPosition: number): string | null {
        // Use WordPatterns to extract all words from the line
        const matches = WordPatterns.extractWordsFromLine(line);
        
        // Find the word that contains the cursor position
        for (const match of matches) {
            if (match.index === undefined || !match[0]) continue;
            
            const matchStart = match.index;
            const matchEnd = matchStart + match[0].length;
            
            // Check if cursor is within this word's boundaries
            if (cursorPosition >= matchStart && cursorPosition <= matchEnd) {
                return match[0];
            }
        }

        return null;
    }

    async onunload() {
        // Clean up any resources
        this.snippetManager.onunload();
        if (this._liveWordTracker) {
            await this._liveWordTracker.onUnload();
        }
        if (this._cursorActivityListener) {
            this._cursorActivityListener.cleanup();
        }
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());

        try {
            // Initialize providers in sequence to avoid race conditions
            await SuggestionIgnorelist.loadData(this.app.vault);
            
            // Initialize word list provider first
            WordList.setVault(this.app.vault);
            await WordList.initialize();
            await WordList.loadFromFiles(this.app.vault, this.settings);
            
            // Then initialize scanner
            Scanner.setVault(this.app.vault);
            await Scanner.initialize();
            
            // Set up live word tracker with database and updated settings
            const db = new DatabaseService(this.app.vault);
            await db.initialize();
            this._liveWordTracker.setDatabase(db);
            this._liveWordTracker.updateSettings(this.settings);
            
            await Latex.loadCommands(this.app.vault);
            await Callout.loadSuggestions(this.app.vault, this);
            
            // Configure NLP capitalizer with current settings
            this._nlpCapitalizer.updateConfig({
                capitalizeLines: this.settings.autoCapitalizeLines,
                capitalizeSentences: this.settings.autoCapitalizeSentences,
                preserveMixedCase: this.settings.preserveMixedCaseWords,
                debug: this.settings.debugCapitalization
            });
        } catch (error) {
            console.error('Error loading Completr providers:', error);
            throw error;
        }
    }

    async scanCurrentFile() {
        const activeFile = this.app.workspace.getActiveFile();
        if (!activeFile || !this.settings.scanEnabled) return;

        await Scanner.scanFile(this.settings, activeFile);
    }

    async scanAllFiles() {
        if (!this.settings.scanEnabled) return;
        const files = this.app.vault.getFiles();
        await Scanner.scanFiles(this.settings, files);
    }

    get suggestionPopup() {
        return this._suggestionPopup;
    }

    async saveSettings() {
        await this.saveData(this.settings);
        
        // Update all components with new settings
        this._liveWordTracker.updateSettings(this.settings);
        this._nlpCapitalizer.updateConfig({
            capitalizeLines: this.settings.autoCapitalizeLines,
            capitalizeSentences: this.settings.autoCapitalizeSentences,
            preserveMixedCase: this.settings.preserveMixedCaseWords,
            debug: this.settings.debugCapitalization
        });
    }

    private readonly onFileOpened = (file: TFile) => {
        if (!file || !(file instanceof TFile) || !this.settings.scanEnabled)
            return;

        Scanner.scanFile(this.settings, file);
    }
}

class CursorActivityListener {

    private readonly snippetManager: SnippetManager;
    private readonly suggestionPopup: SuggestionPopup;
    private readonly periodInserter: PeriodInserter;
    private readonly nlpCapitalizer: NLPCapitalizer;
    private readonly liveWordTracker: LiveWordTracker;
    private readonly plugin: CompletrPlugin;

    private cursorTriggeredByChange = false;
    private lastCursorLine = -1;
    private lastCursorPosition: EditorPosition | null = null;
    
    // Debouncing for NLP capitalization
    private nlpDebounceTimeout: NodeJS.Timeout | null = null;
    private readonly NLP_DEBOUNCE_DELAY = 100; // 100ms debounce for NLP operations

    constructor(snippetManager: SnippetManager, suggestionPopup: SuggestionPopup, periodInserter: PeriodInserter, nlpCapitalizer: NLPCapitalizer, liveWordTracker: LiveWordTracker, plugin: CompletrPlugin) {
        this.snippetManager = snippetManager;
        this.suggestionPopup = suggestionPopup;
        this.periodInserter = periodInserter;
        this.nlpCapitalizer = nlpCapitalizer;
        this.liveWordTracker = liveWordTracker;
        this.plugin = plugin;
    }

    private debugLog(message: string, ...args: any[]) {
        if (this.plugin.settings.debugCapitalization) {
            console.log(message, ...args);
        }
    }

    readonly listener = (update: ViewUpdate) => {
        if (update.docChanged) {
            this.handleDocChange();
        }

        if (update.selectionSet) {
            const newCursor = posFromIndex(update.state.doc, update.state.selection.main.head);
            this.handleCursorActivity(newCursor, update);
        }
    };

    private readonly handleDocChange = () => {
        this.cursorTriggeredByChange = true;
    };

    private readonly handleCursorActivity = async (cursor: EditorPosition, update: ViewUpdate) => {
        const editor = this.getEditorFromView(update.view);
        if (!editor) return;

        const justTypedChar = this.getJustTypedCharacter(editor, cursor, this.lastCursorPosition);
        this.debugLog('handleCursorActivity - justTypedChar:', justTypedChar);

        // Immediate operations that need to happen right away
        
        // Track word completion for live word tracking (priority - immediate)
        if (this.lastCursorPosition) {
            await this.liveWordTracker.trackWordCompletion(editor, this.lastCursorPosition, cursor);
        }

        // Handle period insertion (immediate for good UX)
        if (justTypedChar) {
            if (this.plugin.settings.insertPeriodAfterSpaces && this.periodInserter.canInsertPeriod()) {
                this.periodInserter.attemptInsert(editor);
            }
        }

        // Debounced NLP capitalization (expensive operation)
        this.scheduleNLPCapitalization(editor, cursor, justTypedChar);

        this.lastCursorPosition = cursor;
        this.lastCursorLine = cursor.line;
    };

    private scheduleNLPCapitalization(editor: any, cursor: EditorPosition, justTypedChar: string | null) {
        // Clear existing timeout to reset debounce
        if (this.nlpDebounceTimeout) {
            clearTimeout(this.nlpDebounceTimeout);
        }

        // Schedule debounced NLP capitalization
        this.nlpDebounceTimeout = setTimeout(() => {
            try {
                if (justTypedChar) {
                    const isSentenceEnd = NLPCapitalizer.isSentenceEndTrigger(justTypedChar);
                    const isWordBoundary = NLPCapitalizer.isWordBoundaryTrigger(justTypedChar);
                    
                    if ((isSentenceEnd || isWordBoundary) && this.shouldAttemptCapitalization(editor, cursor)) {
                        this.nlpCapitalizer.attemptCapitalization(editor, cursor, justTypedChar);
                    }
                }
            } catch (error) {
                console.error('Error in debounced NLP capitalization:', error);
            }
        }, this.NLP_DEBOUNCE_DELAY);
    }

    cleanup() {
        // Clear any pending NLP debounce timeout
        if (this.nlpDebounceTimeout) {
            clearTimeout(this.nlpDebounceTimeout);
            this.nlpDebounceTimeout = null;
        }
    }

    private shouldAttemptCapitalization(editor: any, cursor: EditorPosition): boolean {
        // Enable capitalization if either line-level OR sentence-level capitalization is enabled
        return this.plugin.settings.autoCapitalizeLines || this.plugin.settings.autoCapitalizeSentences;
    }

    private getJustTypedCharacter(editor: any, cursor: EditorPosition, lastCursor: EditorPosition | null): string | null {
        // Return null if we don't have a last cursor position
        if (!lastCursor) {
            return null;
        }

        // Only handle same-line typing for now
        if (cursor.line !== lastCursor.line) {
            return '\n'; // Line break is also a word boundary
        }
        
        // Check if cursor moved forward by exactly 1 character
        if (cursor.ch !== lastCursor.ch + 1) {
            return null;
        }
        
        // Get the character at the position before the current cursor
        if (cursor.ch === 0) {
            return null;
        }
        
        const line = editor.getLine(cursor.line);
        if (!line) {
            return null;
        }
        
        return line.charAt(cursor.ch - 1);
    }

    private getEditorFromView(view: EditorView): any {
        // Try multiple ways to get the Obsidian editor from the CodeMirror view
        
        // Method 1: Try to get from the view's dom element
        const editorEl = view.dom.closest('.cm-editor');
        if (editorEl) {
            const obsidianView = (editorEl as any).cmView?.obsidianView;
            if (obsidianView?.editor) {
                return obsidianView.editor;
            }
        }
        
        // Method 2: Try to get from active view
        const app = (window as any).app;
        if (app) {
            const activeView = app.workspace.getActiveViewOfType(MarkdownView);
            if (activeView?.editor) {
                return activeView.editor;
            }
        }
        
        // Method 3: Try to get from the view itself
        if ((view as any).editor) {
            return (view as any).editor;
        }
        
        return null;
    }
}
