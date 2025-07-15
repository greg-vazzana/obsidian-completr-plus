import { CompletrSettings, WordInsertionMode } from "../settings";
import { Suggestion, SuggestionContext, SuggestionProvider } from "./provider";
import { Word } from "../db/sqlite_database_service";
import { TextUtils } from "../utils/text_utils";
import { FuzzyUtils } from "../utils/fuzzy_utils";

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
        // Use the original exact matching logic
        const firstChar = context.query.charAt(0);

        const ignoreCase = settings.wordInsertionMode !== WordInsertionMode.MATCH_CASE_REPLACE;
        let query = TextUtils.maybeLowerCase(context.query, ignoreCase);
        const ignoreDiacritics = settings.ignoreDiacriticsWhenFiltering;
        if (ignoreDiacritics)
            query = TextUtils.removeDiacritics(query);

        //This is an array of maps to avoid unnecessarily creating a new huge map containing all elements of both maps.
        const wordMaps = ignoreCase ?
            [this.wordMap.get(firstChar) ?? new Map(), this.wordMap.get(firstChar.toUpperCase()) ?? new Map()] //Get both maps if we're ignoring case
            : [this.wordMap.get(firstChar) ?? new Map()];

        if (ignoreDiacritics) {
            // This additionally adds all words that start with a diacritic, which the two maps above might not cover.
            for (let [key, value] of this.wordMap.entries()) {
                let keyFirstChar = TextUtils.maybeLowerCase(key.charAt(0), ignoreCase);

                if (TextUtils.removeDiacritics(keyFirstChar) === firstChar)
                    wordMaps.push(value);
            }
        }

        if (!wordMaps || wordMaps.length < 1)
            return [];

        const result: Suggestion[] = [];
        for (let wordMap of wordMaps) {
            TextUtils.filterMapIntoArray(result, wordMap.values(),
                wordObj => {
                    let match = TextUtils.maybeLowerCase(wordObj.word, ignoreCase);
                    if (ignoreDiacritics)
                        match = TextUtils.removeDiacritics(match);
                    return match.startsWith(query);
                },
                wordObj => {
                    const suggestion = settings.wordInsertionMode === WordInsertionMode.IGNORE_CASE_APPEND
                        ? Suggestion.fromString(context.query + wordObj.word.substring(query.length))
                        : Suggestion.fromString(wordObj.word);
                    (suggestion as any).rating = wordObj.frequency * 1000 - wordObj.word.length;
                    
                    // Add frequency to suggestion if > 1
                    if (wordObj.frequency > 1) {
                        suggestion.frequency = wordObj.frequency;
                    }
                    
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

    private collectWordsForQuery(query: string, settings: CompletrSettings): Word[] {
        const words: Word[] = [];
        
        // For fuzzy matching, we need to check more characters than just the first one
        // Get words starting with the first few characters to keep the search space reasonable
        const ignoreCase = settings.wordInsertionMode !== WordInsertionMode.MATCH_CASE_REPLACE;
        const ignoreDiacritics = settings.ignoreDiacriticsWhenFiltering;
        
        // Get the first character variations to check
        const firstChar = query.charAt(0);
        const charsToCheck = new Set<string>();
        
        if (ignoreCase) {
            charsToCheck.add(firstChar.toLowerCase());
            charsToCheck.add(firstChar.toUpperCase());
        } else {
            charsToCheck.add(firstChar);
        }
        
        if (ignoreDiacritics) {
            // Add all possible diacritic variations
            for (let [key, value] of this.wordMap.entries()) {
                let keyFirstChar = TextUtils.maybeLowerCase(key.charAt(0), ignoreCase);
                if (TextUtils.removeDiacritics(keyFirstChar) === TextUtils.removeDiacritics(firstChar)) {
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
}
