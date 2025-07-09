import { Editor, EditorPosition } from "obsidian";
import nlp from "compromise";

import { DEBUG_SENTENCE_MAX_LENGTH, DEBUG_FULL_TEXT_MAX_LENGTH } from "./constants";
import { isInFrontMatterBlock } from "./editor_helpers";

/**
 * Configuration options for NLP capitalization
 */
export interface NLPCapitalizationConfig {
    /**
     * Capitalize first word of each line (existing behavior)
     */
    capitalizeLines: boolean;
    
    /**
     * Capitalize first word of each sentence (new feature)
     */
    capitalizeSentences: boolean;
    
    /**
     * Preserve mixed-case words like iPhone, JavaScript, etc.
     */
    preserveMixedCase: boolean;
    
    /**
     * Enable debug logging
     */
    debug: boolean;
}

/**
 * NLP-powered text capitalizer using compromise.js
 * Handles both line-level and sentence-level capitalization while respecting markdown syntax
 */
export default class NLPCapitalizer {
    private config: NLPCapitalizationConfig;
    
    constructor(config: Partial<NLPCapitalizationConfig> = {}) {
        this.config = {
            capitalizeLines: true,
            capitalizeSentences: true,
            preserveMixedCase: true,
            debug: false,
            ...config
        };
    }

    /**
     * Updates the configuration
     */
    updateConfig(newConfig: Partial<NLPCapitalizationConfig>): void {
        this.config = { ...this.config, ...newConfig };
    }

    /**
     * Attempts to capitalize words in the current context based on NLP analysis
     * @param editor The Editor instance
     * @param cursor Current cursor position  
     * @param trigger The character that triggered this check
     */
    attemptCapitalization(editor: Editor, cursor: EditorPosition, trigger: string): void {
        if (this.config.debug) {
            console.log('NLPCapitalizer: attemptCapitalization called', { cursor, trigger });
        }

        // Skip if we're in a context where we shouldn't capitalize
        if (!this.shouldCapitalizeInContext(editor, cursor)) {
            return;
        }

        // Skip if no capitalization modes are enabled
        if (!this.shouldAttemptCapitalization(editor, cursor)) {
            return;
        }

        const line = editor.getLine(cursor.line);
        
        // Try line-level capitalization first (maintains existing behavior)
        if (this.config.capitalizeLines) {
            const lineCapitalized = this.tryLineCapitalization(editor, cursor, line, trigger);
            if (lineCapitalized) {
                if (this.config.debug) {
                    console.log('NLPCapitalizer: Line capitalization succeeded, skipping sentence capitalization');
                }
                return; // We made a change, don't do sentence-level too
            }
        }

        // Try sentence-level capitalization
        if (this.config.capitalizeSentences) {
            if (this.config.debug) {
                console.log('NLPCapitalizer: Attempting sentence capitalization');
            }
            this.trySentenceCapitalization(editor, cursor, trigger);
        }
    }

    /**
     * Attempts to capitalize the first word of a line (existing behavior)
     */
    private tryLineCapitalization(
        editor: Editor, 
        cursor: EditorPosition, 
        line: string, 
        trigger: string
    ): boolean {
        // Find the first word on the line, accounting for markdown prefixes
        const firstWordInfo = this.findFirstWordOnLine(line);
        if (!firstWordInfo) {
            return false;
        }

        const { word, startIndex, endIndex } = firstWordInfo;

        // Check if this word should be capitalized
        if (!this.shouldCapitalizeWord(word)) {
            return false;
        }

        // Capitalize the word
        const capitalizedWord = this.capitalizeWord(word);
        if (capitalizedWord === word) {
            return false; // No change needed
        }

        // Replace the word in the editor
        const wordStart: EditorPosition = { line: cursor.line, ch: startIndex };
        const wordEnd: EditorPosition = { line: cursor.line, ch: endIndex };
        
        editor.replaceRange(capitalizedWord, wordStart, wordEnd);
        
        if (this.config.debug) {
            console.log('NLPCapitalizer: Line capitalization applied', { 
                original: word, 
                capitalized: capitalizedWord 
            });
        }
        
        return true;
    }

