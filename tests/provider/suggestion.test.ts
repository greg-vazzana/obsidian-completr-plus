import { Suggestion } from '../../src/provider/provider';
import { EditorPosition } from 'obsidian';

describe('Suggestion', () => {
  describe('constructor', () => {
    it('should create suggestion with required parameters', () => {
      const suggestion = new Suggestion('display', 'replacement');
      
      expect(suggestion.displayName).toBe('display');
      expect(suggestion.replacement).toBe('replacement');
      expect(suggestion.overrideStart).toBeUndefined();
      expect(suggestion.overrideEnd).toBeUndefined();
      expect(suggestion.icon).toBeUndefined();
      expect(suggestion.color).toBeUndefined();
      expect(suggestion.frequency).toBeUndefined();
    });

    it('should create suggestion with all parameters', () => {
      const start: EditorPosition = { line: 1, ch: 0 };
      const end: EditorPosition = { line: 1, ch: 5 };
      
      const suggestion = new Suggestion('display', 'replacement', start, end, {
        icon: 'icon-name',
        color: '#ff0000',
        frequency: 10
      });
      
      expect(suggestion.displayName).toBe('display');
      expect(suggestion.replacement).toBe('replacement');
      expect(suggestion.overrideStart).toEqual(start);
      expect(suggestion.overrideEnd).toEqual(end);
      expect(suggestion.icon).toBe('icon-name');
      expect(suggestion.color).toBe('#ff0000');
      expect(suggestion.frequency).toBe(10);
    });

    it('should create suggestion with partial options', () => {
      const suggestion = new Suggestion('display', 'replacement', undefined, undefined, {
        icon: 'icon-name'
      });
      
      expect(suggestion.displayName).toBe('display');
      expect(suggestion.replacement).toBe('replacement');
      expect(suggestion.overrideStart).toBeUndefined();
      expect(suggestion.overrideEnd).toBeUndefined();
      expect(suggestion.icon).toBe('icon-name');
      expect(suggestion.color).toBeUndefined();
      expect(suggestion.frequency).toBeUndefined();
    });

    it('should handle empty strings', () => {
      const suggestion = new Suggestion('', '');
      
      expect(suggestion.displayName).toBe('');
      expect(suggestion.replacement).toBe('');
    });

    it('should handle special characters', () => {
      const suggestion = new Suggestion('Café & Naïve', 'café-naïve');
      
      expect(suggestion.displayName).toBe('Café & Naïve');
      expect(suggestion.replacement).toBe('café-naïve');
    });
  });

  describe('fromString', () => {
    it('should create suggestion from string', () => {
      const suggestion = Suggestion.fromString('test');
      
      expect(suggestion.displayName).toBe('test');
      expect(suggestion.replacement).toBe('test');
      expect(suggestion.overrideStart).toBeUndefined();
      expect(suggestion.overrideEnd).toBeUndefined();
      expect(suggestion.icon).toBeUndefined();
      expect(suggestion.color).toBeUndefined();
      expect(suggestion.frequency).toBeUndefined();
    });

    it('should create suggestion from string with override start', () => {
      const start: EditorPosition = { line: 2, ch: 10 };
      const suggestion = Suggestion.fromString('test', start);
      
      expect(suggestion.displayName).toBe('test');
      expect(suggestion.replacement).toBe('test');
      expect(suggestion.overrideStart).toEqual(start);
      expect(suggestion.overrideEnd).toBeUndefined();
    });

    it('should handle empty string', () => {
      const suggestion = Suggestion.fromString('');
      
      expect(suggestion.displayName).toBe('');
      expect(suggestion.replacement).toBe('');
    });

    it('should handle complex strings', () => {
      const complexString = 'function myFunction() { return "test"; }';
      const suggestion = Suggestion.fromString(complexString);
      
      expect(suggestion.displayName).toBe(complexString);
      expect(suggestion.replacement).toBe(complexString);
    });

    it('should handle strings with whitespace', () => {
      const suggestion = Suggestion.fromString('  hello world  ');
      
      expect(suggestion.displayName).toBe('  hello world  ');
      expect(suggestion.replacement).toBe('  hello world  ');
    });
  });

  describe('getDisplayNameLowerCase', () => {
    it('should return lowercase when lowerCase is true', () => {
      const suggestion = new Suggestion('Hello World', 'hello-world');
      
      expect(suggestion.getDisplayNameLowerCase(true)).toBe('hello world');
    });

    it('should return original case when lowerCase is false', () => {
      const suggestion = new Suggestion('Hello World', 'hello-world');
      
      expect(suggestion.getDisplayNameLowerCase(false)).toBe('Hello World');
    });

    it('should handle empty display name', () => {
      const suggestion = new Suggestion('', 'replacement');
      
      expect(suggestion.getDisplayNameLowerCase(true)).toBe('');
      expect(suggestion.getDisplayNameLowerCase(false)).toBe('');
    });

    it('should handle display name with special characters', () => {
      const suggestion = new Suggestion('Test@123!', 'test');
      
      expect(suggestion.getDisplayNameLowerCase(true)).toBe('test@123!');
      expect(suggestion.getDisplayNameLowerCase(false)).toBe('Test@123!');
    });

    it('should handle already lowercase display name', () => {
      const suggestion = new Suggestion('already lowercase', 'test');
      
      expect(suggestion.getDisplayNameLowerCase(true)).toBe('already lowercase');
      expect(suggestion.getDisplayNameLowerCase(false)).toBe('already lowercase');
    });

    it('should handle display name with numbers', () => {
      const suggestion = new Suggestion('Test123', 'test');
      
      expect(suggestion.getDisplayNameLowerCase(true)).toBe('test123');
      expect(suggestion.getDisplayNameLowerCase(false)).toBe('Test123');
    });
  });

  describe('derive', () => {
    let baseSuggestion: Suggestion;

    beforeEach(() => {
      baseSuggestion = new Suggestion('Original', 'original', 
        { line: 1, ch: 0 }, 
        { line: 1, ch: 8 }, 
        {
          icon: 'original-icon',
          color: '#blue',
          frequency: 5
        }
      );
    });

    it('should create derived suggestion with changed display name', () => {
      const derived = baseSuggestion.derive({ displayName: 'New Display' });
      
      expect(derived.displayName).toBe('New Display');
      expect(derived.replacement).toBe('original');
      expect(derived.overrideStart).toEqual({ line: 1, ch: 0 });
      expect(derived.overrideEnd).toEqual({ line: 1, ch: 8 });
      expect(derived.icon).toBe('original-icon');
      expect(derived.color).toBe('#blue');
      expect(derived.frequency).toBe(5);
    });

    it('should create derived suggestion with changed replacement', () => {
      const derived = baseSuggestion.derive({ replacement: 'new-replacement' });
      
      expect(derived.displayName).toBe('Original');
      expect(derived.replacement).toBe('new-replacement');
      expect(derived.overrideStart).toEqual({ line: 1, ch: 0 });
      expect(derived.overrideEnd).toEqual({ line: 1, ch: 8 });
      expect(derived.icon).toBe('original-icon');
      expect(derived.color).toBe('#blue');
      expect(derived.frequency).toBe(5);
    });

    it('should create derived suggestion with changed positions', () => {
      const newStart: EditorPosition = { line: 2, ch: 5 };
      const newEnd: EditorPosition = { line: 2, ch: 10 };
      
      const derived = baseSuggestion.derive({ 
        overrideStart: newStart, 
        overrideEnd: newEnd 
      });
      
      expect(derived.displayName).toBe('Original');
      expect(derived.replacement).toBe('original');
      expect(derived.overrideStart).toEqual(newStart);
      expect(derived.overrideEnd).toEqual(newEnd);
      expect(derived.icon).toBe('original-icon');
      expect(derived.color).toBe('#blue');
      expect(derived.frequency).toBe(5);
    });

    it('should create derived suggestion with changed options', () => {
      const derived = baseSuggestion.derive({ 
        icon: 'new-icon',
        color: '#red',
        frequency: 10
      });
      
      expect(derived.displayName).toBe('Original');
      expect(derived.replacement).toBe('original');
      expect(derived.overrideStart).toEqual({ line: 1, ch: 0 });
      expect(derived.overrideEnd).toEqual({ line: 1, ch: 8 });
      expect(derived.icon).toBe('new-icon');
      expect(derived.color).toBe('#red');
      expect(derived.frequency).toBe(10);
    });

    it('should create derived suggestion with multiple changes', () => {
      const derived = baseSuggestion.derive({
        displayName: 'Multi Change',
        replacement: 'multi-change',
        icon: 'multi-icon',
        frequency: 15
      });
      
      expect(derived.displayName).toBe('Multi Change');
      expect(derived.replacement).toBe('multi-change');
      expect(derived.overrideStart).toEqual({ line: 1, ch: 0 });
      expect(derived.overrideEnd).toEqual({ line: 1, ch: 8 });
      expect(derived.icon).toBe('multi-icon');
      expect(derived.color).toBe('#blue'); // unchanged
      expect(derived.frequency).toBe(15);
    });

    it('should create derived suggestion with empty options', () => {
      const derived = baseSuggestion.derive({});
      
      expect(derived.displayName).toBe('Original');
      expect(derived.replacement).toBe('original');
      expect(derived.overrideStart).toEqual({ line: 1, ch: 0 });
      expect(derived.overrideEnd).toEqual({ line: 1, ch: 8 });
      expect(derived.icon).toBe('original-icon');
      expect(derived.color).toBe('#blue');
      expect(derived.frequency).toBe(5);
    });

    it('should handle undefined values in options', () => {
      const derived = baseSuggestion.derive({ 
        displayName: undefined,
        icon: undefined
      });
      
      expect(derived.displayName).toBe('Original');
      expect(derived.replacement).toBe('original');
      expect(derived.icon).toBe('original-icon');
    });

    it('should handle null values being passed', () => {
      const derived = baseSuggestion.derive({ 
        displayName: null as any,
        overrideStart: null as any
      });
      
      // null should be treated as falsy, so original values should be used
      expect(derived.displayName).toBe('Original');
      expect(derived.overrideStart).toEqual({ line: 1, ch: 0 });
    });

    it('should work with minimal base suggestion', () => {
      const minimal = new Suggestion('Min', 'min');
      const derived = minimal.derive({ 
        icon: 'new-icon',
        frequency: 1
      });
      
      expect(derived.displayName).toBe('Min');
      expect(derived.replacement).toBe('min');
      expect(derived.overrideStart).toBeUndefined();
      expect(derived.overrideEnd).toBeUndefined();
      expect(derived.icon).toBe('new-icon');
      expect(derived.color).toBeUndefined();
      expect(derived.frequency).toBe(1);
    });
  });

  describe('integration tests', () => {
    it('should work with complex workflow', () => {
      // Create base suggestion
      const base = Suggestion.fromString('test');
      
      // Derive with additional properties
      const enhanced = base.derive({
        icon: 'test-icon',
        frequency: 3
      });
      
      // Derive again with changes
      const final = enhanced.derive({
        displayName: 'Final Test',
        color: '#green'
      });
      
      expect(final.displayName).toBe('Final Test');
      expect(final.replacement).toBe('test');
      expect(final.icon).toBe('test-icon');
      expect(final.color).toBe('#green');
      expect(final.frequency).toBe(3);
    });

    it('should handle chained derives', () => {
      const result = new Suggestion('Chain', 'chain')
        .derive({ frequency: 1 })
        .derive({ icon: 'chain-icon' })
        .derive({ displayName: 'Chained Display' });
      
      expect(result.displayName).toBe('Chained Display');
      expect(result.replacement).toBe('chain');
      expect(result.icon).toBe('chain-icon');
      expect(result.frequency).toBe(1);
    });
  });

  describe('getReplacementWithPreservedCase', () => {
    it('should preserve lowercase query case', () => {
      const suggestion = new Suggestion('hello', 'hello', undefined, undefined, {
        originalQueryCase: 'he'
      });
      
      expect(suggestion.getReplacementWithPreservedCase()).toBe('hello');
    });

    it('should preserve uppercase query case', () => {
      const suggestion = new Suggestion('hello', 'hello', undefined, undefined, {
        originalQueryCase: 'HE'
      });
      
      expect(suggestion.getReplacementWithPreservedCase()).toBe('HELLO');
    });

    it('should preserve capitalized query case', () => {
      const suggestion = new Suggestion('hello', 'hello', undefined, undefined, {
        originalQueryCase: 'He'
      });
      
      expect(suggestion.getReplacementWithPreservedCase()).toBe('Hello');
    });

    it('should return original replacement if no originalQueryCase', () => {
      const suggestion = new Suggestion('hello', 'hello');
      expect(suggestion.getReplacementWithPreservedCase()).toBe('hello');
    });

    it('should handle empty originalQueryCase', () => {
      const suggestion = new Suggestion('hello', 'hello', undefined, undefined, {
        originalQueryCase: ''
      });
      
      expect(suggestion.getReplacementWithPreservedCase()).toBe('hello');
    });
  });

  describe('constructor and derive', () => {
    it('should preserve originalQueryCase in derive', () => {
      const original = new Suggestion('hello', 'hello', undefined, undefined, {
        originalQueryCase: 'He'
      });
      
      const derived = original.derive({});
      expect(derived.originalQueryCase).toBe('He');
    });

    it('should allow overriding originalQueryCase in derive', () => {
      const original = new Suggestion('hello', 'hello', undefined, undefined, {
        originalQueryCase: 'He'
      });
      
      const derived = original.derive({
        originalQueryCase: 'HE'
      });
      
      expect(derived.originalQueryCase).toBe('HE');
    });
  });
}); 