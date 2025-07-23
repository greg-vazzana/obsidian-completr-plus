import { CompletrSettings, WordInsertionMode } from '../../src/settings';
import { DictionaryProvider } from '../../src/provider/dictionary_provider';
import { Word } from '../../src/db/sqlite_database_service';
import { Suggestion, SuggestionContext } from '../../src/provider/provider';

describe('DictionaryProvider', () => {
    class TestDictionaryProvider extends DictionaryProvider {
        wordMap = new Map<string, Map<string, Word>>();
        isEnabled = () => true;
    }

    let provider: TestDictionaryProvider;
    let settings: CompletrSettings;

    beforeEach(() => {
        provider = new TestDictionaryProvider();
        settings = {
            characterRegex: "a-zA-ZöäüÖÄÜß",
            maxLookBackDistance: 50,
            autoFocus: true,
            autoTrigger: true,
            minWordLength: 3,
            minWordTriggerLength: 2,
            maxSuggestions: 20,
            wordInsertionMode: WordInsertionMode.REPLACE,
            ignoreDiacriticsWhenFiltering: false,
            insertSpaceAfterComplete: false,
            insertPeriodAfterSpaces: false,
            latexProviderEnabled: true,
            latexTriggerInCodeBlocks: true,
            latexMinWordTriggerLength: 2,
            latexIgnoreCase: false,
            scanEnabled: true,
            liveWordTracking: true,
            wordListProviderEnabled: true,
            frontMatterProviderEnabled: true,
            frontMatterTagAppendSuffix: true,
            frontMatterIgnoreCase: true,
            calloutProviderEnabled: true,
            calloutProviderSource: 'Completr' as any,
            autoCapitalizeLines: true,
            autoCapitalizeSentences: true,
            preserveMixedCaseWords: true,
            debugCapitalization: false,
            enableFuzzyMatching: true,
        };
    });

    describe('getSuggestions', () => {
        const createContext = (query: string): SuggestionContext => ({
            query,
            separatorChar: ' ',
            editor: {} as any,
            file: {} as any,
            start: { line: 0, ch: 0 },
            end: { line: 0, ch: query.length }
        });

        it('should return empty array if query is too short', () => {
            const result = provider.getSuggestions(createContext('a'), settings);
            expect(result).toEqual([]);
        });

        it('should return matching suggestions', () => {
            const wordMap = new Map<string, Word>();
            wordMap.set('hello', { word: 'hello', frequency: 1 });
            wordMap.set('help', { word: 'help', frequency: 1 });
            provider.wordMap.set('h', wordMap);

            const result = provider.getSuggestions(createContext('he'), settings);
            expect(result).toHaveLength(2);
            expect(result.map(s => s.displayName)).toContain('hello');
            expect(result.map(s => s.displayName)).toContain('help');
        });

        it('should handle case-insensitive matching', () => {
            const wordMap = new Map<string, Word>();
            wordMap.set('Hello', { word: 'Hello', frequency: 1 });
            provider.wordMap.set('H', wordMap);

            const result = provider.getSuggestions(createContext('he'), settings);
            expect(result).toHaveLength(1);
            expect(result[0].displayName).toBe('Hello');
        });

        it('should preserve case when replacing', () => {
            const wordMap = new Map<string, Word>();
            wordMap.set('Hello', { word: 'Hello', frequency: 1 });
            provider.wordMap.set('H', wordMap);

            const result = provider.getSuggestions(createContext('HE'), settings);
            expect(result).toHaveLength(1);
            expect(result[0].getReplacementWithPreservedCase()).toBe('HELLO');
        });

        it('should append remaining letters in append mode', () => {
            settings.wordInsertionMode = WordInsertionMode.APPEND;
            const wordMap = new Map<string, Word>();
            wordMap.set('hello', { word: 'hello', frequency: 1 });
            provider.wordMap.set('h', wordMap);

            const result = provider.getSuggestions(createContext('he'), settings);
            expect(result).toHaveLength(1);
            expect(result[0].replacement).toBe('hello');
        });
    });
}); 