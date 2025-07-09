import { KeymapContext, MarkdownView, Notice, Plugin, TFile } from "obsidian";
import { EditorView } from "@codemirror/view";

import { SUCCESS_NOTICE_DURATION_MS } from "./constants";
import { CursorActivityListener } from "./cursor_activity_listener";
import { SQLiteDatabaseService } from "./db/sqlite_database_service";
import { EditorUtils } from "./utils/editor_utils";
import { LiveWordTracker } from "./live_word_tracker";
import { markerStateField } from "./marker_state_field";
import NLPCapitalizer from "./nlp_capitalizer";
import PeriodInserter from "./period_inserter";
import SuggestionPopup, { SelectionDirection } from "./popup";
import { Callout } from "./provider/callout_provider";
import { FrontMatter } from "./provider/front_matter_provider";
import { SuggestionIgnorelist } from "./provider/ignorelist";
import { Latex } from "./provider/latex_provider";
import { providerRegistry } from "./provider/provider_registry";
import { Scanner } from "./provider/scanner_provider";
import { WordList } from "./provider/word_list_provider";
import { CompletrSettings, DEFAULT_SETTINGS } from "./settings";
import CompletrSettingsTab from "./settings_tab";
import SnippetManager from "./snippet_manager";
import { WordPatterns } from "./word_patterns";



export default class CompletrPlugin extends Plugin {

    settings: CompletrSettings;

    private snippetManager: SnippetManager;
    private suggestionPopup: SuggestionPopup;
    private periodInserter: PeriodInserter;
    private nlpCapitalizer: NLPCapitalizer;
    private liveWordTracker: LiveWordTracker;
    private cursorActivityListener: CursorActivityListener;
    private database: SQLiteDatabaseService | null = null;

    async onload() {
        this.snippetManager = new SnippetManager();
        this.periodInserter = new PeriodInserter();
        this.nlpCapitalizer = new NLPCapitalizer(); // Will be configured after loadSettings
        
        // Initialize LiveWordTracker early so it's available in loadSettings
        this.liveWordTracker = new LiveWordTracker(DEFAULT_SETTINGS); // Use defaults initially
        
        await this.loadSettings();

        // Register providers in the correct order (original order: [FrontMatter, Callout, Latex, Scanner, WordList])
        this.registerProviders();

        this.suggestionPopup = new SuggestionPopup(this.app, this.settings, this.snippetManager);

        this.registerEditorSuggest(this.suggestionPopup);

        this.registerEvent(this.app.workspace.on('file-open', this.onFileOpened, this));
        this.registerEvent(this.app.metadataCache.on('changed', FrontMatter.onCacheChange, FrontMatter));
        this.app.workspace.onLayoutReady(() => FrontMatter.loadYAMLKeyCompletions(this.app.metadataCache, this.app.vault.getMarkdownFiles()));

        this.registerEditorExtension(markerStateField);
        this.cursorActivityListener = new CursorActivityListener(this.snippetManager, this.suggestionPopup, this.periodInserter, this.nlpCapitalizer, this.liveWordTracker, this.settings);
        this.registerEditorExtension(EditorView.updateListener.of(this.cursorActivityListener.listener));

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
        this.setupCustomHotkeyHandler();
        this.registerSuggestionCommands();
        this.registerPeriodInsertionCommands();
        this.registerSnippetCommands();
        this.registerBypassCommands();
        this.registerIgnoreListCommands();
        this.registerInternalCommands();
    }

    /**
     * Sets up custom hotkey handler to support bypass commands
     */
    private setupCustomHotkeyHandler() {
        // This replaces the default handler for commands. This is needed because the default handler always consumes
        // the event if the command exists.
        const app = this.app as any;
        app.scope.keys = [];

        const isHotkeyMatch = this.createHotkeyMatcher();
        
        this.app.scope.register(null, null, (e: KeyboardEvent, t: KeymapContext) => {
            const hotkeyManager = app.hotkeyManager;
            hotkeyManager.bake();
            for (let bakedHotkeys = hotkeyManager.bakedHotkeys, bakedIds = hotkeyManager.bakedIds, r = 0; r < bakedHotkeys.length; r++) {
                const hotkey = bakedHotkeys[r];
                const id = bakedIds[r];
                const command = app.commands.findCommand(id);
                const isBypassCommand = command?.isBypassCommand?.();
                
                if (isHotkeyMatch(hotkey, t, isBypassCommand)) {
                    if (this.shouldSkipCommand(command, e)) {
                        continue;
                    }
                    
                    if (isBypassCommand) {
                        this.handleBypassCommand(e, t, hotkey, hotkeyManager, id);
                        return false;
                    }

                    if (app.commands.executeCommandById(id))
                        return false
                }
            }
        });
    }

