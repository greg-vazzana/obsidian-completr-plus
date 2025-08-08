import * as fuzzysort from 'fuzzysort';
import { Suggestion, MatchType, HighlightRange } from '../provider/provider';
import { Word } from '../db/sqlite_database_service';
import { CompletrSettings, WordInsertionMode } from '../settings';
import { WORD_FREQUENCY_RATING_MULTIPLIER } from '../constants';

/**
 * Fuzzy matching utilities using fuzzysort library
 */
export class FuzzyUtils {
    
    /**
     * Filter and rank words using fuzzy matching
     * @param query - The search query
     * @param words - Array of word objects to search through
     * @param settings - Plugin settings
     * @returns Array of suggestions ranked by fuzzy score
     */
    static filterWordsFuzzy(
        query: string, 
        words: Word[], 
        settings: CompletrSettings
    ): Suggestion[] {
        if (!query || query.length < settings.minWordTriggerLength) {
            return [];
        }

        // Use fuzzysort to find fuzzy matches
        const results = fuzzysort.go(query, words, {
            key: 'word',
            threshold: -10000, // Allow all matches, we'll filter by score later
            limit: settings.maxSuggestions > 0 ? settings.maxSuggestions * 2 : 0 // Get extra results for ranking
        });

        // Convert fuzzysort results to suggestions
        const suggestions: Suggestion[] = results.map(result => {
            const word = result.obj;
            let suggestionText: string;
            
            // Handle different insertion modes
            if (settings.wordInsertionMode === WordInsertionMode.APPEND) {
                suggestionText = query + word.word.substring(query.length);
            } else {
                suggestionText = word.word;
            }
            
            // Determine if this is an exact match
            const isExactMatch = result.score > 0 && word.word.toLowerCase().startsWith(query.toLowerCase());
            const matchType: MatchType = isExactMatch ? 'exact' : 'fuzzy';
            
            // Extract highlight ranges from fuzzysort result
            const highlightRanges = FuzzyUtils.extractHighlightRanges(result);
            
            const suggestion = new Suggestion(suggestionText, suggestionText, undefined, undefined, {
                frequency: word.frequency > 1 ? word.frequency : undefined,
                matchType: matchType,
                highlightRanges: highlightRanges
            });
            
            // Calculate normalized rating (0-100) for fuzzy matches
            const fuzzyScore = result.score;
            
            // 1. Frequency component (0-40 points) - cap at frequency 100 for normalization
            const frequencyScore = Math.min(40, (word.frequency / 100) * 40);
            
            // 2. Fuzzy match quality component (0-35 points)
            // fuzzysort scores are negative, closer to 0 is better, typical range is -1000 to 0
            const fuzzyQuality = Math.min(35, Math.max(0, (fuzzyScore + 1000) / 1000 * 35));
            
            // 3. Word length quality component (0-25 points) - prefer shorter words
            const lengthScore = Math.min(25, Math.max(0, (50 - word.word.length) / 47 * 25));
            
            // Final normalized score (0-100)
            const totalScore = frequencyScore + fuzzyQuality + lengthScore;
            
            // Store the combined rating for sorting
            (suggestion as any).rating = Math.min(100, Math.max(0, totalScore));
            (suggestion as any).fuzzyScore = fuzzyScore;
            (suggestion as any).isExactMatch = isExactMatch;
            
            return suggestion;
        });

        // Sort by exact matches first, then by combined rating
        suggestions.sort((a, b) => {
            const aExact = (a as any).isExactMatch;
            const bExact = (b as any).isExactMatch;
            
            // Exact matches always come first
            if (aExact && !bExact) return -1;
            if (!aExact && bExact) return 1;
            
            // Within same match type, sort by rating
            return (b as any).rating - (a as any).rating;
        });

        // Apply final limit if specified
        return settings.maxSuggestions > 0 
            ? suggestions.slice(0, settings.maxSuggestions)
            : suggestions;
    }

    /**
     * Check if a word matches exactly (starts with query)
     * @param word - The word to check
     * @param query - The search query
     * @returns True if it's an exact prefix match (case-insensitive)
     */
    static isExactMatch(word: string, query: string): boolean {
        return word.toLowerCase().startsWith(query.toLowerCase());
    }

    /**
     * Extract highlight ranges from a fuzzysort result
     */
    private static extractHighlightRanges(result: any): HighlightRange[] {
        if (!result.indexes || result.indexes.length === 0) return [];
        
        const ranges: HighlightRange[] = [];
        let start = result.indexes[0];
        let prev = start;
        
        for (let i = 1; i < result.indexes.length; i++) {
            const current = result.indexes[i];
            if (current !== prev + 1) {
                ranges.push({ start, end: prev + 1 });
                start = current;
            }
            prev = current;
        }
        
        ranges.push({ start, end: prev + 1 });
        return ranges;
    }
} 