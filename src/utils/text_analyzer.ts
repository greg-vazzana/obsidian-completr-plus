/**
 * Enhanced text analysis module for intelligent capitalization
 * Provides comprehensive pattern detection and context analysis
 */

export interface PatternMatch {
    type: 'url' | 'email' | 'ellipses' | 'abbreviation' | 'markdownLink' | 'inlineCode';
    start: number;
    end: number;
    text: string;
}

export interface SentenceBoundary {
    position: number;
    type: '.' | '!' | '?';
    isRealBoundary: boolean; // false if it's part of abbreviation, URL, etc.
}

export interface ContextAnalysis {
    shouldSkipCapitalization: boolean;
    reason?: string;
    matchedPatterns: PatternMatch[];
    nearbyBoundaries: SentenceBoundary[];
}

/**
 * Enhanced text analyzer with comprehensive pattern detection
 */
export class TextAnalyzer {
    // Comprehensive pattern definitions
    private static readonly PATTERNS = {
        // URLs - HTTP(S) and www formats
        url: /(?:https?:\/\/|www\.)[^\s\])}]+/gi,
        
        // Emails - standard and extended formats
        email: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/gi,
        
        // Ellipses - three or more dots, or Unicode ellipsis
        ellipses: /\.{3,}|…/g,
        
        // Markdown links - [text](url), [[wikilink]], [text][ref]
        markdownLink: /\[([^\]]*)\]\(([^)]*)\)|\[\[([^\]]*)\]\]|\[([^\]]*)\]\[([^\]]*)\]/g,
        
        // Inline code - `code` or ``code``
        inlineCode: /`+[^`]*`+/g,
        
        // Abbreviations with periods
        abbreviation: /\b(?:Dr|Mr|Mrs|Ms|Prof|Inc|Corp|Ltd|etc|e\.g|i\.e|vs|cf|et\s+al|viz|St|Ave|Blvd|LLC|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\./gi,
    };

    /**
     * Analyzes text around a cursor position for capitalization context
     */
    static analyzeContext(text: string, cursorPosition: number): ContextAnalysis {
        const matchedPatterns = this.findAllPatterns(text);
        const nearbyBoundaries = this.findSentenceBoundaries(text);
        
        // Check if cursor is within any pattern that should prevent capitalization
        const blockingPattern = matchedPatterns.find(pattern => 
            cursorPosition >= pattern.start && cursorPosition <= pattern.end
        );

        return {
            shouldSkipCapitalization: !!blockingPattern,
            reason: blockingPattern?.type,
            matchedPatterns,
            nearbyBoundaries
        };
    }

    /**
     * Checks if a position is within a special context that should prevent capitalization
     */
    static isInSpecialContext(text: string, position: number): boolean {
        const patterns = this.findAllPatterns(text);
        return patterns.some(pattern => 
            position >= pattern.start && position <= pattern.end
        );
    }

    /**
     * Finds all pattern matches in text
     */
    private static findAllPatterns(text: string): PatternMatch[] {
        const matches: PatternMatch[] = [];

        // Find each pattern type
        Object.entries(this.PATTERNS).forEach(([type, pattern]) => {
            // Reset regex lastIndex for global patterns
            pattern.lastIndex = 0;
            
            let match;
            while ((match = pattern.exec(text)) !== null) {
                matches.push({
                    type: type as PatternMatch['type'],
                    start: match.index,
                    end: match.index + match[0].length,
                    text: match[0]
                });
                
                // Prevent infinite loop for zero-length matches
                if (match.index === pattern.lastIndex) {
                    pattern.lastIndex++;
                }
            }
        });

        // Sort by position
        return matches.sort((a, b) => a.start - b.start);
    }

    /**
     * Finds real sentence boundaries, excluding those within patterns
     */
    static findSentenceBoundaries(text: string): SentenceBoundary[] {
        const boundaries: SentenceBoundary[] = [];
        const patterns = this.findAllPatterns(text);
        const sentenceEndRegex = /[.!?]/g;

        let match;
        while ((match = sentenceEndRegex.exec(text)) !== null) {
            const position = match.index;
            const type = match[0] as '.' | '!' | '?';
            
            // Check if this punctuation is within a pattern
            const withinPattern = patterns.some(pattern => 
                position >= pattern.start && position < pattern.end
            );

            boundaries.push({
                position,
                type,
                isRealBoundary: !withinPattern
            });
        }

        return boundaries;
    }

    /**
     * Checks if text contains URLs
     */
    static hasUrls(text: string): boolean {
        this.PATTERNS.url.lastIndex = 0;
        return this.PATTERNS.url.test(text);
    }

    /**
     * Checks if text contains emails
     */
    static hasEmails(text: string): boolean {
        this.PATTERNS.email.lastIndex = 0;
        return this.PATTERNS.email.test(text);
    }

    /**
     * Checks if text contains ellipses
     */
    static hasEllipses(text: string): boolean {
        this.PATTERNS.ellipses.lastIndex = 0;
        return this.PATTERNS.ellipses.test(text);
    }

    /**
     * Extracts the word at a specific position
     */
    static getWordAtPosition(text: string, position: number): { word: string; start: number; end: number } | null {
        // Word pattern that matches the existing WordPatterns logic
        const wordPattern = /[\p{L}\d]+(?:[-'_][\p{L}\d]+)*/gu;
        
        let match;
        while ((match = wordPattern.exec(text)) !== null) {
            const start = match.index;
            const end = start + match[0].length;
            
            // Position must be within the word boundaries (inclusive start, exclusive end)
            if (position >= start && position < end) {
                return {
                    word: match[0],
                    start,
                    end
                };
            }
        }
        
        return null;
    }
}