    /**
     * Attempts to capitalize the first word of a sentence using NLP analysis
     */
    private trySentenceCapitalization(
        editor: Editor, 
        cursor: EditorPosition, 
        trigger: string
    ): boolean {
        // Get the current line first
        const currentLine = editor.getLine(cursor.line);
        
        // For sentence capitalization, focus on potential sentence boundaries
        // If we just typed a sentence ending (., !, ?), look back to capitalize the sentence we just completed
        if (NLPCapitalizer.isSentenceEndTrigger(trigger)) {
            if (this.config.debug) {
                console.log('NLPCapitalizer: Sentence ending detected, looking for words to capitalize');
            }
            return this.capitalizeCompletedSentence(editor, cursor, currentLine);
        }

        // Get surrounding context for better sentence detection
        const contextLines = this.getContextLines(editor, cursor, 2); // Reduce context for better accuracy
        const fullText = contextLines.join('\n');
        
        if (!fullText.trim()) {
            return false;
        }

        try {
            // Use compromise to analyze the text and find sentences
            const doc = nlp(fullText);
            const sentences = doc.sentences().out('array');
            
            if (this.config.debug) {
                console.log('NLPCapitalizer: Detected sentences', sentences);
            }

            // Special handling: look for sentences that start with lowercase after punctuation
            return this.findAndCapitalizeSentenceStart(
                editor, 
                cursor, 
                currentLine,
                sentences, 
                contextLines
            );
            
        } catch (error) {
            if (this.config.debug) {
                console.error('NLPCapitalizer: Error during NLP analysis', error);
            }
            return false;
        }
    }

    /**
     * Finds the sentence containing the cursor and attempts capitalization
     */
    private findCursorSentenceAndCapitalize(
        editor: Editor,
        cursor: EditorPosition,
        sentences: string[],
        contextLines: string[],
        trigger: string
    ): boolean {
        // Calculate absolute character position in the context
        const lineStartOffset = cursor.line - Math.max(0, cursor.line - 3);
        let absolutePos = 0;
        
        for (let i = 0; i < lineStartOffset; i++) {
            absolutePos += contextLines[i].length + 1; // +1 for newline
        }
        absolutePos += cursor.ch;

        if (this.config.debug) {
            console.log('NLPCapitalizer: Cursor position analysis', {
                cursor,
                lineStartOffset,
                absolutePos,
                contextLines
            });
        }

        // Find which sentence our cursor is in
        let currentPos = 0;
        for (let i = 0; i < sentences.length; i++) {
            const sentence = sentences[i];
            const sentenceEnd = currentPos + sentence.length;
            
            if (this.config.debug) {
                console.log(`NLPCapitalizer: Checking sentence ${i}:`, {
                    sentence: sentence.substring(0, DEBUG_SENTENCE_MAX_LENGTH) + (sentence.length > DEBUG_SENTENCE_MAX_LENGTH ? '...' : ''),
                    currentPos,
                    sentenceEnd,
                    absolutePos,
                    inRange: absolutePos >= currentPos && absolutePos <= sentenceEnd
                });
            }
            
            if (absolutePos >= currentPos && absolutePos <= sentenceEnd) {
                // Found our sentence, now find the first word
                if (this.config.debug) {
                    console.log('NLPCapitalizer: Found cursor sentence, attempting capitalization');
                }
                return this.capitalizeSentenceFirstWord(
                    editor, 
                    sentence, 
                    currentPos, 
                    absolutePos,
                    contextLines
                );
            }
            
            currentPos = sentenceEnd;
            // Account for sentence boundaries and spacing
            while (currentPos < contextLines.join('\n').length && 
                   /\s/.test(contextLines.join('\n')[currentPos])) {
                currentPos++;
            }
        }
        
        if (this.config.debug) {
            console.log('NLPCapitalizer: No sentence found containing cursor position');
        }
        
        return false;
    }

    /**
     * Looks for sentence starts that need capitalization, focusing on the current cursor position
     */
    private findAndCapitalizeSentenceStart(
        editor: Editor,
        cursor: EditorPosition,
        currentLine: string,
        sentences: string[],
        contextLines: string[]
    ): boolean {
        if (this.config.debug) {
            console.log('NLPCapitalizer: findAndCapitalizeSentenceStart', {
                currentLine,
                cursorPos: cursor.ch,
                sentences: sentences.slice(0, 3) // Show first few sentences
            });
        }

        const sentenceBoundary = this.findLastSentenceBoundary(currentLine);
        if (!sentenceBoundary) {
            return false;
        }

        const wordToCapitalize = this.findWordAfterSentenceBoundary(currentLine, sentenceBoundary, cursor);
        if (!wordToCapitalize) {
            return false;
        }

        return this.capitalizeWordAtPosition(editor, wordToCapitalize, cursor);
    }

    /**
     * Finds the last sentence boundary (punctuation) in the line
     */
    private findLastSentenceBoundary(line: string): number | null {
        const sentenceEndings = /[.!?]/g;
        let lastPunctIndex = -1;
        let match;
        
        while ((match = sentenceEndings.exec(line)) !== null) {
            lastPunctIndex = match.index;
        }
        
        return lastPunctIndex === -1 ? null : lastPunctIndex;
    }

