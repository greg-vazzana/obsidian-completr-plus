import { Editor, EditorPosition } from "obsidian";
import nlp from "compromise";

import { DEBUG_SENTENCE_MAX_LENGTH, DEBUG_FULL_TEXT_MAX_LENGTH } from "./constants";
import { ValidationUtils } from "./utils/validation_utils";
import { TextAnalyzer, ContextAnalysis } from "./utils/text_analyzer";

/**
 * Configuration options for intelligent capitalization
 */
export interface CapitalizationConfig {
    /**
     * Enable automatic capitalization
     */
    enabled: boolean;
    
    /**
     * Capitalize first word of lines (after markdown prefixes)
     */
    capitalizeLines: boolean;
    
    /**
     * Capitalize first word after sentence boundaries
     */
    capitalizeSentences: boolean;
    
    /**
     * Preserve mixed-case words (iPhone, JavaScript, etc.)
     */
    preserveMixedCase: boolean;
    
    /**
     * Skip capitalization in special contexts (URLs, emails, code, etc.)
     */
    respectSpecialContexts: boolean;
    
    /**
     * Enable debug logging
     */
    debug: boolean;
}

/**
 * Performance cache for text analysis
 */
interface AnalysisCache {
    text: string;
    analysis: ContextAnalysis;
    timestamp: number;
}

/**
 * Context information for capitalization decisions
 */
interface CapitalizationContext {
    line: string;
    fullText: string;
    absolutePosition: number;
}

/**
 * Intelligent text capitalizer with comprehensive context awareness
 * Optimized for real-time typing with minimal performance impact
 */
export default class NLPCapitalizer {
    private config: CapitalizationConfig;
    private analysisCache: AnalysisCache | null = null;
    private readonly CACHE_TTL = 1000; // 1 second cache TTL
    
    constructor(config: Partial<CapitalizationConfig> = {}) {
        this.config = {
            enabled: true,
            capitalizeLines: true,
            capitalizeSentences: true,
            preserveMixedCase: true,
            respectSpecialContexts: true,
            debug: false,
            ...config
        };
    }

    /**
     * Updates the configuration
     */
    updateConfig(newConfig: Partial<CapitalizationConfig>): void {
        this.config = { ...this.config, ...newConfig };
        // Clear cache when config changes
        this.analysisCache = null;
    }

    /**
     * Attempts to capitalize words based on intelligent context analysis
     * Optimized for real-time typing performance
     */
    attemptCapitalization(editor: Editor, cursor: EditorPosition, trigger: string): void {
        if (!this.config.enabled) return;

        if (this.config.debug) {
            console.log('NLPCapitalizer: attemptCapitalization called', { cursor, trigger });
        }

        // Early exit checks for performance
        if (!this.shouldAttemptCapitalization(cursor)) {
            return;
        }

        // Get context for analysis (optimized scope)
        const context = this.getOptimizedContext(editor, cursor);
        const analysis = this.getContextAnalysis(context, cursor);

        // Skip if cursor is actually within a special context (not just if special patterns exist elsewhere)
        if (this.config.respectSpecialContexts && analysis.shouldSkipCapitalization) {
            // Only skip if the pattern that's blocking is not ellipses (ellipses shouldn't prevent all capitalization)
            if (analysis.reason && analysis.reason !== 'ellipses') {
                if (this.config.debug) {
                    console.log('NLPCapitalizer: Skipping - in special context:', analysis.reason);
                }
                return;
            }
        }

        // Try capitalization based on context
        this.performIntelligentCapitalization(editor, cursor, context, analysis, trigger);
    }

    /**
     * Early exit check - determines if we should even attempt capitalization
     */
    private shouldAttemptCapitalization(cursor: EditorPosition): boolean {
        // Check if either line-level OR sentence-level capitalization is enabled
        return this.config.capitalizeLines || this.config.capitalizeSentences;
    }

