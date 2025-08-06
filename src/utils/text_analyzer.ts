/**
 * Enhanced text analysis module for intelligent capitalization
 * Provides comprehensive pattern detection and context analysis
 */

export interface PatternMatch {
    type: 'url' | 'email' | 'ellipses' | 'abbreviation' | 'markdownLink' | 'inlineCode' | 'fencedCodeBlock';
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
 * Result of code block context analysis
 */
export interface CodeBlockContext {
    isInCodeBlock: boolean;
    blockType: 'fencedCodeBlock' | 'inlineCode';
    blockStart: number;
    blockEnd?: number;
    blockContent?: string;
}

export interface EntityAnalysis {
    people: Array<{ text: string; start: number; end: number }>;
    places: Array<{ text: string; start: number; end: number }>;
    organizations: Array<{ text: string; start: number; end: number }>;
    acronyms: Array<{ text: string; start: number; end: number }>;
    properNouns: Array<{ text: string; start: number; end: number }>;
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
        
        // Fenced code blocks - ```code``` with optional language specifier (must come before inline code)
        fencedCodeBlock: /```[a-zA-Z0-9]*\s*[\s\S]*?```/g,
        
        // Inline code - `code` or ``code`` (avoid matching triple backticks)
        inlineCode: /`{1,2}[^`\n]+`{1,2}/g,
        
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
        let blockingPattern = matchedPatterns.find(pattern => 
            cursorPosition >= pattern.start && cursorPosition <= pattern.end
        );

        // Additional check for open/incomplete code blocks using stack-based detection
        if (!blockingPattern) {
            const codeBlockStatus = this.analyzeCodeBlockContext(text, cursorPosition);
            if (codeBlockStatus.isInCodeBlock) {
                blockingPattern = {
                    type: codeBlockStatus.blockType,
                    start: codeBlockStatus.blockStart,
                    end: codeBlockStatus.blockEnd || text.length,
                    text: codeBlockStatus.blockContent || ''
                };
            }
        }

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
     * Analyzes code block context using stack-based detection to handle open/incomplete blocks
     */
    static analyzeCodeBlockContext(text: string, position: number): CodeBlockContext {
        const lines = text.split('\n');
        let currentPos = 0;
        let currentLine = 0;
        
        // Find which line the position is on
        for (let i = 0; i < lines.length; i++) {
            if (currentPos + lines[i].length >= position) {
                currentLine = i;
                break;
            }
            currentPos += lines[i].length + 1; // +1 for newline
        }
        
        // Check for inline code first (higher priority and simpler)
        const inlineCodeResult = this.checkInlineCodeContext(text, position);
        if (inlineCodeResult.isInCodeBlock) {
            return inlineCodeResult;
        }
        
        // Check for fenced code blocks using stack-based approach
        return this.checkFencedCodeBlockContext(lines, currentLine, position, currentPos);
    }

    /**
     * Checks if position is within inline code (`code` or ``code``)
     */
    private static checkInlineCodeContext(text: string, position: number): CodeBlockContext {
        // Look for inline code patterns around the position
        const beforeText = text.substring(0, position);
        const afterText = text.substring(position);
        
        // Find the last backtick(s) before position
        const backticksBeforeMatch = beforeText.match(/`{1,2}(?:[^`])*$/);
        if (!backticksBeforeMatch) {
            return { isInCodeBlock: false, blockType: 'inlineCode', blockStart: -1 };
        }
        
        const openingBackticks = backticksBeforeMatch[0].match(/^`{1,2}/)?.[0] || '';
        const openingPos = beforeText.length - backticksBeforeMatch[0].length;
        
        // Look for matching closing backticks after position
        const closingPattern = new RegExp(`^[^\\n]*?${openingBackticks}`);
        const closingMatch = afterText.match(closingPattern);
        
        if (closingMatch) {
            const closingPos = position + closingMatch[0].length;
            return {
                isInCodeBlock: true,
                blockType: 'inlineCode',
                blockStart: openingPos,
                blockEnd: closingPos,
                blockContent: text.substring(openingPos, closingPos)
            };
        }
        
        // If we found opening backticks but no closing ones, still consider it inline code
        // This handles cases where someone is typing incomplete inline code
        return {
            isInCodeBlock: true,
            blockType: 'inlineCode',
            blockStart: openingPos,
            blockContent: beforeText.substring(openingPos) + afterText
        };
    }