    /**
     * Finds the first word after a sentence boundary that needs capitalization
     */
    private findWordAfterSentenceBoundary(
        line: string, 
        boundaryIndex: number, 
        cursor: EditorPosition
    ): { word: string; startPos: number; endPos: number } | null {
        const afterPunctuation = line.substring(boundaryIndex + 1);
        const wordMatch = afterPunctuation.match(/^\s*([a-z]+)/);
        
        if (this.config.debug) {
            console.log('NLPCapitalizer: Sentence boundary analysis', {
                boundaryIndex,
                afterPunctuation: `"${afterPunctuation}"`,
                wordMatch: wordMatch ? wordMatch[1] : null
            });
        }
        
        if (!wordMatch || !wordMatch[1]) {
            return null;
        }

        const lowercaseWord = wordMatch[1];
        const wordStartInAfterPunct = wordMatch.index! + (wordMatch[0].length - lowercaseWord.length);
        const wordStart = boundaryIndex + 1 + wordStartInAfterPunct;
        const wordEnd = wordStart + lowercaseWord.length;
        
        // Only capitalize if the cursor is positioned after this word (we're actively typing)
        if (cursor.ch < wordEnd) {
            return null;
        }

        return {
            word: lowercaseWord,
            startPos: wordStart,
            endPos: wordEnd
        };
    }

    /**
     * Capitalizes a word at the given position if it should be capitalized
     */
    private capitalizeWordAtPosition(
        editor: Editor,
        wordInfo: { word: string; startPos: number; endPos: number },
        cursor: EditorPosition
    ): boolean {
        if (this.config.debug) {
            console.log('NLPCapitalizer: Found word to capitalize', {
                word: wordInfo.word,
                startPos: wordInfo.startPos,
                endPos: wordInfo.endPos,
                cursorCh: cursor.ch
            });
        }

        if (!this.shouldCapitalizeWord(wordInfo.word)) {
            return false;
        }

        const capitalizedWord = this.capitalizeWord(wordInfo.word);
        
        const startPos: EditorPosition = { line: cursor.line, ch: wordInfo.startPos };
        const endPos: EditorPosition = { line: cursor.line, ch: wordInfo.endPos };
        
        editor.replaceRange(capitalizedWord, startPos, endPos);
        
        if (this.config.debug) {
            console.log('NLPCapitalizer: Sentence capitalization applied', {
                original: wordInfo.word,
                capitalized: capitalizedWord,
                position: { start: startPos, end: endPos }
            });
        }
        
        return true;
    }

    /**
     * Capitalizes words at the start of completed sentences when a sentence ending is typed
     */
    private capitalizeCompletedSentence(
        editor: Editor,
        cursor: EditorPosition,
        currentLine: string
    ): boolean {
        if (this.config.debug) {
            console.log('NLPCapitalizer: capitalizeCompletedSentence', {
                currentLine,
                cursorPos: cursor.ch
            });
        }

        const boundaries = this.findAllSentenceBoundaries(currentLine);
        if (boundaries.length === 0) {
            return false;
        }

        let madeChanges = false;
        
        // For each sentence boundary, check if there's a sentence after it that needs capitalization
        for (let i = 0; i < boundaries.length; i++) {
            const boundaryPos = boundaries[i];
            const nextBoundaryPos = i + 1 < boundaries.length ? boundaries[i + 1] : currentLine.length;
            
            const sentenceRange = { start: boundaryPos + 1, end: nextBoundaryPos };
            const wordToCapitalize = this.findFirstWordInSentenceRange(currentLine, sentenceRange);
            
            if (wordToCapitalize && this.capitalizeWordInCompletedSentence(editor, wordToCapitalize, cursor)) {
                madeChanges = true;
            }
        }
        
        return madeChanges;
    }

    /**
     * Finds all sentence boundaries in a line
     */
    private findAllSentenceBoundaries(line: string): number[] {
        const sentenceEndings = /[.!?]/g;
        const boundaries: number[] = [];
        let match;
        
        while ((match = sentenceEndings.exec(line)) !== null) {
            boundaries.push(match.index);
        }
        
        if (this.config.debug) {
            console.log('NLPCapitalizer: Found sentence boundaries at', boundaries);
        }
        
        return boundaries;
    }

