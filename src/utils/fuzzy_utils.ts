import * as fuzzysort from 'fuzzysort';
import { Suggestion } from '../provider/provider';
import { Word } from '../db/sqlite_database_service';
import { CompletrSettings, WordInsertionMode } from '../settings';

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
            if (settings.wordInsertionMode === WordInsertionMode.IGNORE_CASE_APPEND) {
                suggestionText = query + word.word.substring(query.length);
            } else {
                suggestionText = word.word;
            }
            
            const suggestion = Suggestion.fromString(suggestionText);
            
            // Add frequency if > 1
            if (word.frequency > 1) {
                suggestion.frequency = word.frequency;
            }
            
            // Calculate combined rating: fuzzysort score + frequency boost - length penalty
            const fuzzyScore = result.score;
            const frequencyBoost = word.frequency * 1000;
            const lengthPenalty = word.word.length;
            
            // Store the combined rating for sorting
            (suggestion as any).rating = fuzzyScore + frequencyBoost - lengthPenalty;
            (suggestion as any).fuzzyScore = fuzzyScore;
            (suggestion as any).isExactMatch = fuzzyScore > 0 && word.word.toLowerCase().startsWith(query.toLowerCase());
            
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
     * @param ignoreCase - Whether to ignore case
     * @returns True if it's an exact prefix match
     */
    static isExactMatch(word: string, query: string, ignoreCase: boolean): boolean {
        const wordToCheck = ignoreCase ? word.toLowerCase() : word;
        const queryToCheck = ignoreCase ? query.toLowerCase() : query;
        return wordToCheck.startsWith(queryToCheck);
    }

    /**
     * Filter words using traditional startsWith matching
     * @param query - The search query
     * @param words - Array of word objects to search through
     * @param settings - Plugin settings
     * @returns Array of suggestions using exact matching
     */
    static filterWordsExact(
        query: string, 
        words: Word[], 
        settings: CompletrSettings
    ): Suggestion[] {
        if (!query || query.length < settings.minWordTriggerLength) {
            return [];
        }

        const ignoreCase = settings.wordInsertionMode !== WordInsertionMode.MATCH_CASE_REPLACE;
        const queryLower = ignoreCase ? query.toLowerCase() : query;

        const results: Suggestion[] = [];
        
        for (const word of words) {
            const wordToCheck = ignoreCase ? word.word.toLowerCase() : word.word;
            
            if (wordToCheck.startsWith(queryLower)) {
                let suggestionText: string;
                
                if (settings.wordInsertionMode === WordInsertionMode.IGNORE_CASE_APPEND) {
                    suggestionText = query + word.word.substring(query.length);
                } else {
                    suggestionText = word.word;
                }
                
                const suggestion = Suggestion.fromString(suggestionText);
                
                if (word.frequency > 1) {
                    suggestion.frequency = word.frequency;
                }
                
                // Calculate rating for exact matches
                (suggestion as any).rating = word.frequency * 1000 - word.word.length;
                
                results.push(suggestion);
            }
        }

        // Sort by rating (frequency-based)
        results.sort((a, b) => (b as any).rating - (a as any).rating);
        
        // Apply limit if specified
        return settings.maxSuggestions > 0 
            ? results.slice(0, settings.maxSuggestions)
            : results;
    }
} 