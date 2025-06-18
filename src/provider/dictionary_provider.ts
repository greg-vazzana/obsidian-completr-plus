import { CompletrSettings, WordInsertionMode } from "../settings";
import { Suggestion, SuggestionContext, SuggestionProvider } from "./provider";
import { maybeLowerCase } from "../editor_helpers";
import { Word } from "../db/database";

export abstract class DictionaryProvider implements SuggestionProvider {
    abstract readonly wordMap: Map<string, Map<string, Word>>;
    abstract isEnabled(settings: CompletrSettings): boolean;

    getSuggestions(context: SuggestionContext, settings: CompletrSettings): Suggestion[] {
        if (!this.isEnabled(settings) || !context.query || context.query.length < settings.minWordTriggerLength)
            return [];

        const firstChar = context.query.charAt(0);

        const ignoreCase = settings.wordInsertionMode !== WordInsertionMode.MATCH_CASE_REPLACE;
        let query = maybeLowerCase(context.query, ignoreCase);
        const ignoreDiacritics = settings.ignoreDiacriticsWhenFiltering;
        if (ignoreDiacritics)
            query = removeDiacritics(query);

        //This is an array of maps to avoid unnecessarily creating a new huge map containing all elements of both maps.
        const wordMaps = ignoreCase ?
            [this.wordMap.get(firstChar) ?? new Map(), this.wordMap.get(firstChar.toUpperCase()) ?? new Map()] //Get both maps if we're ignoring case
            : [this.wordMap.get(firstChar) ?? new Map()];

        if (ignoreDiacritics) {
            // This additionally adds all words that start with a diacritic, which the two maps above might not cover.
            for (let [key, value] of this.wordMap.entries()) {
                let keyFirstChar = maybeLowerCase(key.charAt(0), ignoreCase);

                if (removeDiacritics(keyFirstChar) === firstChar)
                    wordMaps.push(value);
            }
        }

        if (!wordMaps || wordMaps.length < 1)
            return [];

        const result: Suggestion[] = [];
        for (let wordMap of wordMaps) {
            filterMapIntoArray(result, wordMap.values(),
                wordObj => {
                    let match = maybeLowerCase(wordObj.word, ignoreCase);
                    if (ignoreDiacritics)
                        match = removeDiacritics(match);
                    return match.startsWith(query);
                },
                wordObj => {
                    const suggestion = settings.wordInsertionMode === WordInsertionMode.IGNORE_CASE_APPEND
                        ? Suggestion.fromString(context.query + wordObj.word.substring(query.length))
                        : Suggestion.fromString(wordObj.word);
                    (suggestion as any).rating = wordObj.frequency * 1000 - wordObj.word.length;
                    return suggestion;
                }
            );
        }

        return result.sort((a, b) => (b as any).rating - (a as any).rating);
    }
}

const DIACRITICS_REGEX = /[\u0300-\u036f]/g;

function removeDiacritics(str: string): string {
    return str.normalize("NFD").replace(DIACRITICS_REGEX, "");
}

function filterMapIntoArray<T, U>(array: Array<T>, iterable: Iterable<U>, predicate: (val: U) => boolean, map: (val: U) => T) {
    for (let val of iterable) {
        if (!predicate(val))
            continue;
        array.push(map(val));
    }
}
