import { EditorPosition, MarkdownView } from "obsidian";
import { EditorView, ViewUpdate } from "@codemirror/view";
import { posFromIndex } from "./editor_helpers";
import SnippetManager from "./snippet_manager";
import SuggestionPopup from "./popup";
import PeriodInserter from "./period_inserter";
import NLPCapitalizer from "./nlp_capitalizer";
import { LiveWordTracker } from "./live_word_tracker";
import { CompletrSettings } from "./settings";

export class CursorActivityListener {

    private readonly snippetManager: SnippetManager;
    private readonly suggestionPopup: SuggestionPopup;
    private readonly periodInserter: PeriodInserter;
    private readonly nlpCapitalizer: NLPCapitalizer;
    private readonly liveWordTracker: LiveWordTracker;
    private readonly settings: CompletrSettings;

    private cursorTriggeredByChange = false;
    private lastCursorLine = -1;
    private lastCursorPosition: EditorPosition | null = null;
    
    // Debouncing for NLP capitalization
    private nlpDebounceTimeout: NodeJS.Timeout | null = null;
    private readonly NLP_DEBOUNCE_DELAY = 100; // 100ms debounce for NLP operations

    constructor(
        snippetManager: SnippetManager, 
        suggestionPopup: SuggestionPopup, 
        periodInserter: PeriodInserter, 
        nlpCapitalizer: NLPCapitalizer, 
        liveWordTracker: LiveWordTracker, 
        settings: CompletrSettings
    ) {
        this.snippetManager = snippetManager;
        this.suggestionPopup = suggestionPopup;
        this.periodInserter = periodInserter;
        this.nlpCapitalizer = nlpCapitalizer;
        this.liveWordTracker = liveWordTracker;
        this.settings = settings;
    }

    private debugLog(message: string, ...args: any[]) {
        if (this.settings.debugCapitalization) {
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
            if (this.settings.insertPeriodAfterSpaces && this.periodInserter.canInsertPeriod()) {
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
        return this.settings.autoCapitalizeLines || this.settings.autoCapitalizeSentences;
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