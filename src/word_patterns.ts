/**
 * Centralized word detection patterns and utilities for Completr plugin.
 * This ensures consistent word detection across all providers and features.
 */
export class WordPatterns {
    // Core word pattern used by validators and live tracking
    // Matches: letters/digits + optional internal hyphens/apostrophes/underscores + optional dot segments
    static readonly WORD_PATTERN = /[\p{L}\d]+(?:[-'_][\p{L}\d]+)*(?:\.[\p{L}\d]+)*/u;
    
    // Pre-compiled global version for efficient line scanning
    static readonly WORD_PATTERN_GLOBAL = /[\p{L}\d]+(?:[-'_][\p{L}\d]+)*(?:\.[\p{L}\d]+)*/gu;
    
    // Character pattern for single character testing
    static readonly WORD_CHARACTER_PATTERN = /[\p{L}\d]/u;
    
    // Scanner pattern (includes context and excludes certain patterns like LaTeX, code blocks, URLs)
    // This is more complex and used specifically for file scanning to avoid unwanted matches
    static readonly SCANNER_PATTERN = /\$+.*?\$+|`+.*?`+|\[+.*?\]+|https?:\/\/[^\n\s]+|(?:^|(?<=\s|[.,]))(?:[\p{L}\d]+(?:[-'_][\p{L}\d]+)*(?:\.[\p{L}\d]+)*)/gsu;
    
    /**
     * Test if a single character is a word character (letter or digit)
     */
    static isWordCharacter(char: string): boolean {
        return WordPatterns.WORD_CHARACTER_PATTERN.test(char);
    }
    
    /**
     * Validate if a string is a valid word according to our word pattern
     */
    static isValidWord(word: string): boolean {
        return WordPatterns.WORD_PATTERN.test(word);
    }
    
    /**
     * Extract all words from a line using the basic word pattern
     * This is used for live tracking and general word extraction
     */
    static extractWordsFromLine(line: string): RegExpMatchArray[] {
        // Reset the regex to ensure we start from the beginning
        WordPatterns.WORD_PATTERN_GLOBAL.lastIndex = 0;
        return Array.from(line.matchAll(WordPatterns.WORD_PATTERN_GLOBAL)) as RegExpMatchArray[];
    }
    
    /**
     * Find word at cursor position (for live tracking)
     * @param line The line of text
     * @param position The character position in the line
     * @returns The word ending at the given position, or null if no word found
     */
    static findWordAtPosition(line: string, position: number): string | null {
        const matches = WordPatterns.extractWordsFromLine(line);
        
        for (const match of matches) {
            if (match.index === undefined || !match[0]) continue;
            
            const matchStart = match.index;
            const matchEnd = matchStart + match[0].length;
            
            // Check if the position is right after this word
            if (position === matchEnd) {
                return match[0];
            }
        }
        
        return null;
    }
    
    /**
     * Create a character predicate function for backward compatibility with existing code
     * This can be used with matchWordBackwards and other functions that expect a character test
     */
    static createCharacterPredicate(): (char: string) => boolean {
        return (char: string) => WordPatterns.isWordCharacter(char);
    }
}
