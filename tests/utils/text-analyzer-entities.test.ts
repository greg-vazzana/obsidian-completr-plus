import { TextAnalyzer } from '../../src/utils/text_analyzer';

describe('TextAnalyzer Entity Recognition', () => {
    describe('analyzeEntities', () => {
        it('should detect people names', () => {
            const entities = TextAnalyzer.analyzeEntities('john smith works here');
            
            expect(entities.people.length).toBeGreaterThan(0);
            expect(entities.people[0].text.toLowerCase()).toContain('john smith');
        });

        it('should detect places', () => {
            const entities = TextAnalyzer.analyzeEntities('visit new york city');
            
            expect(entities.places.length).toBeGreaterThan(0);
            expect(entities.places[0].text.toLowerCase()).toContain('new york');
        });

        it('should detect organizations', () => {
            const entities = TextAnalyzer.analyzeEntities('google is a company');
            
            expect(entities.organizations.length).toBeGreaterThan(0);
            expect(entities.organizations[0].text.toLowerCase()).toBe('google');
        });

        it('should handle empty text gracefully', () => {
            const entities = TextAnalyzer.analyzeEntities('');
            
            expect(entities.people).toEqual([]);
            expect(entities.places).toEqual([]);
            expect(entities.organizations).toEqual([]);
        });
    });

    describe('isProperNoun', () => {
        it('should detect proper nouns', () => {
            expect(TextAnalyzer.isProperNoun('John', 'John Smith')).toBe(true);
            expect(TextAnalyzer.isProperNoun('Microsoft', 'Microsoft Corporation')).toBe(true);
            expect(TextAnalyzer.isProperNoun('London', 'London England')).toBe(true);
        });

        it('should not detect common nouns as proper', () => {
            expect(TextAnalyzer.isProperNoun('car', 'the car')).toBe(false);
            expect(TextAnalyzer.isProperNoun('house', 'big house')).toBe(false);
        });
    });

    describe('isBrandName', () => {
        it('should detect known tech brands', () => {
            expect(TextAnalyzer.isBrandName('iPhone')).toBe(true);
            expect(TextAnalyzer.isBrandName('javascript')).toBe(true);
            expect(TextAnalyzer.isBrandName('React')).toBe(true);
            expect(TextAnalyzer.isBrandName('docker')).toBe(true);
        });

        it('should not detect non-brand words', () => {
            expect(TextAnalyzer.isBrandName('hello')).toBe(false);
            expect(TextAnalyzer.isBrandName('world')).toBe(false);
        });

        it('should be case insensitive', () => {
            expect(TextAnalyzer.isBrandName('IPHONE')).toBe(true);
            expect(TextAnalyzer.isBrandName('JavaScript')).toBe(true);
        });
    });

    describe('getBrandCapitalization', () => {
        it('should return correct capitalization for brands', () => {
            expect(TextAnalyzer.getBrandCapitalization('iphone')).toBe('iPhone');
            expect(TextAnalyzer.getBrandCapitalization('javascript')).toBe('JavaScript');
            expect(TextAnalyzer.getBrandCapitalization('macbook')).toBe('MacBook');
            expect(TextAnalyzer.getBrandCapitalization('nodejs')).toBe('Node.js');
        });

        it('should return null for non-brand words', () => {
            expect(TextAnalyzer.getBrandCapitalization('hello')).toBe(null);
            expect(TextAnalyzer.getBrandCapitalization('world')).toBe(null);
        });

        it('should be case insensitive', () => {
            expect(TextAnalyzer.getBrandCapitalization('IPHONE')).toBe('iPhone');
            expect(TextAnalyzer.getBrandCapitalization('JavaScript')).toBe('JavaScript');
        });
    });

    describe('getIntelligentCapitalization', () => {
        it('should return entity capitalization when available', () => {
            const result = TextAnalyzer.getIntelligentCapitalization('john', 'john smith works here');
            expect(result).not.toBe(null);
        });

        it('should return brand capitalization when entity fails', () => {
            const result = TextAnalyzer.getIntelligentCapitalization('iphone');
            expect(result).toBe('iPhone');
        });

        it('should return null when no intelligence available', () => {
            const result = TextAnalyzer.getIntelligentCapitalization('randomword');
            expect(result).toBe(null);
        });
    });

    describe('shouldCapitalizeAsProperNoun', () => {
        it('should return true for proper nouns', () => {
            expect(TextAnalyzer.shouldCapitalizeAsProperNoun('john', 'john smith')).toBe(true);
        });

        it('should return true for brand names', () => {
            expect(TextAnalyzer.shouldCapitalizeAsProperNoun('iphone')).toBe(true);
        });

        it('should return false for common words', () => {
            expect(TextAnalyzer.shouldCapitalizeAsProperNoun('hello')).toBe(false);
        });
    });

    describe('error handling', () => {
        it('should handle missing compromise.js gracefully', () => {
            // Just test that the methods don't throw - error handling is internal
            expect(() => {
                const entities = TextAnalyzer.analyzeEntities('test text');
                expect(entities).toBeDefined();
            }).not.toThrow();

            expect(() => {
                const isProper = TextAnalyzer.isProperNoun('test');
                expect(typeof isProper).toBe('boolean');
            }).not.toThrow();
        });
    });
});