    /**
     * Checks if position is within a fenced code block using stack-based detection
     */
    private static checkFencedCodeBlockContext(lines: string[], currentLine: number, position: number, currentPos: number): CodeBlockContext {
        let inCodeBlock = false;
        let codeBlockStart = -1;
        let codeBlockStartLine = -1;
        
        // Scan from beginning to current line to determine if we're in a code block
        for (let i = 0; i <= currentLine; i++) {
            const line = lines[i].trim();
            
            // Check for fenced code block markers (``` or ``` with language)
            if (line.match(/^```/)) {
                if (!inCodeBlock) {
                    // Opening a code block
                    inCodeBlock = true;
                    codeBlockStart = this.getLineStartPosition(lines, i);
                    codeBlockStartLine = i;
                } else {
                    // Closing a code block
                    inCodeBlock = false;
                    codeBlockStart = -1;
                    codeBlockStartLine = -1;
                }
            }
        }
        
        if (inCodeBlock && codeBlockStartLine !== -1) {
            // Find the end of the code block (or end of text if incomplete)
            let codeBlockEnd: number | undefined;
            let blockContent = '';
            
            for (let i = codeBlockStartLine + 1; i < lines.length; i++) {
                const line = lines[i];
                if (line.trim().match(/^```$/)) {
                    codeBlockEnd = this.getLineStartPosition(lines, i) + line.length;
                    break;
                }
                blockContent += line + (i < lines.length - 1 ? '\n' : '');
            }
            
            return {
                isInCodeBlock: true,
                blockType: 'fencedCodeBlock',
                blockStart: codeBlockStart,
                blockEnd: codeBlockEnd,
                blockContent: blockContent
            };
        }
        
