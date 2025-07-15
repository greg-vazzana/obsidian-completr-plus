import {
    App,
    Editor,
    EditorPosition,
    EditorSuggest,
    EditorSuggestContext,
    EditorSuggestTriggerInfo,
    getIcon,
    TFile
} from "obsidian";

import { EditorUtils } from "./utils/editor_utils";
import { SuggestionIgnorelist } from "./provider/ignorelist";
import { Suggestion, HighlightRange } from "./provider/provider";
import { providerRegistry } from "./provider/provider_registry";
import { CompletrSettings } from "./settings";
import SnippetManager from "./snippet_manager";
import { WordPatterns } from "./word_patterns";

export default class SuggestionPopup extends EditorSuggest<Suggestion> {
    /**
     * Hacky variable to prevent the suggestion window from immediately re-opening after completing a suggestion
     */
    private justClosed: boolean;
    private separatorChar: string;

    private characterRegex: string;
    private compiledCharacterRegex: RegExp;
    private focused: boolean = false;

    private readonly snippetManager: SnippetManager;
    private readonly settings: CompletrSettings;
    private readonly disableSnippets: boolean;

    constructor(app: App, settings: CompletrSettings, snippetManager: SnippetManager) {
        super(app);
        this.disableSnippets = (app.vault as any).config?.legacyEditor;
        this.settings = settings;
        this.snippetManager = snippetManager;

        //Remove default key registrations
        let self = this as any;
        self.scope.keys = [];
    }

    open() {
        super.open();
        this.focused = this.settings.autoFocus;

        if (!this.focused) {
            for (const c of (this as any).suggestions.containerEl.children)
                c.removeClass("is-selected");
        }
    }

    close() {
        super.close();
        this.focused = false;
    }

    getSuggestions(
        context: EditorSuggestContext
    ): Suggestion[] | Promise<Suggestion[]> {
        let suggestions: Suggestion[] = [];

        for (let provider of providerRegistry.getProviders()) {
            suggestions = [...suggestions, ...provider.getSuggestions({
                ...context,
                separatorChar: this.separatorChar
            }, this.settings)];

            if (provider.blocksAllOtherProviders && suggestions.length > 0) {
                suggestions.forEach((suggestion) => {
                    if (!suggestion.overrideStart)
                        return;

                    // Fixes popup position
                    this.context.start = suggestion.overrideStart;
                });
                break;
            }
        }

        const seen = new Set<string>();
        suggestions = suggestions.filter((suggestion) => {
            if (seen.has(suggestion.displayName))
                return false;

            seen.add(suggestion.displayName);
            return true;
        });
        return suggestions.length === 0 ? null : suggestions.filter(s => !SuggestionIgnorelist.has(s));
    }

    onTrigger(cursor: EditorPosition, editor: Editor, file: TFile): EditorSuggestTriggerInfo | null {
        return this.internalOnTrigger(editor, cursor, !file);
    }

    private internalOnTrigger(editor: Editor, cursor: EditorPosition, manualTrigger: boolean): EditorSuggestTriggerInfo | null {
        if (this.justClosed) {
            this.justClosed = false;
            return null;
        }

        if (!this.settings.autoTrigger && !manualTrigger) {
            this.close();
            return null;
        }

        let {
            query,
            separatorChar
        } = EditorUtils.matchWordBackwards(editor, cursor, WordPatterns.isWordCharacter, this.settings.maxLookBackDistance);
        this.separatorChar = separatorChar;

        return {
            start: {
                ...cursor,
                ch: cursor.ch - query.length,
            },
            end: cursor,
            query: query,
        };
    }

    renderSuggestion(value: Suggestion, el: HTMLElement): void {
        el.addClass("completr-suggestion-item");
        if (value.color != null) {
            el.style.setProperty("--completr-suggestion-color", value.color);
        }

        // Create content wrapper for icon and text
        const content = el.doc.createElement("div");
        content.addClass("completr-suggestion-content");

        // Add the icon (or match type icon if no custom icon)
        if (value.icon != null) {
            const icon = getIcon(value.icon);
            if (icon != null) {
                icon.addClass("completr-suggestion-icon");
                content.appendChild(icon);
            }
        } else if (value.matchType === 'fuzzy') {
            // Add a subtle fuzzy match indicator
            const fuzzyIcon = getIcon("zap");
            if (fuzzyIcon != null) {
                fuzzyIcon.addClass("completr-suggestion-icon");
                fuzzyIcon.addClass("completr-fuzzy-indicator");
                content.appendChild(fuzzyIcon);
            }
        }

        // Add the text with highlighting if available
        const text = el.doc.createElement("div");
        text.addClass("completr-suggestion-text");
        
        // Add match type indicator class
        if (value.matchType) {
            text.addClass(`completr-match-${value.matchType}`);
        }
        
        // Render text with highlights if available
        if (value.highlightRanges && value.highlightRanges.length > 0) {
            this.renderHighlightedText(text, value.displayName, value.highlightRanges);
        } else {
            text.setText(value.displayName);
        }
        
        content.appendChild(text);

        el.appendChild(content);

        // Add the frequency badge if frequency > 1
        if (value.frequency != null && value.frequency > 1) {
            const frequencyBadge = el.doc.createElement("div");
            frequencyBadge.addClass("completr-frequency-badge");
            frequencyBadge.setText(value.frequency.toString());
            el.appendChild(frequencyBadge);
        }
    }