    /**
     * Gets optimized context for analysis - expanded scope for code block detection
     */
    private getOptimizedContext(editor: Editor, cursor: EditorPosition): CapitalizationContext {
        const line = editor.getLine(cursor.line);
        
        // Expand context window to better detect fenced code blocks and other multi-line patterns
        // Look back further to find opening ``` and forward to find closing ```
        const maxContextLines = 10; // Reasonable limit for performance
        const startLine = Math.max(0, cursor.line - maxContextLines);
        const endLine = Math.min(editor.lastLine(), cursor.line + maxContextLines);
        
        const lines: string[] = [];
        let absolutePosition = 0;
        
        for (let i = startLine; i <= endLine; i++) {
            const currentLine = editor.getLine(i);
            if (i < cursor.line) {
                absolutePosition += currentLine.length + 1; // +1 for newline
            } else if (i === cursor.line) {
                absolutePosition += cursor.ch;
            }
            lines.push(currentLine);
        }

        return {
            line,
            fullText: lines.join('\n'),
            absolutePosition
        };
    }

    /**
     * Gets cached or fresh context analysis
     */
    private getContextAnalysis(context: CapitalizationContext, cursor: EditorPosition): ContextAnalysis {
        const now = Date.now();
        
        // Check cache validity
        if (this.analysisCache && 
            this.analysisCache.text === context.fullText && 
            (now - this.analysisCache.timestamp) < this.CACHE_TTL) {
            return this.analysisCache.analysis;
        }

        // Perform fresh analysis
        const analysis = TextAnalyzer.analyzeContext(context.fullText, context.absolutePosition);
        
        // Cache the result
        this.analysisCache = {
            text: context.fullText,
            analysis,
            timestamp: now
        };

        return analysis;
    }

    /**
     * Performs intelligent capitalization based on analysis
     */
    private performIntelligentCapitalization(
        editor: Editor,
        cursor: EditorPosition,
        context: CapitalizationContext, 
        analysis: ContextAnalysis,
        trigger: string
    ): void {
        // Determine capitalization opportunities
        const opportunities = this.findCapitalizationOpportunities(context, analysis, cursor, trigger);
        
        // Apply capitalizations in reverse order to maintain positions
        opportunities.reverse().forEach(opportunity => {
            this.applyCapitalization(editor, opportunity);
        });
    }

    /**
     * Finds all capitalization opportunities in the current context
     */
    private findCapitalizationOpportunities(
        context: CapitalizationContext,
        analysis: ContextAnalysis,
        cursor: EditorPosition,
        trigger: string
    ): CapitalizationOpportunity[] {
        const opportunities: CapitalizationOpportunity[] = [];

        // Line-level capitalization
        if (this.config.capitalizeLines) {
            const lineOpportunity = this.findLineCapitalizationOpportunity(context.line, cursor);
            if (lineOpportunity) {
                opportunities.push(lineOpportunity);
            }
        }

        // Sentence-level capitalization
        if (this.config.capitalizeSentences) {
            const sentenceOpportunities = this.findSentenceCapitalizationOpportunities(
                context, analysis, cursor, trigger
            );
            opportunities.push(...sentenceOpportunities);
        }

        return opportunities;
    }

    /**
     * Finds line-level capitalization opportunity
     */
        private findLineCapitalizationOpportunity(line: string, cursor: EditorPosition): CapitalizationOpportunity | null {
        const firstWord = this.findFirstWordOnLine(line);
        if (!firstWord) return null;

        // Only capitalize if cursor is at or after the word
        if (cursor.ch < firstWord.endIndex) return null;

        // Check if the first word itself is in a special context (like within a URL)
        if (this.config.respectSpecialContexts) {
            // For line capitalization, only check if the first word itself is in a special context
            // Don't let patterns elsewhere in the line prevent line capitalization
            const patterns = TextAnalyzer['findAllPatterns'](line);
            const wordIsInPattern = patterns.some(pattern => 
                firstWord.startIndex >= pattern.start && 
                firstWord.startIndex < pattern.end &&
                // Ellipses should not prevent line capitalization
                pattern.type !== 'ellipses'
            );
            if (wordIsInPattern) return null;
        }

        if (!this.shouldCapitalizeWord(firstWord.word, line)) return null;

        const capitalizedWord = this.capitalizeWord(firstWord.word, line);
        if (capitalizedWord === firstWord.word) return null;

        return {
            type: 'line',
            word: firstWord.word,
            capitalizedWord,
            position: {
                line: cursor.line,
                startCh: firstWord.startIndex,
                endCh: firstWord.startIndex + firstWord.word.length // Use original word length for accurate replacement
            }
        };
    }

