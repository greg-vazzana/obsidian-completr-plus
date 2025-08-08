import { CompletrSettings, WordInsertionMode } from "../settings";
import { Suggestion, SuggestionContext, SuggestionProvider } from "./provider";
import { Word } from "../db/sqlite_database_service";
import { TextUtils } from "../utils/text_utils";
import { FuzzyUtils } from "../utils/fuzzy_utils";
import { WORD_FREQUENCY_RATING_MULTIPLIER } from "../constants";

export abstract class DictionaryProvider implements SuggestionProvider {
    abstract readonly wordMap: Map<string, Map<string, Word>>;
    abstract isEnabled(settings: CompletrSettings): boolean;

    getSuggestions(context: SuggestionContext, settings: CompletrSettings): Suggestion[] {
        if (!this.isEnabled(settings) || !context.query || context.query.length < settings.minWordTriggerLength)
            return [];

        // Use fuzzy matching if enabled, otherwise fall back to exact matching
        if (settings.enableFuzzyMatching) {
            return this.getFuzzySuggestions(context, settings);
        } else {
            return this.getExactSuggestions(context, settings);
        }
    }

    private getFuzzySuggestions(context: SuggestionContext, settings: CompletrSettings): Suggestion[] {
        // Collect all words from relevant word maps
        const words = this.collectWordsForQuery(context.query, settings);
        
        if (words.length === 0) {
            return [];
        }

        // Use fuzzy matching utility
        return FuzzyUtils.filterWordsFuzzy(context.query, words, settings);
    }

    private getExactSuggestions(context: SuggestionContext, settings: CompletrSettings): Suggestion[] {
        // Use case-sensitive exact matching logic
        const firstChar = context.query.charAt(0);
        const query = context.query; // Keep original case for case-sensitive matching
        
        // For diacritics handling, we need to work with both original and processed queries
        const ignoreDiacritics = settings.ignoreDiacriticsWhenFiltering;
        let queryForLowerCaseCheck = query.toLowerCase();
        if (ignoreDiacritics) {
            queryForLowerCaseCheck = TextUtils.removeDiacritics(queryForLowerCaseCheck);
        }

        // Always check both lowercase and uppercase maps
        const wordMaps = [
            this.wordMap.get(firstChar.toLowerCase()) ?? new Map(),
            this.wordMap.get(firstChar.toUpperCase()) ?? new Map()
        ];

        if (ignoreDiacritics) {
            // This additionally adds all words that start with a diacritic
            for (let [key, value] of this.wordMap.entries()) {
                let keyFirstChar = key.charAt(0).toLowerCase();
                if (TextUtils.removeDiacritics(keyFirstChar) === firstChar.toLowerCase())
                    wordMaps.push(value);
            }
        }

        if (!wordMaps || wordMaps.length < 1)
            return [];

        const result: Suggestion[] = [];
        for (let wordMap of wordMaps) {
            TextUtils.filterMapIntoArray(result, wordMap.values(),
                wordObj => {
                    // First do a case-insensitive check to see if it could potentially match
                    let matchForBasicCheck = wordObj.word.toLowerCase();
                    if (ignoreDiacritics) {
                        matchForBasicCheck = TextUtils.removeDiacritics(matchForBasicCheck);
                    }
                    
                    // Basic lowercase matching check (for performance - eliminates obvious non-matches)
                    if (!matchForBasicCheck.startsWith(queryForLowerCaseCheck)) {
                        return false;
                    }
                    
                    // Case-sensitive exact match: check if the case pattern matches exactly
                    return this.doesCasePatternMatch(wordObj.word, query);
                },
                wordObj => {
                    const suggestion = settings.wordInsertionMode === WordInsertionMode.APPEND
                        ? Suggestion.fromString(query + wordObj.word.substring(query.length))
                        : new Suggestion(wordObj.word, wordObj.word, undefined, undefined, {
                            frequency: wordObj.frequency > 1 ? wordObj.frequency : undefined,
                            matchType: 'exact'
                        });
                    (suggestion as any).rating = this.calculateExactMatchRating(wordObj.word, query, wordObj.frequency);
                    
                    return suggestion;
                }
            );
        }

        const sortedResults = result.sort((a, b) => (b as any).rating - (a as any).rating);
        
        // Apply suggestion limit if set (0 means unlimited)
        return settings.maxSuggestions > 0 
            ? sortedResults.slice(0, settings.maxSuggestions)
            : sortedResults;
    }

    /**
     * Checks if the case pattern of the query matches the beginning of the word
     * For case-sensitive exact matching
     */
    private doesCasePatternMatch(word: string, query: string): boolean {
        // If query is longer than word, it can't match
        if (query.length > word.length) {
            return false;
        }
        
        // Check each character's case matches exactly
        for (let i = 0; i < query.length; i++) {
            if (word.charAt(i) !== query.charAt(i)) {
                return false;
            }
        }
        
        return true;
    }