    /**
     * Finds the first word in a sentence range that needs capitalization
     */
    private findFirstWordInSentenceRange(
        line: string, 
        range: { start: number; end: number }
    ): { word: string; absoluteStart: number; absoluteEnd: number } | null {
        const sentenceText = line.substring(range.start, range.end);
        const wordMatch = sentenceText.match(/^\s*([a-z]+)/);
        
        if (!wordMatch || !wordMatch[1]) {
            return null;
        }

        const lowercaseWord = wordMatch[1];
        const wordStartInSentence = wordMatch.index! + (wordMatch[0].length - lowercaseWord.length);
        const absoluteWordStart = range.start + wordStartInSentence;
        const absoluteWordEnd = absoluteWordStart + lowercaseWord.length;
        
        if (this.config.debug) {
            console.log('NLPCapitalizer: Found sentence to capitalize', {
                boundaryPos: range.start - 1,
                sentenceText: `"${sentenceText}"`,
                lowercaseWord,
                absoluteWordStart,
                absoluteWordEnd
            });
        }
        
        return {
            word: lowercaseWord,
            absoluteStart: absoluteWordStart,
            absoluteEnd: absoluteWordEnd
        };
    }

    /**
     * Capitalizes a word in a completed sentence
     */
    private capitalizeWordInCompletedSentence(
        editor: Editor,
        wordInfo: { word: string; absoluteStart: number; absoluteEnd: number },
        cursor: EditorPosition
    ): boolean {
        if (!this.shouldCapitalizeWord(wordInfo.word)) {
            return false;
        }

        const capitalizedWord = this.capitalizeWord(wordInfo.word);
        
        const startPos: EditorPosition = { line: cursor.line, ch: wordInfo.absoluteStart };
        const endPos: EditorPosition = { line: cursor.line, ch: wordInfo.absoluteEnd };
        
        editor.replaceRange(capitalizedWord, startPos, endPos);
        
        if (this.config.debug) {
            console.log('NLPCapitalizer: Capitalized completed sentence word', {
                original: wordInfo.word,
                capitalized: capitalizedWord,
                position: { start: startPos, end: endPos }
            });
        }
        
        return true;
    }

    /**
     * Capitalizes the first word of a detected sentence
     */
    private capitalizeSentenceFirstWord(
        editor: Editor,
        sentence: string,
        sentenceStartPos: number,
        cursorAbsolutePos: number,
        contextLines: string[]
    ): boolean {
        if (this.config.debug) {
            console.log('NLPCapitalizer: capitalizeSentenceFirstWord called', {
                sentence: sentence.substring(0, DEBUG_SENTENCE_MAX_LENGTH) + (sentence.length > DEBUG_SENTENCE_MAX_LENGTH ? '...' : ''),
                sentenceStartPos,
                cursorAbsolutePos
            });
        }

        const firstWord = this.extractFirstWordFromSentence(sentence);
        if (!firstWord) {
            return false;
        }

        if (!this.shouldCapitalizeWord(firstWord)) {
            if (this.config.debug) {
                console.log('NLPCapitalizer: Word should not be capitalized');
            }
            return false;
        }

        const wordPosition = this.findWordPositionInEditor(
            editor,
            firstWord,
            sentenceStartPos,
            contextLines
        );

        if (!wordPosition) {
            if (this.config.debug) {
                console.log('NLPCapitalizer: Word position not found');
            }
            return false;
        }

        return this.applyCapitalizationToWord(editor, firstWord, wordPosition, sentence);
    }

    /**
     * Extracts the first word from a sentence using NLP
     */
    private extractFirstWordFromSentence(sentence: string): string | null {
        const sentenceDoc = nlp(sentence);
        const firstTerm = sentenceDoc.terms().first();
        
        if (!firstTerm.found) {
            if (this.config.debug) {
                console.log('NLPCapitalizer: No first term found in sentence');
            }
            return null;
        }

        const firstWord = firstTerm.text();
        const cleanFirstWord = firstWord.replace(/[^\w]/g, ''); // Remove punctuation
        
        if (this.config.debug) {
            console.log('NLPCapitalizer: First word analysis', {
                firstWord,
                cleanFirstWord,
                shouldCapitalize: this.shouldCapitalizeWord(cleanFirstWord)
            });
        }
        
        return cleanFirstWord;
    }

    /**
     * Applies capitalization to a word at the given position
     */
    private applyCapitalizationToWord(
        editor: Editor,
        word: string,
        wordPosition: { start: EditorPosition; end: EditorPosition },
        sentence: string
    ): boolean {
        if (this.config.debug) {
            console.log('NLPCapitalizer: Word position search result', {
                wordPosition,
                searchingFor: word
            });
        }

        const capitalizedWord = this.capitalizeWord(word);
        if (capitalizedWord === word) {
            if (this.config.debug) {
                console.log('NLPCapitalizer: Word already capitalized');
            }
            return false;
        }

        // Replace in editor
        editor.replaceRange(capitalizedWord, wordPosition.start, wordPosition.end);
        
        if (this.config.debug) {
            console.log('NLPCapitalizer: Sentence capitalization applied', {
                sentence: sentence.substring(0, DEBUG_SENTENCE_MAX_LENGTH) + '...',
                original: word,
                capitalized: capitalizedWord
            });
        }
        
        return true;
    }