    /**
     * Finds sentence-level capitalization opportunities
     */
    private findSentenceCapitalizationOpportunities(
        context: CapitalizationContext,
        analysis: ContextAnalysis,
        cursor: EditorPosition,
        trigger: string
    ): CapitalizationOpportunity[] {
        const opportunities: CapitalizationOpportunity[] = [];

        // Use NLP for better sentence detection
        try {
            const doc = nlp(context.fullText);
            const sentences = doc.sentences().out('array');

            // Find sentences that need capitalization
            for (const sentence of sentences) {
                const sentenceOpportunity = this.findSentenceFirstWordOpportunity(
                    sentence, context, cursor
                );
                if (sentenceOpportunity) {
                    // Don't capitalize the first word of a line if line capitalization is disabled
                    if (!this.config.capitalizeLines && sentenceOpportunity.position.startCh === 0) {
                        continue;
                    }
                    opportunities.push(sentenceOpportunity);
                }
            }
        } catch (error) {
            if (this.config.debug) {
                console.error('NLPCapitalizer: Error in NLP analysis', error);
            }
        }

        return opportunities;
    }

    /**
     * Finds first word capitalization opportunity in a sentence
     */
    private findSentenceFirstWordOpportunity(
        sentence: string,
        context: CapitalizationContext,
        cursor: EditorPosition
    ): CapitalizationOpportunity | null {
        const trimmedSentence = sentence.trim();
        if (!trimmedSentence) return null;

        // Find the first word using compromise
        const sentenceDoc = nlp(trimmedSentence);
        const firstTerm = sentenceDoc.terms().first();
        
        if (!firstTerm.found) return null;

        const firstWord = firstTerm.text().replace(/[^\w]/g, '');
        if (!this.shouldCapitalizeWord(firstWord, context.fullText)) return null;

        const capitalizedWord = this.capitalizeWord(firstWord, context.fullText);
        if (capitalizedWord === firstWord) return null;

        // Find position in editor
        const wordPosition = this.findWordPositionInContext(firstWord, context, cursor);
        if (!wordPosition) return null;

        return {
            type: 'sentence',
            word: firstWord,
            capitalizedWord,
            position: wordPosition
        };
    }

    /**
     * Finds word position in the editor context
     */
    private findWordPositionInContext(
        word: string,
        context: CapitalizationContext,
        cursor: EditorPosition
    ): WordPosition | null {
        const wordRegex = new RegExp(`\\b${word}\\b`, 'i');
        const match = context.line.match(wordRegex);
        
        if (!match || match.index === undefined) return null;

        return {
            line: cursor.line,
            startCh: match.index,
            endCh: match.index + word.length // Using original word length for accurate replacement boundaries
        };
    }

    /**
     * Applies a capitalization opportunity
     */
    private applyCapitalization(editor: Editor, opportunity: CapitalizationOpportunity): void {
        const startPos: EditorPosition = { 
            line: opportunity.position.line, 
            ch: opportunity.position.startCh 
        };
        const endPos: EditorPosition = { 
            line: opportunity.position.line, 
            ch: opportunity.position.endCh 
        };

        editor.replaceRange(opportunity.capitalizedWord, startPos, endPos);
        
        if (this.config.debug) {
            console.log(`NLPCapitalizer: Applied ${opportunity.type} capitalization`, {
                original: opportunity.word,
                capitalized: opportunity.capitalizedWord,
                position: opportunity.position
            });
        }
    }