        return { isInCodeBlock: false, blockType: 'fencedCodeBlock', blockStart: -1 };
    }

    /**
     * Helper to get the absolute position of the start of a line
     */
    private static getLineStartPosition(lines: string[], lineIndex: number): number {
        let position = 0;
        for (let i = 0; i < lineIndex; i++) {
            position += lines[i].length + 1; // +1 for newline
        }
        return position;
    }

    /**
     * Finds all pattern matches in text
     */
    private static findAllPatterns(text: string): PatternMatch[] {
        const matches: PatternMatch[] = [];

        // Find each pattern type in priority order (fenced code blocks before inline code)
        const patternOrder = [
            'fencedCodeBlock', 
            'inlineCode', 
            'markdownLink', 
            'url', 
            'email', 
            'abbreviation', 
            'ellipses'
        ];

        patternOrder.forEach(type => {
            const pattern = this.PATTERNS[type as keyof typeof this.PATTERNS];
            if (!pattern) return;

            // Reset regex lastIndex for global patterns
            pattern.lastIndex = 0;
            
            let match: RegExpExecArray | null;
            while ((match = pattern.exec(text)) !== null) {
                // Check if this area is already covered by a higher-priority pattern
                const overlaps = matches.some(existing => 
                    (match.index >= existing.start && match.index < existing.end) ||
                    (match.index + match[0].length > existing.start && match.index + match[0].length <= existing.end) ||
                    (match.index <= existing.start && match.index + match[0].length >= existing.end)
                );

                if (!overlaps) {
                    matches.push({
                        type: type as PatternMatch['type'],
                        start: match.index,
                        end: match.index + match[0].length,
                        text: match[0]
                    });
                }
                
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

    /**
     * ENTITY RECOGNITION ENHANCEMENTS
     * These methods use compromise.js for intelligent capitalization decisions
     */

    /**
     * Analyzes text for entities and proper nouns using compromise.js
     */
    static analyzeEntities(text: string): EntityAnalysis {
        try {
            // Use dynamic import to avoid issues if compromise isn't available
            const nlp = require('compromise');
            const doc = nlp(text);

            // Get all entities
            const people = doc.people().json();
            const places = doc.places().json();
            const organizations = doc.organizations().json();
            const acronyms = doc.acronyms().json();

            // Get proper nouns via POS tags
            const properNouns = doc.match('#ProperNoun').json();

            return {
                people: people.map((p: any) => ({ text: p.text, start: p.terms[0]?.offset?.start || 0, end: p.terms[p.terms.length - 1]?.offset?.end || 0 })),
                places: places.map((p: any) => ({ text: p.text, start: p.terms[0]?.offset?.start || 0, end: p.terms[p.terms.length - 1]?.offset?.end || 0 })),
                organizations: organizations.map((p: any) => ({ text: p.text, start: p.terms[0]?.offset?.start || 0, end: p.terms[p.terms.length - 1]?.offset?.end || 0 })),
                acronyms: acronyms.map((p: any) => ({ text: p.text, start: p.terms[0]?.offset?.start || 0, end: p.terms[p.terms.length - 1]?.offset?.end || 0 })),
                properNouns: properNouns.map((p: any) => ({ text: p.text, start: p.terms[0]?.offset?.start || 0, end: p.terms[p.terms.length - 1]?.offset?.end || 0 }))
            };
        } catch (error) {
            // Fallback if compromise.js fails
            return {
                people: [],
                places: [],
                organizations: [],
                acronyms: [],
                properNouns: []
            };
        }
    }

    /**
     * Checks if a word is likely a proper noun based on entity recognition
     */
    static isProperNoun(word: string, context?: string): boolean {
        try {
            const nlp = require('compromise');
            const testText = context || word;
            const doc = nlp(testText);
            
            // Check if the word is tagged as a proper noun (case-insensitive)
            const wordDoc = doc.match(word) || doc.match(word.toLowerCase());
            if (wordDoc.found) {
                const tagsObj = wordDoc.out('tags')[0];
                // tagsObj is {word: ['tag1', 'tag2']}, we need to get the array
                const tagArrays = Object.values(tagsObj);
                if (tagArrays.length > 0) {
                    const tags = tagArrays[0] as string[];
                    return tags && Array.isArray(tags) && (
                        tags.includes('ProperNoun') ||
                        tags.includes('Person') ||
                        tags.includes('Place') ||
                        tags.includes('Organization') ||
                        tags.includes('Acronym')
                    );
                }
            }
            
            return false;
        } catch (error) {
            return false;
        }
    }

    /**
     * Gets the proper capitalization for a word based on entity recognition
     */
    static getProperCapitalization(word: string, context?: string): string | null {
        try {
            const nlp = require('compromise');
            const testText = context || word;
            const doc = nlp(testText);
            
            // Get entity matches
            const entities = this.analyzeEntities(testText);
            
            // Check if word is part of any entity
            const allEntities = [
                ...entities.people,
                ...entities.places, 
                ...entities.organizations,
                ...entities.acronyms,
                ...entities.properNouns
            ];
            
            for (const entity of allEntities) {
                if (entity.text.toLowerCase().includes(word.toLowerCase())) {
                    // Find the word within the entity text and return its proper capitalization
                    const entityWords = entity.text.split(/\s+/);
                    const matchingWord = entityWords.find(w => w.toLowerCase() === word.toLowerCase());
                    if (matchingWord) {
                        return matchingWord;
                    }
                }
            }
            
            return null;
        } catch (error) {
            return null;
        }
    }

    /**
     * Checks if a word should be capitalized as a brand name or product
     */
    static isBrandName(word: string): boolean {
        // Common tech brands that compromise might miss
        const knownBrands = [
            'iphone', 'ipad', 'macbook', 'javascript', 'typescript', 'jquery',
            'react', 'angular', 'vue', 'nodejs', 'webpack', 'docker',
            'kubernetes', 'mongodb', 'postgresql', 'redis', 'nginx'
        ];
        
        const lower = word.toLowerCase();
        return knownBrands.includes(lower);
    }

    /**
     * Gets brand name proper capitalization
     */
    static getBrandCapitalization(word: string): string | null {
        const brandMap: { [key: string]: string } = {
            'iphone': 'iPhone',
            'ipad': 'iPad', 
            'macbook': 'MacBook',
            'javascript': 'JavaScript',
            'typescript': 'TypeScript',
            'jquery': 'jQuery',
            'react': 'React',
            'angular': 'Angular',
            'vue': 'Vue',
            'nodejs': 'Node.js',
            'webpack': 'Webpack',
            'docker': 'Docker',
            'kubernetes': 'Kubernetes',
            'mongodb': 'MongoDB',
            'postgresql': 'PostgreSQL',
            'redis': 'Redis',
            'nginx': 'Nginx'
        };
        
        return brandMap[word.toLowerCase()] || null;
    }

    /**
     * Enhanced proper noun detection combining compromise.js and brand recognition
     */
    static shouldCapitalizeAsProperNoun(word: string, context?: string): boolean {
        return this.isProperNoun(word, context) || this.isBrandName(word);
    }

    /**
     * Gets the best capitalization for a word using all available intelligence
     */
    static getIntelligentCapitalization(word: string, context?: string): string | null {
        // Try entity recognition first
        const entityCapitalization = this.getProperCapitalization(word, context);
        if (entityCapitalization) {
            return entityCapitalization;
        }
        
        // Try brand name recognition
        const brandCapitalization = this.getBrandCapitalization(word);
        if (brandCapitalization) {
            return brandCapitalization;
        }
        
        return null;
    }
}