    selectSuggestion(value: Suggestion, evt: MouseEvent | KeyboardEvent): void {
        const replacement = value.replacement;
        const start = typeof value !== "string" && value.overrideStart ? value.overrideStart : this.context.start;

        const endPos = value.overrideEnd ?? this.context.end;
        this.context.editor.replaceRange(replacement, start, {
            ...endPos,
            ch: Math.min(endPos.ch, this.context.editor.getLine(endPos.line).length)
        });

        //Check if suggestion is a snippet
        if (replacement.includes("#") || replacement.includes("~")) {
            if (!this.disableSnippets) {
                this.snippetManager.handleSnippet(replacement, start, this.context.editor);
            } else {
                console.log("Completr: Please enable Live Preview mode to use snippets");
            }
        } else {
            this.context.editor.setCursor({ ...start, ch: start.ch + replacement.length });
        }

        this.close();
        this.justClosed = true;
    }

    selectNextItem(dir: SelectionDirection) {
        if (!this.focused) {
            this.focused = true;
            dir = dir === SelectionDirection.PREVIOUS ? dir : SelectionDirection.NONE;
        }

        const self = this as any;
        // HACK: The second parameter has to be an instance of KeyboardEvent to force scrolling the selected item into
        // view
        self.suggestions.setSelectedItem(self.suggestions.selectedItem + dir, new KeyboardEvent("keydown"));
    }

    getSelectedItem(): Suggestion {
        const self = this as any;
        return self.suggestions.values[self.suggestions.selectedItem];
    }

    applySelectedItem() {
        const self = this as any;
        self.suggestions.useSelectedItem();
    }

    postApplySelectedItem(editor: Editor) {
        if (!this.settings.insertSpaceAfterComplete) {
            return
        }
        
        const cursor = editor.getCursor()
        const line = editor.getLine(cursor.line)
        
        // Don't add space if we're at the end of a word and the next character is already a space
        if (cursor.ch < line.length && line[cursor.ch] === ' ') {
            return
        }
        
        // Don't add space if we're in the middle of a word
        if (cursor.ch < line.length && WordPatterns.isWordCharacter(line[cursor.ch])) {
            return
        }
        
        editor.replaceRange(" ", cursor)
        editor.setCursor({line: cursor.line, ch: cursor.ch + 1})
    }

    isVisible(): boolean {
        return (this as any).isOpen;
    }

    isFocused(): boolean {
        return this.focused;
    }

    preventNextTrigger() {
        this.justClosed = true;
    }

    private getCharacterRegex(): RegExp {
        if (this.characterRegex !== this.settings.characterRegex)
            this.compiledCharacterRegex = new RegExp("[" + this.settings.characterRegex + "]", "u");

        return this.compiledCharacterRegex;
    }

    private renderHighlightedText(container: HTMLElement, text: string, highlightRanges: HighlightRange[]): void {
        if (highlightRanges.length === 0) {
            container.setText(text);
            return;
        }

        // Sort ranges by start position
        const sortedRanges = [...highlightRanges].sort((a, b) => a.start - b.start);
        
        let lastEnd = 0;
        
        for (const range of sortedRanges) {
            // Add non-highlighted text before this range
            if (range.start > lastEnd) {
                const normalText = text.substring(lastEnd, range.start);
                container.appendText(normalText);
            }
            
            // Add highlighted text
            const highlightedText = text.substring(range.start, range.end);
            const highlight = container.doc.createElement("mark");
            highlight.addClass("completr-highlight");
            highlight.setText(highlightedText);
            container.appendChild(highlight);
            
            lastEnd = range.end;
        }
        
        // Add any remaining non-highlighted text
        if (lastEnd < text.length) {
            const remainingText = text.substring(lastEnd);
            container.appendText(remainingText);
        }
    }

}

export enum SelectionDirection {
    NEXT = 1,
    PREVIOUS = -1,
    NONE = 0,
}