    /**
     * Creates the hotkey matching function
     */
    private createHotkeyMatcher(): (hotkey: any, context: KeymapContext, isBypassCommand: boolean) => boolean {
        return (hotkey: any, context: KeymapContext, isBypassCommand: boolean): boolean => {
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
    }

    /**
     * Determines if a command should be skipped
     */
    private shouldSkipCommand(command: any, e: KeyboardEvent): boolean {
        // Condition taken from original function
        if (!command || (e.repeat && !command.repeatable)) {
            return true;
        } else if (command.isVisible && !command.isVisible()) {
            //HACK: Hide our commands when to popup is not visible to allow the keybinds to execute their default action.
            return true;
        }
        return false;
    }

    /**
     * Handles bypass commands by dispatching modified events
     */
    private handleBypassCommand(e: KeyboardEvent, t: KeymapContext, hotkey: any, hotkeyManager: any, id: string) {
        this.suggestionPopup.close();

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
    }

    /**
     * Registers suggestion-related commands
     */
    private registerSuggestionCommands() {
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
                (this.suggestionPopup as any).trigger(editor, /* Passing null here is a signal that this was triggered manually by the user */ null, true);
            },
            // @ts-ignore
            isVisible: () => !this.suggestionPopup.isVisible()
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
            isVisible: () => this.suggestionPopup.isVisible(),
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
            isVisible: () => this.suggestionPopup.isVisible(),
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
                    this.periodInserter.allowInsertPeriod();
                }
            },
            // @ts-ignore
            isBypassCommand: () => !this.suggestionPopup.isFocused(),
            isVisible: () => this.suggestionPopup.isVisible(),
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
            isVisible: () => this.suggestionPopup.isVisible(),
        });
    }

    /**
     * Registers period insertion commands
     */
    private registerPeriodInsertionCommands() {
        this.addCommand({
            id: 'completr-space-period-insert',
            name: 'Add period after word',
            hotkeys: [
                {
                    key: " ",
                    modifiers: []
                }
            ],
            editorCallback: (editor) => this.periodInserter.attemptInsert(editor),
            // @ts-ignore
            isBypassCommand: () => false,
            isVisible: () => this.settings.insertPeriodAfterSpaces && this.periodInserter.canInsertPeriod()
        });
    }

    /**
     * Registers snippet-related commands
     */
    private registerSnippetCommands() {
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
                const placeholderEnd = EditorUtils.posFromIndex(EditorUtils.editorToCodeMirrorState(placeholder.editor).doc, placeholder.marker.to);

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
    }

    /**
     * Registers bypass commands
     */
    private registerBypassCommands() {
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
            isVisible: () => this.suggestionPopup.isVisible(),
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
            isVisible: () => this.suggestionPopup.isVisible(),
        });
    }

    /**
     * Registers ignore list commands
     */
    private registerIgnoreListCommands() {
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
                SuggestionIgnorelist.add(this.suggestionPopup.getSelectedItem());
                SuggestionIgnorelist.saveData(this.app.vault);
                (this.suggestionPopup as any).trigger(editor, this.app.workspace.getActiveFile(), true);
            },
            // @ts-ignore
            isBypassCommand: () => !this.suggestionPopup.isFocused(),
            isVisible: () => this.suggestionPopup.isVisible(),
        });
    }

    /**
     * Registers internal commands for key bypassing
     */
    private registerInternalCommands() {
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
            isVisible: () => this.suggestionPopup.isVisible(),
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
            isVisible: () => this.suggestionPopup.isVisible(),
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
            isVisible: () => this.suggestionPopup.isVisible(),
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
            isVisible: () => this.suggestionPopup.isVisible(),
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
        new Notice(`✅ ${message}`, SUCCESS_NOTICE_DURATION_MS);
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
        if (this.liveWordTracker) {
            await this.liveWordTracker.onUnload();
        }
        if (this.cursorActivityListener) {
            this.cursorActivityListener.cleanup();
        }
        if (this.database) {
            await this.database.shutdown();
        }
        // Clear provider registry on unload
        providerRegistry.clear();
    }

    /**
     * Register all providers in the correct order
     * Original order: [FrontMatter, Callout, Latex, Scanner, WordList]
     */
    private registerProviders() {
        providerRegistry.register(FrontMatter);
        providerRegistry.register(Callout);
        providerRegistry.register(Latex);
        providerRegistry.register(Scanner);
        providerRegistry.register(WordList);
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
            
            // Initialize database in background to avoid blocking the popup
            this.initializeDatabaseAsync();
            
            await Latex.loadCommands(this.app.vault);
            await Callout.loadSuggestions(this.app.vault, this);
            
            // Configure NLP capitalizer with current settings
            this.nlpCapitalizer.updateConfig({
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

    private async initializeDatabaseAsync() {
        try {
            // Set up live word tracker with database and updated settings
            this.database = new SQLiteDatabaseService(this.app.vault);
            await this.database.initialize();
            this.liveWordTracker.setDatabase(this.database);
            this.liveWordTracker.updateSettings(this.settings);
            
            // Connect database to Scanner provider if available
            await Scanner.connectDatabase(this.database);
            
            console.log('Database initialized successfully');
        } catch (error) {
            console.error('Failed to initialize database, live word tracking will be disabled:', error);
            // Don't throw - allow the plugin to continue without database features
        }
    }

    private async scanCurrentFile() {
        const activeFile = this.app.workspace.getActiveFile();
        if (!activeFile || !this.settings.scanEnabled) return;

        await Scanner.scanFile(this.settings, activeFile);
    }

    private async scanAllFiles() {
        if (!this.settings.scanEnabled) return;
        const files = this.app.vault.getFiles();
        await Scanner.scanFiles(this.settings, files);
    }



    async saveSettings() {
        await this.saveData(this.settings);
        
        // Update all components with new settings
        this.liveWordTracker.updateSettings(this.settings);
        this.nlpCapitalizer.updateConfig({
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


