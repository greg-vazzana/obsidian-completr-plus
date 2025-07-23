import { CompletrSettings, WordInsertionMode, CalloutProviderSource } from '../../src/settings';
import { FuzzyUtils } from '../../src/utils/fuzzy_utils';
import { Word } from '../../src/db/sqlite_database_service';

describe('FuzzyUtils', () => {
    let settings: CompletrSettings;

    beforeEach(() => {
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
            calloutProviderSource: CalloutProviderSource.COMPLETR,
            autoCapitalizeLines: true,
            autoCapitalizeSentences: true,
            preserveMixedCaseWords: true,
            debugCapitalization: false,
            enableFuzzyMatching: true,
        };
    });

    describe('filterWordsFuzzy', () => {
        it('should return empty array for empty query', () => {
            const words: Word[] = [{ word: 'test', frequency: 1 }];
            const result = FuzzyUtils.filterWordsFuzzy('', words, settings);
            expect(result).toEqual([]);
        });

        it('should return empty array for short query', () => {
            const words: Word[] = [{ word: 'test', frequency: 1 }];
            settings.minWordTriggerLength = 3;
            const result = FuzzyUtils.filterWordsFuzzy('te', words, settings);
            expect(result).toEqual([]);
        });

        it('should find fuzzy matches', () => {
            const words: Word[] = [
                { word: 'obsidian', frequency: 1 },
                { word: 'obvious', frequency: 1 },
                { word: 'absolute', frequency: 1 }
            ];
            const result = FuzzyUtils.filterWordsFuzzy('obs', words, settings);
            expect(result.length).toBe(2);
            expect(result[0].displayName).toBe('obsidian');
            expect(result[1].displayName).toBe('obvious');
        });

        it('should respect maxSuggestions limit', () => {
            const words: Word[] = [
                { word: 'obsidian', frequency: 1 },
                { word: 'obvious', frequency: 1 },
                { word: 'absolute', frequency: 1 }
            ];
            settings.maxSuggestions = 1;
            const result = FuzzyUtils.filterWordsFuzzy('obs', words, settings);
            expect(result.length).toBe(1);
            expect(result[0].displayName).toBe('obsidian');
        });

        it('should handle case-insensitive matching', () => {
            const words: Word[] = [
                { word: 'Obsidian', frequency: 1 },
                { word: 'OBVIOUS', frequency: 1 }
            ];
            const result = FuzzyUtils.filterWordsFuzzy('obs', words, settings);
            expect(result.length).toBe(2);
            expect(result[0].displayName).toBe('Obsidian');
            expect(result[1].displayName).toBe('OBVIOUS');
        });

        it('should preserve case in append mode', () => {
            settings.wordInsertionMode = WordInsertionMode.APPEND;
            const words: Word[] = [{ word: 'Obsidian', frequency: 1 }];
            const result = FuzzyUtils.filterWordsFuzzy('Obs', words, settings);
            expect(result.length).toBe(1);
            expect(result[0].replacement).toBe('Obsidian');
        });
    });

    describe('isExactMatch', () => {
        it('should match exact prefixes', () => {
            expect(FuzzyUtils.isExactMatch('obsidian', 'obs')).toBe(true);
            expect(FuzzyUtils.isExactMatch('Obsidian', 'obs')).toBe(true);
            expect(FuzzyUtils.isExactMatch('absolute', 'obs')).toBe(false);
        });
    });

    describe('extractHighlightRanges', () => {
        it('should handle empty indexes', () => {
            const mockResult = { indexes: [] as number[] };
            const ranges = (FuzzyUtils as any).extractHighlightRanges(mockResult);
            expect(ranges).toEqual([]);
        });

        it('should handle single index', () => {
            const mockResult = { indexes: [0] as number[] };
            const ranges = (FuzzyUtils as any).extractHighlightRanges(mockResult);
            expect(ranges).toEqual([{ start: 0, end: 1 }]);
        });

        it('should handle consecutive indexes', () => {
            const mockResult = { indexes: [0, 1, 2] as number[] };
            const ranges = (FuzzyUtils as any).extractHighlightRanges(mockResult);
            expect(ranges).toEqual([{ start: 0, end: 3 }]);
        });

        it('should handle non-consecutive indexes', () => {
            const mockResult = { indexes: [0, 2, 4] as number[] };
            const ranges = (FuzzyUtils as any).extractHighlightRanges(mockResult);
            expect(ranges).toEqual([
                { start: 0, end: 1 },
                { start: 2, end: 3 },
                { start: 4, end: 5 }
            ]);
        });
    });
}); 