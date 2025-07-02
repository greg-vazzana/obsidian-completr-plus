import { Editor, EditorPosition } from "obsidian";
import { WordPatterns } from "./word_patterns";
import { isInFrontMatterBlock } from "./editor_helpers";

/**
 * Handles automatic capitalization of the first word on each line.
 * Respects markdown formatting and preserves mixed-case words.
 */
export default class FirstWordCapitalizer {

    /**
     * Attempts to capitalize the first word of a line if conditions are met.
     * @param editor The Editor instance
     * @param cursor Current cursor position
     * @param trigger The character that triggered this check (space, punctuation, etc.)
     */
    attemptCapitalization(editor: Editor, cursor: EditorPosition, trigger: string): void {
        // Get the current line
        const line = editor.getLine(cursor.line);
        
        // Skip if we're in a context where we shouldn't capitalize
        if (!this.shouldCapitalizeInContext(editor, cursor, line)) {
            return;
        }

        // Find the first word on the line
        const firstWordInfo = this.findFirstWordOnLine(line);
        if (!firstWordInfo) {
            return;
        }

        const { word, startIndex, endIndex } = firstWordInfo;

        // Check if this word should be capitalized
        if (!this.shouldCapitalizeWord(word)) {
            return;
        }

        // Capitalize the word
        const capitalizedWord = this.capitalizeWord(word);
        if (capitalizedWord === word) {
            return; // No change needed
        }

        // Replace the word in the editor
        const wordStart: EditorPosition = { line: cursor.line, ch: startIndex };
        const wordEnd: EditorPosition = { line: cursor.line, ch: endIndex };
        
        editor.replaceRange(capitalizedWord, wordStart, wordEnd);
    }

    /**
     * Determines if we should attempt capitalization in the current context
     */
    private shouldCapitalizeInContext(editor: Editor, cursor: EditorPosition, line: string): boolean {
        // Don't capitalize in front matter blocks
        if (isInFrontMatterBlock(editor, cursor)) {
            return false;
        }

        // Don't capitalize in code blocks (fenced or indented)
        if (this.isInCodeBlock(editor, cursor)) {
            return false;
        }

        // Don't capitalize in inline code
        if (this.isInInlineCode(line, cursor.ch)) {
            return false;
        }

        // Don't capitalize in link text
        if (this.isInLinkText(line)) {
            return false;
        }

        return true;
    }

    /**
     * Finds the first word on a line, accounting for markdown prefixes
     */
    private findFirstWordOnLine(line: string): { word: string, startIndex: number, endIndex: number } | null {
        // Skip leading whitespace and markdown prefixes
        const trimmedMatch = line.match(/^(\s*(?:[#]+\s*|[-*+]\s+|\d+\.\s+|>\s*)*)(.*)/);
        if (!trimmedMatch) {
            return null;
        }

        const prefixLength = trimmedMatch[1].length;
        const remainingText = trimmedMatch[2];

        // Find the first word in the remaining text
        const wordMatch = remainingText.match(WordPatterns.WORD_PATTERN);
        if (!wordMatch || wordMatch.index === undefined) {
            return null;
        }

        const word = wordMatch[0];
        const startIndex = prefixLength + wordMatch.index;
        const endIndex = startIndex + word.length;

        return { word, startIndex, endIndex };
    }

    /**
     * Determines if a word should be capitalized based on our rules
     */
    private shouldCapitalizeWord(word: string): boolean {
        // Must be a valid word
        if (!WordPatterns.isValidWord(word)) {
            return false;
        }

        // Don't capitalize mixed-case words (preserve iPhone, JavaScript, etc.)
        if (this.isMixedCaseWord(word)) {
            return false;
        }

        return true;
    }

    /**
     * Checks if a word has mixed case (uppercase letters in non-first positions)
     */
    private isMixedCaseWord(word: string): boolean {
        if (word.length <= 1) {
            return false;
        }

        // Check if there are uppercase letters anywhere except the first position
        const afterFirstChar = word.slice(1);
        return /[A-Z]/.test(afterFirstChar);
    }

    /**
     * Capitalizes a word (first letter uppercase, rest lowercase)
     */
    private capitalizeWord(word: string): string {
        if (word.length === 0) {
            return word;
        }

        return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    }

    /**
     * Checks if cursor is within a code block
     */
    private isInCodeBlock(editor: Editor, cursor: EditorPosition): boolean {
        // Check for fenced code blocks
        let inFencedBlock = false;
        for (let i = 0; i <= cursor.line; i++) {
            const line = editor.getLine(i);
            if (line.match(/^```/)) {
                inFencedBlock = !inFencedBlock;
            }
        }

        if (inFencedBlock) {
            return true;
        }

        // Check for indented code blocks (4+ spaces or 1+ tabs at start)
        const currentLine = editor.getLine(cursor.line);
        if (currentLine.match(/^(\s{4,}|\t+)/)) {
            return true;
        }

        return false;
    }

    /**
     * Checks if cursor is within inline code (`text`)
     */
    private isInInlineCode(line: string, cursorPos: number): boolean {
        let inInlineCode = false;
        let backtickCount = 0;

        for (let i = 0; i < cursorPos && i < line.length; i++) {
            if (line[i] === '`') {
                backtickCount++;
                if (backtickCount === 1) {
                    inInlineCode = !inInlineCode;
                }
            } else if (backtickCount > 0) {
                backtickCount = 0;
            }
        }

        return inInlineCode;
    }

    /**
     * Checks if the line contains link text that shouldn't be capitalized
     */
    private isInLinkText(line: string): boolean {
        // Simple check for common link patterns at the start of the line content
        // This could be made more sophisticated if needed
        const linkPatterns = [
            /^\s*\[.*?\]\(.*?\)/,  // [text](url)
            /^\s*\[\[.*?\]\]/,     // [[wikilink]]
            /^\s*\[.*?\]\[.*?\]/   // [text][ref]
        ];

        return linkPatterns.some(pattern => pattern.test(line));
    }

    /**
     * Checks if a character is a word boundary trigger (space, punctuation, etc.)
     */
    static isWordBoundaryTrigger(char: string): boolean {
        return /[\s.,:;!?]/.test(char);
    }
} 