    /**
     * Finds the editor position of a word
     */
    private findWordPositionInEditor(
        editor: Editor,
        word: string,
        sentenceStartPos: number,
        contextLines: string[]
    ): { start: EditorPosition; end: EditorPosition } | null {
        // This is a simplified implementation
        // In practice, you'd want more sophisticated word boundary detection
        const fullText = contextLines.join('\n');
        const wordIndex = fullText.indexOf(word, sentenceStartPos);
        
        if (this.config.debug) {
            console.log('NLPCapitalizer: findWordPositionInEditor', {
                word,
                sentenceStartPos,
                fullText: fullText.substring(0, DEBUG_FULL_TEXT_MAX_LENGTH) + (fullText.length > DEBUG_FULL_TEXT_MAX_LENGTH ? '...' : ''),
                wordIndex,
                searchSubstring: fullText.substring(sentenceStartPos, sentenceStartPos + DEBUG_SENTENCE_MAX_LENGTH)
            });
        }
        
        if (wordIndex === -1) {
            if (this.config.debug) {
                console.log('NLPCapitalizer: Word not found in full text');
            }
            return null;
        }

        // Convert absolute position back to line/ch coordinates
        let currentPos = 0;
        let lineNum = Math.max(0, editor.getCursor().line - 3);
        
        for (let i = 0; i < contextLines.length; i++) {
            const lineEnd = currentPos + contextLines[i].length;
            
            if (wordIndex >= currentPos && wordIndex < lineEnd) {
                const ch = wordIndex - currentPos;
                const result = {
                    start: { line: lineNum + i, ch },
                    end: { line: lineNum + i, ch: ch + word.length }
                };
                
                if (this.config.debug) {
                    console.log('NLPCapitalizer: Word position found', {
                        result,
                        lineContent: contextLines[i],
                        wordInLine: contextLines[i].substring(ch, ch + word.length)
                    });
                }
                
                return result;
            }
            
            currentPos = lineEnd + 1; // +1 for newline
        }
        
        if (this.config.debug) {
            console.log('NLPCapitalizer: Word position conversion failed');
        }
        
        return null;
    }

    /**
     * Gets context lines around the cursor for better sentence detection
     */
    private getContextLines(editor: Editor, cursor: EditorPosition, radius: number): string[] {
        const lines: string[] = [];
        const totalLines = editor.lineCount();
        
        const startLine = Math.max(0, cursor.line - radius);
        const endLine = Math.min(totalLines - 1, cursor.line + radius);
        
        for (let i = startLine; i <= endLine; i++) {
            lines.push(editor.getLine(i));
        }
        
        return lines;
    }

    /**
     * Determines if we should attempt capitalization in the current context
     */
    private shouldCapitalizeInContext(editor: Editor, cursor: EditorPosition): boolean {
        // Don't capitalize in front matter blocks
        if (isInFrontMatterBlock(editor, cursor)) {
            return false;
        }

        // Don't capitalize in code blocks (fenced or indented)
        if (this.isInCodeBlock(editor, cursor)) {
            return false;
        }

        // Don't capitalize in inline code
        const line = editor.getLine(cursor.line);
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
     * Determines if we should attempt capitalization based on settings
     */
    private shouldAttemptCapitalization(editor: Editor, cursor: EditorPosition): boolean {
        // Check if either line-level OR sentence-level capitalization is enabled
        return this.config.capitalizeLines || this.config.capitalizeSentences;
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

        // Find the first word in the remaining text using a simple word pattern
        const wordMatch = remainingText.match(/[\p{L}\d]+(?:[-'_][\p{L}\d]+)*/u);
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
        if (!word || word.length === 0) {
            return false;
        }

        // Must be a valid word (letters/digits)
        if (!/[\p{L}\d]/u.test(word)) {
            return false;
        }

        // Don't capitalize mixed-case words if preserveMixedCase is true
        if (this.config.preserveMixedCase && this.isMixedCaseWord(word)) {
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

    /**
     * Checks if a character can end a sentence
     */
    static isSentenceEndTrigger(char: string): boolean {
        return /[.!?]/.test(char);
    }
} 