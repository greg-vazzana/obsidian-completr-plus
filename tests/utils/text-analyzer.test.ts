import { TextAnalyzer, PatternMatch, SentenceBoundary, ContextAnalysis } from '../../src/utils/text_analyzer';

describe('TextAnalyzer', () => {
    describe('Pattern Detection', () => {
        describe('URL Detection', () => {
            it('should detect HTTP URLs', () => {
                const text = 'Visit https://example.com for more info';
                const analysis = TextAnalyzer.analyzeContext(text, 10);
                
                expect(analysis.matchedPatterns).toHaveLength(1);
                expect(analysis.matchedPatterns[0]).toEqual({
                    type: 'url',
                    start: 6,
                    end: 25,
                    text: 'https://example.com'
                });
            });

            it('should detect HTTPS URLs', () => {
                const text = 'Go to https://secure.example.com/path';
                expect(TextAnalyzer.hasUrls(text)).toBe(true);
            });

            it('should detect www URLs', () => {
                const text = 'Check www.example.com today';
                const analysis = TextAnalyzer.analyzeContext(text, 10);
                
                expect(analysis.matchedPatterns).toHaveLength(1);
                expect(analysis.matchedPatterns[0].type).toBe('url');
                expect(analysis.matchedPatterns[0].text).toBe('www.example.com');
            });

            it('should not capitalize when cursor is within URL', () => {
                const text = 'Visit https://example.com for info';
                const cursorInUrl = 15; // within the URL
                const analysis = TextAnalyzer.analyzeContext(text, cursorInUrl);
                
                expect(analysis.shouldSkipCapitalization).toBe(true);
                expect(analysis.reason).toBe('url');
            });

            it('should allow capitalization when cursor is outside URL', () => {
                const text = 'Visit https://example.com for info';
                const cursorOutsideUrl = 30; // after URL
                const analysis = TextAnalyzer.analyzeContext(text, cursorOutsideUrl);
                
                expect(analysis.shouldSkipCapitalization).toBe(false);
            });
        });

        describe('Email Detection', () => {
            it('should detect standard emails', () => {
                const text = 'Contact user@example.com for help';
                expect(TextAnalyzer.hasEmails(text)).toBe(true);
                
                const analysis = TextAnalyzer.analyzeContext(text, 15);
                expect(analysis.matchedPatterns[0]).toEqual({
                    type: 'email',
                    start: 8,
                    end: 24,
                    text: 'user@example.com'
                });
            });

            it('should detect emails with plus signs', () => {
                const text = 'Email user+tag@example.com works';
                expect(TextAnalyzer.hasEmails(text)).toBe(true);
            });

            it('should detect emails with dots and hyphens', () => {
                const text = 'Try user.name@sub-domain.co.uk';
                expect(TextAnalyzer.hasEmails(text)).toBe(true);
            });

            it('should not capitalize when cursor is within email', () => {
                const text = 'Email me at user@example.com please';
                const cursorInEmail = 15; // within email
                const analysis = TextAnalyzer.analyzeContext(text, cursorInEmail);
                
                expect(analysis.shouldSkipCapitalization).toBe(true);
                expect(analysis.reason).toBe('email');
            });
        });

        describe('Ellipses Detection', () => {
            it('should detect three dots ellipses', () => {
                const text = 'This is incomplete... and continues';
                expect(TextAnalyzer.hasEllipses(text)).toBe(true);
                
                const analysis = TextAnalyzer.analyzeContext(text, 20);
                expect(analysis.matchedPatterns[0]).toEqual({
                    type: 'ellipses',
                    start: 18,
                    end: 21,
                    text: '...'
                });
            });

            it('should detect Unicode ellipsis', () => {
                const text = 'This continues… and then';
                expect(TextAnalyzer.hasEllipses(text)).toBe(true);
            });

            it('should detect longer ellipses', () => {
                const text = 'Thinking..... about it';
                expect(TextAnalyzer.hasEllipses(text)).toBe(true);
            });

            it('should not capitalize when cursor is within ellipses', () => {
                const text = 'Wait... for it';
                const cursorInEllipses = 6; // within ellipses
                const analysis = TextAnalyzer.analyzeContext(text, cursorInEllipses);
                
                expect(analysis.shouldSkipCapitalization).toBe(true);
                expect(analysis.reason).toBe('ellipses');
            });
        });

        describe('Markdown Link Detection', () => {
            it('should detect standard markdown links', () => {
                const text = 'Check [this link](https://example.com) out';
                const analysis = TextAnalyzer.analyzeContext(text, 15);
                
                const linkPattern = analysis.matchedPatterns.find(p => p.type === 'markdownLink');
                expect(linkPattern).toBeDefined();
                expect(linkPattern?.text).toBe('[this link](https://example.com)');
            });

            it('should detect wiki links', () => {
                const text = 'See [[Another Page]] for details';
                const analysis = TextAnalyzer.analyzeContext(text, 10);
                
                const linkPattern = analysis.matchedPatterns.find(p => p.type === 'markdownLink');
                expect(linkPattern).toBeDefined();
                expect(linkPattern?.text).toBe('[[Another Page]]');
            });

            it('should detect reference links', () => {
                const text = 'Check [this][ref] link';
                const analysis = TextAnalyzer.analyzeContext(text, 10);
                
                const linkPattern = analysis.matchedPatterns.find(p => p.type === 'markdownLink');
                expect(linkPattern).toBeDefined();
            });
        });

        describe('Inline Code Detection', () => {
            it('should detect single backtick code', () => {
                const text = 'Use `console.log()` to debug';
                const analysis = TextAnalyzer.analyzeContext(text, 10);
                
                const codePattern = analysis.matchedPatterns.find(p => p.type === 'inlineCode');
                expect(codePattern).toBeDefined();
                expect(codePattern?.text).toBe('`console.log()`');
            });

            it('should detect double backtick code', () => {
                const text = 'Try ``const x = `value`;`` here';
                const analysis = TextAnalyzer.analyzeContext(text, 15);
                
                const codePattern = analysis.matchedPatterns.find(p => p.type === 'inlineCode');
                expect(codePattern).toBeDefined();
            });
        });

        describe('Abbreviation Detection', () => {
            it('should detect common abbreviations', () => {
                const abbreviations = ['Dr.', 'Mr.', 'Mrs.', 'Ms.', 'Prof.', 'Inc.', 'Corp.', 'Ltd.', 'etc.', 'e.g.', 'i.e.'];
                
                abbreviations.forEach(abbr => {
                    const text = `Contact ${abbr} Smith for details`;
                    const analysis = TextAnalyzer.analyzeContext(text, 10);
                    
                    const abbrPattern = analysis.matchedPatterns.find(p => p.type === 'abbreviation');
                    expect(abbrPattern).toBeDefined();
                    expect(abbrPattern?.text).toBe(abbr);
                });
            });

            it('should detect month abbreviations', () => {
                const months = ['Jan.', 'Feb.', 'Mar.', 'Apr.', 'May.', 'Jun.', 'Jul.', 'Aug.', 'Sep.', 'Oct.', 'Nov.', 'Dec.'];
                
                months.forEach(month => {
                    const text = `Meeting in ${month} 2024`;
                    const analysis = TextAnalyzer.analyzeContext(text, 12);
                    
                    const abbrPattern = analysis.matchedPatterns.find(p => p.type === 'abbreviation');
                    expect(abbrPattern).toBeDefined();
                });
            });
        });
    });

    describe('Sentence Boundary Detection', () => {
        it('should identify real sentence boundaries', () => {
            const text = 'First sentence. Second sentence! Third sentence?';
            const boundaries = TextAnalyzer.findSentenceBoundaries(text);
            
            expect(boundaries).toHaveLength(3);
            expect(boundaries[0]).toEqual({
                position: 14,
                type: '.',
                isRealBoundary: true
            });
            expect(boundaries[1]).toEqual({
                position: 31,
                type: '!',
                isRealBoundary: true
            });
            expect(boundaries[2]).toEqual({
                position: 47,
                type: '?',
                isRealBoundary: true
            });
        });

        it('should exclude periods in abbreviations', () => {
            const text = 'Contact Dr. Smith for help. He is available.';
            const boundaries = TextAnalyzer.findSentenceBoundaries(text);
            
            // Should only find the real sentence boundaries, not the one in "Dr."
            const realBoundaries = boundaries.filter(b => b.isRealBoundary);
            expect(realBoundaries).toHaveLength(2);
            expect(realBoundaries[0].position).toBe(26); // after "help"
            expect(realBoundaries[1].position).toBe(43); // after "available"
        });

        it('should exclude periods in URLs', () => {
            const text = 'Visit https://example.com. It has good info.';
            const boundaries = TextAnalyzer.findSentenceBoundaries(text);
            
            const realBoundaries = boundaries.filter(b => b.isRealBoundary);
            expect(realBoundaries).toHaveLength(1);
            // Should only find the final period after "info"
            expect(realBoundaries[0].position).toBe(43); // after "info"
        });

        it('should exclude periods in emails', () => {
            const text = 'Email user.name@example.com. He will respond.';
            const boundaries = TextAnalyzer.findSentenceBoundaries(text);
            
            const realBoundaries = boundaries.filter(b => b.isRealBoundary);
            expect(realBoundaries).toHaveLength(2);
            // Should not count the period in the email
            expect(realBoundaries[0].position).toBe(27); // after email
            expect(realBoundaries[1].position).toBe(44); // after "respond"
        });
    });

    describe('Word Extraction', () => {
        it('should extract word at position', () => {
            const text = 'hello world testing';
            
            const word1 = TextAnalyzer.getWordAtPosition(text, 2); // within "hello"
            expect(word1).toEqual({
                word: 'hello',
                start: 0,
                end: 5
            });

            const word2 = TextAnalyzer.getWordAtPosition(text, 8); // within "world"
            expect(word2).toEqual({
                word: 'world',
                start: 6,
                end: 11
            });
        });

        it('should handle hyphenated words', () => {
            const text = 'well-known example';
            
            const word = TextAnalyzer.getWordAtPosition(text, 5); // within hyphenated word
            expect(word).toEqual({
                word: 'well-known',
                start: 0,
                end: 10
            });
        });

        it('should return null for non-word positions', () => {
            const text = 'hello world';
            
            const result = TextAnalyzer.getWordAtPosition(text, 5); // space position
            expect(result).toBeNull();
        });
    });

    describe('Context Analysis Integration', () => {
        it('should provide comprehensive analysis', () => {
            const text = 'Email user@example.com. Visit https://test.com today.';
            const analysis = TextAnalyzer.analyzeContext(text, 40); // near URL
            
            expect(analysis.matchedPatterns).toHaveLength(2);
            expect(analysis.matchedPatterns.some(p => p.type === 'email')).toBe(true);
            expect(analysis.matchedPatterns.some(p => p.type === 'url')).toBe(true);
            expect(analysis.nearbyBoundaries.length).toBeGreaterThan(0);
        });

        it('should handle multiple overlapping contexts', () => {
            const text = 'Check [this link](https://example.com) and email@test.com';
            const analysis = TextAnalyzer.analyzeContext(text, 20); // within markdown link
            
            expect(analysis.shouldSkipCapitalization).toBe(true);
            expect(analysis.matchedPatterns.length).toBeGreaterThanOrEqual(2);
        });
    });
});