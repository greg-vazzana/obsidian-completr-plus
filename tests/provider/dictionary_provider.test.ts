import { DictionaryProvider } from '../../src/provider/dictionary_provider';
import { CompletrSettings, WordInsertionMode } from '../../src/settings';
import { Word } from '../../src/db/sqlite_database_service';
import { SuggestionContext } from '../../src/provider/provider';

// Create a concrete implementation for testing
class TestDictionaryProvider extends DictionaryProvider {
    readonly wordMap: Map<string, Map<string, Word>> = new Map();
    
    isEnabled(settings: CompletrSettings): boolean {
        return true;
    }
}

describe('DictionaryProvider', () => {
    let provider: TestDictionaryProvider;
    let settings: CompletrSettings;
    
    beforeEach(() => {
        provider = new TestDictionaryProvider();
        settings = {
            minWordTriggerLength: 2,
            wordInsertionMode: WordInsertionMode.IGNORE_CASE_REPLACE,
            enableFuzzyMatching: false
        } as CompletrSettings;
        
        // Add some test words
        const testWords = new Map<string, Word>();
        testWords.set('hello', { word: 'hello', frequency: 1 });
        testWords.set('corporate', { word: 'corporate', frequency: 1 });
        provider.wordMap.set('h', testWords);
        provider.wordMap.set('c', new Map([['corporate', { word: 'corporate', frequency: 1 }]]));
    });
    
    describe('Case Preservation', () => {
        it('should preserve lowercase query case', () => {
            const context: SuggestionContext = {
                query: 'cor',
                editor: {} as any,
                file: {} as any,
                start: { line: 0, ch: 0 },
                end: { line: 0, ch: 3 },
                separatorChar: ' '
            };
            
            const suggestions = provider.getSuggestions(context, settings);
            
            expect(suggestions.length).toBe(1);
            expect(suggestions[0].originalQueryCase).toBe('cor');
            expect(suggestions[0].getReplacementWithPreservedCase()).toBe('corporate');
        });
        
        it('should preserve uppercase query case', () => {
            const context: SuggestionContext = {
                query: 'COR',
                editor: {} as any,
                file: {} as any,
                start: { line: 0, ch: 0 },
                end: { line: 0, ch: 3 },
                separatorChar: ' '
            };
            
            const suggestions = provider.getSuggestions(context, settings);
            
            expect(suggestions.length).toBe(1);
            expect(suggestions[0].originalQueryCase).toBe('COR');
            expect(suggestions[0].getReplacementWithPreservedCase()).toBe('CORPORATE');
        });
        
        it('should preserve capitalized query case', () => {
            const context: SuggestionContext = {
                query: 'Cor',
                editor: {} as any,
                file: {} as any,
                start: { line: 0, ch: 0 },
                end: { line: 0, ch: 3 },
                separatorChar: ' '
            };
            
            const suggestions = provider.getSuggestions(context, settings);
            
            expect(suggestions.length).toBe(1);
            expect(suggestions[0].originalQueryCase).toBe('Cor');
            expect(suggestions[0].getReplacementWithPreservedCase()).toBe('Corporate');
        });
        
        it('should work with fuzzy matching enabled', () => {
            settings.enableFuzzyMatching = true;
            
            const context: SuggestionContext = {
                query: 'Cor',
                editor: {} as any,
                file: {} as any,
                start: { line: 0, ch: 0 },
                end: { line: 0, ch: 3 },
                separatorChar: ' '
            };
            
            const suggestions = provider.getSuggestions(context, settings);
            
            expect(suggestions.length).toBe(1);
            expect(suggestions[0].originalQueryCase).toBe('Cor');
            expect(suggestions[0].getReplacementWithPreservedCase()).toBe('Corporate');
        });
    });
}); 