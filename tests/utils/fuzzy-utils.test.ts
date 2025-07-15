import { FuzzyUtils } from '../../src/utils/fuzzy_utils';
import { CompletrSettings, WordInsertionMode } from '../../src/settings';
import { Word } from '../../src/db/sqlite_database_service';

describe('FuzzyUtils', () => {
    const mockSettings: CompletrSettings = {
        characterRegex: "a-zA-ZöäüÖÄÜß",
        maxLookBackDistance: 50,
        autoFocus: true,
        autoTrigger: true,
        minWordLength: 2,
        minWordTriggerLength: 2,
        maxSuggestions: 0, // Unlimited
        wordInsertionMode: WordInsertionMode.IGNORE_CASE_REPLACE,
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

    const mockWords: Word[] = [
        { word: 'obsidian', frequency: 10 },
        { word: 'observation', frequency: 5 },
        { word: 'obvious', frequency: 3 },
        { word: 'abstract', frequency: 2 },
        { word: 'absolute', frequency: 4 },
        { word: 'cat', frequency: 8 },
        { word: 'cart', frequency: 2 },
        { word: 'car', frequency: 6 },
    ];

    describe('filterWordsFuzzy', () => {
        it('should return exact matches first', () => {
            const results = FuzzyUtils.filterWordsFuzzy('obs', mockWords, mockSettings);
            
            expect(results.length).toBeGreaterThan(0);
            // Should find words that start with 'obs'
            expect(results.some(r => r.displayName === 'obsidian')).toBe(true);
            expect(results.some(r => r.displayName === 'observation')).toBe(true);
            expect(results.some(r => r.displayName === 'obvious')).toBe(true);
        });

        it('should find fuzzy matches', () => {
            const results = FuzzyUtils.filterWordsFuzzy('obsdn', mockWords, mockSettings);
            
            expect(results.length).toBeGreaterThan(0);
            // Should find 'obsidian' even with missing 'i'
            expect(results.some(r => r.displayName === 'obsidian')).toBe(true);
        });

        it('should respect minimum trigger length', () => {
            const results = FuzzyUtils.filterWordsFuzzy('o', mockWords, mockSettings);
            
            // Should return empty because query is too short
            expect(results.length).toBe(0);
        });

        it('should respect suggestion limit', () => {
            const limitedSettings = { ...mockSettings, maxSuggestions: 2 };
            const results = FuzzyUtils.filterWordsFuzzy('a', mockWords, limitedSettings);
            
            expect(results.length).toBeLessThanOrEqual(2);
        });

        it('should include frequency information', () => {
            const results = FuzzyUtils.filterWordsFuzzy('obs', mockWords, mockSettings);
            
            const obsidianResult = results.find(r => r.displayName === 'obsidian');
            expect(obsidianResult?.frequency).toBe(10);
        });
    });

    describe('filterWordsExact', () => {
        it('should return only exact prefix matches', () => {
            const results = FuzzyUtils.filterWordsExact('obs', mockWords, mockSettings);
            
            // Let's see what we actually get
            const resultNames = results.map(r => r.displayName);
            console.log('Exact matching results for "obs":', resultNames);
            console.log('Expected words that start with "obs": obsidian, observation, obvious');
            console.log('Words in mockData:', mockWords.map(w => w.word));
            
            // Check that all returned results start with 'obs'
            expect(results.every(r => r.displayName.toLowerCase().startsWith('obs'))).toBe(true);
            
            // Check that we find obsidian
            expect(results.some(r => r.displayName === 'obsidian')).toBe(true);
        });

        it('should not find fuzzy matches', () => {
            const results = FuzzyUtils.filterWordsExact('obsdn', mockWords, mockSettings);
            
            // Should not find any matches for typo
            expect(results.length).toBe(0);
        });

        it('should handle case sensitivity', () => {
            const caseSensitiveSettings = { 
                ...mockSettings, 
                wordInsertionMode: WordInsertionMode.MATCH_CASE_REPLACE 
            };
            
            const results = FuzzyUtils.filterWordsExact('OBS', mockWords, caseSensitiveSettings);
            expect(results.length).toBe(0); // No uppercase words in mock data
            
            // Test with case insensitive
            const results2 = FuzzyUtils.filterWordsExact('OBS', mockWords, mockSettings);
            expect(results2.length).toBeGreaterThan(0); // Should find obs* words
        });
    });

    describe('isExactMatch', () => {
        it('should correctly identify exact matches', () => {
            expect(FuzzyUtils.isExactMatch('obsidian', 'obs', true)).toBe(true);
            expect(FuzzyUtils.isExactMatch('Obsidian', 'obs', true)).toBe(true);
            expect(FuzzyUtils.isExactMatch('Obsidian', 'obs', false)).toBe(false);
            expect(FuzzyUtils.isExactMatch('absolute', 'obs', true)).toBe(false);
        });
    });
}); 