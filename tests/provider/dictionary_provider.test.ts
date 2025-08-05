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

        describe('exact matching (case-sensitive)', () => {
            beforeEach(() => {
                settings.enableFuzzyMatching = false; // Enable case-sensitive exact matching
            });

            it('should perform case-sensitive exact matching', () => {
                const wordMap1 = new Map<string, Word>();
                wordMap1.set('Hello', { word: 'Hello', frequency: 1 });
                provider.wordMap.set('H', wordMap1);

                const wordMap2 = new Map<string, Word>();
                wordMap2.set('hello', { word: 'hello', frequency: 1 });
                provider.wordMap.set('h', wordMap2);

                // Query 'He' should match 'Hello' but not 'hello'
                const result1 = provider.getSuggestions(createContext('He'), settings);
                expect(result1).toHaveLength(1);
                expect(result1[0].displayName).toBe('Hello');

                // Query 'he' should match 'hello' but not 'Hello'
                const result2 = provider.getSuggestions(createContext('he'), settings);
                expect(result2).toHaveLength(1);
                expect(result2[0].displayName).toBe('hello');
            });

            it('should not match when case differs', () => {
                const wordMap = new Map<string, Word>();
                wordMap.set('Hello', { word: 'Hello', frequency: 1 });
                provider.wordMap.set('H', wordMap);

                // Lowercase query should not match uppercase word
                const result = provider.getSuggestions(createContext('he'), settings);
                expect(result).toHaveLength(0);
            });

            it('should match exact case patterns', () => {
                const wordMapJ = new Map<string, Word>();
                wordMapJ.set('JavaScript', { word: 'JavaScript', frequency: 1 });
                provider.wordMap.set('J', wordMapJ);

                const wordMapj = new Map<string, Word>();
                wordMapj.set('java', { word: 'java', frequency: 1 });
                provider.wordMap.set('j', wordMapj);

                // 'Java' should match 'JavaScript' but not 'java'
                const result1 = provider.getSuggestions(createContext('Java'), settings);
                expect(result1).toHaveLength(1);
                expect(result1[0].displayName).toBe('JavaScript');

                // 'java' should match 'java' but not 'JavaScript'
                const result2 = provider.getSuggestions(createContext('java'), settings);
                expect(result2).toHaveLength(1);
                expect(result2[0].displayName).toBe('java');
            });
        });

        describe('fuzzy matching (case-insensitive)', () => {
            beforeEach(() => {
                settings.enableFuzzyMatching = true; // Use fuzzy matching
            });

            it('should remain case-insensitive in fuzzy mode', () => {
                const wordMap1 = new Map<string, Word>();
                wordMap1.set('Hello', { word: 'Hello', frequency: 1 });
                provider.wordMap.set('H', wordMap1);

                const wordMap2 = new Map<string, Word>();
                wordMap2.set('hello', { word: 'hello', frequency: 1 });
                provider.wordMap.set('h', wordMap2);

                // Both should match regardless of case in fuzzy mode
                const result = provider.getSuggestions(createContext('he'), settings);
                expect(result.length).toBeGreaterThanOrEqual(2);
                const displayNames = result.map(s => s.displayName);
                expect(displayNames).toContain('Hello');
                expect(displayNames).toContain('hello');
            });
        });
    });
}); 