    /**
     * Finds the first word on a line, accounting for markdown prefixes
     */
    private findFirstWordOnLine(line: string): { word: string, startIndex: number, endIndex: number } | null {
        // Skip leading whitespace and markdown prefixes
        const trimmedMatch = line.match(/^(\s*(?:[#]+\s+|[-*+]\s+|\d+\.\s+|>\s*)*)(.*)/);
        if (!trimmedMatch) return null;

        const prefixLength = trimmedMatch[1].length;
        const remainingText = trimmedMatch[2];

        // Skip hashtags (tags without space after #)
        if (remainingText.match(/^#[\p{L}\d]/u)) return null;

        // Find the first word using enhanced pattern
        const wordMatch = remainingText.match(/[\p{L}\d]+(?:[-'_][\p{L}\d]+)*/u);
        if (!wordMatch || wordMatch.index === undefined) return null;

        const word = wordMatch[0];
        const startIndex = prefixLength + wordMatch.index;
        const endIndex = startIndex + word.length;

        return { word, startIndex, endIndex };
    }

    /**
     * Determines if a word should be capitalized
     */
    private shouldCapitalizeWord(word: string, context?: string): boolean {
        if (!word || word.length === 0) return false;
        if (!/[\p{L}\d]/u.test(word)) return false;

        // Enhanced logic: Use entity recognition if context is available
        if (context && this.config.respectSpecialContexts) {
            // Check if this is a proper noun that should be capitalized with specific rules
            if (TextAnalyzer.shouldCapitalizeAsProperNoun(word, context)) {
                return true; // Always capitalize proper nouns
            }
        }

        // Don't capitalize mixed-case words if preserveMixedCase is enabled
        if (this.config.preserveMixedCase && this.isMixedCaseWord(word)) {
            return false;
        }

        return true;
    }

    /**
     * Checks if a word has mixed case
     */
    private isMixedCaseWord(word: string): boolean {
        if (word.length <= 1) return false;
        const afterFirstChar = word.slice(1);
        return /[A-Z]/.test(afterFirstChar);
    }

    /**
     * Capitalizes a word (first letter uppercase, rest unchanged for mixed case preservation)
     */
    private capitalizeWord(word: string, context?: string): string {
        if (word.length === 0) return word;
        
        // Enhanced logic: Try intelligent capitalization first, but respect user settings
        if (context && this.config.respectSpecialContexts) {
            const intelligentCapitalization = TextAnalyzer.getIntelligentCapitalization(word, context);
            if (intelligentCapitalization) {
                // Only use intelligent capitalization if it doesn't conflict with preserveMixedCase setting
                if (this.config.preserveMixedCase || !this.isMixedCaseWord(intelligentCapitalization)) {
                    return intelligentCapitalization; // Use entity/brand-specific capitalization
                }
                // If preserveMixedCase is disabled and this would create mixed case, fall through to default logic
            }
        }
        
        if (this.config.preserveMixedCase && this.isMixedCaseWord(word)) {
            // Only capitalize first letter, preserve the rest
            return word.charAt(0).toUpperCase() + word.slice(1);
        }

        return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    }

    /**
     * Static helper methods for external use
     */
    static isWordBoundaryTrigger(char: string): boolean {
        return /[\s.,:;!?]/.test(char);
    }

    static isSentenceEndTrigger(char: string): boolean {
        return /[.!?]/.test(char);
    }
} 

/**
 * Supporting interfaces
 */
interface CapitalizationOpportunity {
    type: 'line' | 'sentence';
    word: string;
    capitalizedWord: string;
    position: WordPosition;
}

interface WordPosition {
    line: number;
    startCh: number;
    endCh: number;
}