    private collectWordsForQuery(query: string, settings: CompletrSettings): Word[] {
        const words: Word[] = [];
        
        // For fuzzy matching, we need to check more characters than just the first one
        // Get words starting with the first few characters to keep the search space reasonable
        const ignoreDiacritics = settings.ignoreDiacriticsWhenFiltering;
        
        // Get the first character variations to check
        const firstChar = query.charAt(0);
        const charsToCheck = new Set<string>();
        
        // Always check both cases
        charsToCheck.add(firstChar.toLowerCase());
        charsToCheck.add(firstChar.toUpperCase());
        
        if (ignoreDiacritics) {
            // Add all possible diacritic variations
            for (let [key, value] of this.wordMap.entries()) {
                let keyFirstChar = key.charAt(0).toLowerCase();
                if (TextUtils.removeDiacritics(keyFirstChar) === TextUtils.removeDiacritics(firstChar.toLowerCase())) {
                    charsToCheck.add(key);
                }
            }
        }
        
        // Collect words from all relevant maps
        for (const char of charsToCheck) {
            const wordMap = this.wordMap.get(char);
            if (wordMap) {
                for (const word of wordMap.values()) {
                    words.push(word);
                }
            }
        }
        
        return words;
    }

    /**
     * Calculate a comprehensive rating for exact matches considering case, frequency, and word length
     * @param word - The word being suggested
     * @param query - The user's query
     * @param frequency - How often this word appears
     * @returns A numeric rating (higher is better)
     */
    private calculateExactMatchRating(word: string, query: string, frequency: number): number {
        // 1. Frequency component (0-40 points) - cap at frequency 100 for normalization
        const frequencyScore = Math.min(40, (frequency / 100) * 40);
        
        // 2. Case matching component (0-15 points)
        const rawCaseBonus = this.calculateCaseMatchBonus(word, query);
        // Normalize case bonus: range is roughly -50 to +500, so shift and scale
        const caseScore = Math.min(15, Math.max(0, (rawCaseBonus + 50) / 550 * 15));
        
        // 3. Completion progress component (0-20 points)
        const completionRatio = query.length / word.length;
        const completionScore = completionRatio * 20;
        
        // 4. Length efficiency component (0-10 points)
        const lengthDiff = word.length - query.length;
        const efficiencyScore = Math.min(10, Math.max(0, (50 - lengthDiff) / 50 * 10));
        
        // 5. Word length quality component (0-10 points) - prefer shorter words
        const lengthScore = Math.min(10, Math.max(0, (50 - word.length) / 47 * 10));
        
        // Final score (0-100)
        const totalScore = frequencyScore + caseScore + completionScore + efficiencyScore + lengthScore;
        return Math.min(100, Math.max(0, totalScore));
    }

    /**
     * Calculate bonus points for case matching quality
     * @param word - The word being evaluated
     * @param query - The user's query
     * @returns Bonus points for case matching (0 or positive)
     */
    private calculateCaseMatchBonus(word: string, query: string): number {
        let bonus = 0;
        
        // Perfect case match gets highest bonus
        if (word.startsWith(query)) {
            bonus += 300;
        }
        
        // Analyze case pattern matching quality
        for (let i = 0; i < Math.min(word.length, query.length); i++) {
            const wordChar = word[i];
            const queryChar = query[i];
            
            if (wordChar === queryChar) {
                // Exact case match (including non-alphabetic)
                bonus += 10;
            } else if (wordChar.toLowerCase() === queryChar.toLowerCase()) {
                // Case mismatch penalty
                bonus -= 5;
            }
        }
        
        // Additional bonuses for common patterns
        if (this.isCamelCaseMatch(word, query)) {
            bonus += 100;
        }
        
        if (this.isPascalCaseMatch(word, query)) {
            bonus += 100;
        }
        
        return bonus;
    }

    /**
     * Check if query matches camelCase pattern (e.g., "getUserName" matches "gUN")
     * @param word - The word to check
     * @param query - The query pattern
     * @returns True if it's a camelCase match
     */
    private isCamelCaseMatch(word: string, query: string): boolean {
        // Check if query matches camelCase pattern
        if (query.length < 2) return false;
        
        let queryIndex = 0;
        for (let i = 0; i < word.length && queryIndex < query.length; i++) {
            if (i === 0 || word[i] === word[i].toUpperCase()) {
                if (word[i].toLowerCase() === query[queryIndex].toLowerCase()) {
                    queryIndex++;
                }
            }
        }
        
        return queryIndex === query.length;
    }

    /**
     * Check if query matches PascalCase pattern (e.g., "GetUserName" matches "GUN")
     * @param word - The word to check
     * @param query - The query pattern
     * @returns True if it's a PascalCase match
     */
    private isPascalCaseMatch(word: string, query: string): boolean {
        // Must start with uppercase and have mixed case (not all caps)
        if (word[0] !== word[0].toUpperCase()) return false;
        
        // Check if it's actually mixed case (has lowercase letters)
        const hasLowercase = Array.from(word.slice(1)).some((char: string) => char !== char.toUpperCase());
        if (!hasLowercase) return false;
        
        return this.isCamelCaseMatch(word, query);
    }
}
