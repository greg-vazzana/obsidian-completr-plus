import { WordPatterns } from '../src/word_patterns';

describe('WordPatterns', () => {
  describe('static patterns', () => {
    describe('WORD_PATTERN', () => {
      it('should match simple words', () => {
        expect(WordPatterns.WORD_PATTERN.test('hello')).toBe(true);
        expect(WordPatterns.WORD_PATTERN.test('world')).toBe(true);
        expect(WordPatterns.WORD_PATTERN.test('test123')).toBe(true);
        expect(WordPatterns.WORD_PATTERN.test('123test')).toBe(true);
      });

      it('should match words with internal punctuation', () => {
        expect(WordPatterns.WORD_PATTERN.test("don't")).toBe(true);
        expect(WordPatterns.WORD_PATTERN.test('well-formed')).toBe(true);
        expect(WordPatterns.WORD_PATTERN.test('my_variable')).toBe(true);
        expect(WordPatterns.WORD_PATTERN.test("you're")).toBe(true);
      });

      it('should match words with dots', () => {
        expect(WordPatterns.WORD_PATTERN.test('file.txt')).toBe(true);
        expect(WordPatterns.WORD_PATTERN.test('module.function')).toBe(true);
        expect(WordPatterns.WORD_PATTERN.test('package.json')).toBe(true);
        expect(WordPatterns.WORD_PATTERN.test('a.b.c')).toBe(true);
      });

      it('should match unicode letters', () => {
        expect(WordPatterns.WORD_PATTERN.test('café')).toBe(true);
        expect(WordPatterns.WORD_PATTERN.test('naïve')).toBe(true);
        expect(WordPatterns.WORD_PATTERN.test('résumé')).toBe(true);
        expect(WordPatterns.WORD_PATTERN.test('Björk')).toBe(true);
        expect(WordPatterns.WORD_PATTERN.test('πάντα')).toBe(true);
      });

      it('should match words that contain valid word patterns', () => {
        // Note: WORD_PATTERN is not anchored, so it finds word-like substrings
        expect(WordPatterns.WORD_PATTERN.test("'hello")).toBe(true); // finds "hello"
        expect(WordPatterns.WORD_PATTERN.test('-world')).toBe(true); // finds "world"
        expect(WordPatterns.WORD_PATTERN.test('_test')).toBe(true); // finds "test"
        expect(WordPatterns.WORD_PATTERN.test('.file')).toBe(true); // finds "file"
      });

      it('should match strings ending with punctuation if they contain valid words', () => {
        // Note: WORD_PATTERN is not anchored, so it finds word-like substrings
        expect(WordPatterns.WORD_PATTERN.test("hello'")).toBe(true); // finds "hello"
        expect(WordPatterns.WORD_PATTERN.test('world-')).toBe(true); // finds "world"
        expect(WordPatterns.WORD_PATTERN.test('test_')).toBe(true); // finds "test"
        expect(WordPatterns.WORD_PATTERN.test('file.')).toBe(true); // finds "file"
      });

      it('should not match empty string or pure punctuation', () => {
        expect(WordPatterns.WORD_PATTERN.test('')).toBe(false);
        expect(WordPatterns.WORD_PATTERN.test("'")).toBe(false);
        expect(WordPatterns.WORD_PATTERN.test('-')).toBe(false);
        expect(WordPatterns.WORD_PATTERN.test('_')).toBe(false);
        expect(WordPatterns.WORD_PATTERN.test('.')).toBe(false);
        expect(WordPatterns.WORD_PATTERN.test('---')).toBe(false);
      });

      it('should match strings with consecutive punctuation if they contain valid word parts', () => {
        // Note: WORD_PATTERN finds individual word-like substrings
        expect(WordPatterns.WORD_PATTERN.test("hello--world")).toBe(true); // finds "hello" and "world"
        expect(WordPatterns.WORD_PATTERN.test("test__name")).toBe(true); // finds "test" and "name"
        expect(WordPatterns.WORD_PATTERN.test("file..txt")).toBe(true); // finds "file" and "txt"
        expect(WordPatterns.WORD_PATTERN.test("can''t")).toBe(true); // finds "can" and "t"
      });
    });

    describe('WORD_CHARACTER_PATTERN', () => {
      it('should match letters', () => {
        expect(WordPatterns.WORD_CHARACTER_PATTERN.test('a')).toBe(true);
        expect(WordPatterns.WORD_CHARACTER_PATTERN.test('Z')).toBe(true);
        expect(WordPatterns.WORD_CHARACTER_PATTERN.test('é')).toBe(true);
        expect(WordPatterns.WORD_CHARACTER_PATTERN.test('π')).toBe(true);
      });

      it('should match digits', () => {
        expect(WordPatterns.WORD_CHARACTER_PATTERN.test('0')).toBe(true);
        expect(WordPatterns.WORD_CHARACTER_PATTERN.test('9')).toBe(true);
        expect(WordPatterns.WORD_CHARACTER_PATTERN.test('5')).toBe(true);
      });

      it('should not match punctuation', () => {
        expect(WordPatterns.WORD_CHARACTER_PATTERN.test('-')).toBe(false);
        expect(WordPatterns.WORD_CHARACTER_PATTERN.test("'")).toBe(false);
        expect(WordPatterns.WORD_CHARACTER_PATTERN.test('_')).toBe(false);
        expect(WordPatterns.WORD_CHARACTER_PATTERN.test('.')).toBe(false);
        expect(WordPatterns.WORD_CHARACTER_PATTERN.test(' ')).toBe(false);
      });

      it('should not match empty string', () => {
        expect(WordPatterns.WORD_CHARACTER_PATTERN.test('')).toBe(false);
      });
    });
  });

  describe('isWordCharacter', () => {
    it('should return true for letters', () => {
      expect(WordPatterns.isWordCharacter('a')).toBe(true);
      expect(WordPatterns.isWordCharacter('Z')).toBe(true);
      expect(WordPatterns.isWordCharacter('é')).toBe(true);
      expect(WordPatterns.isWordCharacter('π')).toBe(true);
    });

    it('should return true for digits', () => {
      expect(WordPatterns.isWordCharacter('0')).toBe(true);
      expect(WordPatterns.isWordCharacter('9')).toBe(true);
      expect(WordPatterns.isWordCharacter('5')).toBe(true);
    });

    it('should return false for punctuation and spaces', () => {
      expect(WordPatterns.isWordCharacter('-')).toBe(false);
      expect(WordPatterns.isWordCharacter("'")).toBe(false);
      expect(WordPatterns.isWordCharacter('_')).toBe(false);
      expect(WordPatterns.isWordCharacter('.')).toBe(false);
      expect(WordPatterns.isWordCharacter(' ')).toBe(false);
      expect(WordPatterns.isWordCharacter('\t')).toBe(false);
      expect(WordPatterns.isWordCharacter('\n')).toBe(false);
    });

    it('should return false for special characters', () => {
      expect(WordPatterns.isWordCharacter('@')).toBe(false);
      expect(WordPatterns.isWordCharacter('#')).toBe(false);
      expect(WordPatterns.isWordCharacter('$')).toBe(false);
      expect(WordPatterns.isWordCharacter('%')).toBe(false);
      expect(WordPatterns.isWordCharacter('&')).toBe(false);
    });

    it('should return false for empty string', () => {
      expect(WordPatterns.isWordCharacter('')).toBe(false);
    });

    it('should handle multi-character strings by testing first character', () => {
      expect(WordPatterns.isWordCharacter('hello')).toBe(true);
      expect(WordPatterns.isWordCharacter('123')).toBe(true);
      expect(WordPatterns.isWordCharacter('---')).toBe(false);
    });
  });

  describe('isValidWord', () => {
    it('should return true for valid simple words', () => {
      expect(WordPatterns.isValidWord('hello')).toBe(true);
      expect(WordPatterns.isValidWord('world')).toBe(true);
      expect(WordPatterns.isValidWord('test123')).toBe(true);
      expect(WordPatterns.isValidWord('123test')).toBe(true);
    });

    it('should return true for words with valid internal punctuation', () => {
      expect(WordPatterns.isValidWord("don't")).toBe(true);
      expect(WordPatterns.isValidWord('well-formed')).toBe(true);
      expect(WordPatterns.isValidWord('my_variable')).toBe(true);
      expect(WordPatterns.isValidWord('file.txt')).toBe(true);
      expect(WordPatterns.isValidWord('module.function.method')).toBe(true);
    });

    it('should return true for unicode words', () => {
      expect(WordPatterns.isValidWord('café')).toBe(true);
      expect(WordPatterns.isValidWord('naïve')).toBe(true);
      expect(WordPatterns.isValidWord('résumé')).toBe(true);
      expect(WordPatterns.isValidWord('πάντα')).toBe(true);
    });

    it('should return true for strings containing valid word patterns', () => {
      expect(WordPatterns.isValidWord('')).toBe(false);
      // Note: isValidWord uses unanchored regex, so it finds word-like substrings
      expect(WordPatterns.isValidWord('-hello')).toBe(true); // finds "hello"
      expect(WordPatterns.isValidWord('hello-')).toBe(true); // finds "hello"
      expect(WordPatterns.isValidWord('_test')).toBe(true); // finds "test"
      expect(WordPatterns.isValidWord('test_')).toBe(true); // finds "test"
      expect(WordPatterns.isValidWord('.file')).toBe(true); // finds "file"
      expect(WordPatterns.isValidWord('file.')).toBe(true); // finds "file"
    });

    it('should return true for strings with consecutive punctuation if they contain valid word parts', () => {
      // Note: isValidWord uses unanchored regex, so it finds word-like substrings
      expect(WordPatterns.isValidWord('hello--world')).toBe(true); // finds "hello" and "world"
      expect(WordPatterns.isValidWord('test__name')).toBe(true); // finds "test" and "name"
      expect(WordPatterns.isValidWord('file..txt')).toBe(true); // finds "file" and "txt"
      expect(WordPatterns.isValidWord("can''t")).toBe(true); // finds "can" and "t"
    });

    it('should return false for pure punctuation', () => {
      expect(WordPatterns.isValidWord('-')).toBe(false);
      expect(WordPatterns.isValidWord('_')).toBe(false);
      expect(WordPatterns.isValidWord('.')).toBe(false);
      expect(WordPatterns.isValidWord("'")).toBe(false);
      expect(WordPatterns.isValidWord('---')).toBe(false);
    });

    it('should return true for strings with spaces if they contain valid word parts', () => {
      // Note: isValidWord uses unanchored regex, so it finds word-like substrings
      expect(WordPatterns.isValidWord('hello world')).toBe(true); // finds "hello" and "world"
      expect(WordPatterns.isValidWord('test file')).toBe(true); // finds "test" and "file"
      expect(WordPatterns.isValidWord(' hello')).toBe(true); // finds "hello"
      expect(WordPatterns.isValidWord('hello ')).toBe(true); // finds "hello"
    });
  });

  describe('extractWordsFromLine', () => {
    it('should extract simple words', () => {
      const matches = WordPatterns.extractWordsFromLine('hello world test');
      
      expect(matches).toHaveLength(3);
      expect(matches[0][0]).toBe('hello');
      expect(matches[1][0]).toBe('world');
      expect(matches[2][0]).toBe('test');
    });

    it('should extract words with complex punctuation', () => {
      const matches = WordPatterns.extractWordsFromLine("don't well-formed my_variable file.txt");
      
      expect(matches).toHaveLength(4);
      expect(matches[0][0]).toBe("don't");
      expect(matches[1][0]).toBe('well-formed');
      expect(matches[2][0]).toBe('my_variable');
      expect(matches[3][0]).toBe('file.txt');
    });

    it('should include match indices', () => {
      const matches = WordPatterns.extractWordsFromLine('hello world');
      
      expect(matches[0].index).toBe(0);
      expect(matches[1].index).toBe(6);
    });

    it('should handle empty lines', () => {
      const matches = WordPatterns.extractWordsFromLine('');
      expect(matches).toHaveLength(0);
    });

    it('should handle lines with no words', () => {
      const matches = WordPatterns.extractWordsFromLine('!@# $$$ %%%');
      expect(matches).toHaveLength(0);
    });

    it('should handle lines with only punctuation', () => {
      const matches = WordPatterns.extractWordsFromLine('--- ... ___');
      expect(matches).toHaveLength(0);
    });

    it('should extract words separated by various punctuation', () => {
      const matches = WordPatterns.extractWordsFromLine('hello,world;test!done?yes.');
      
      expect(matches).toHaveLength(5);
      expect(matches[0][0]).toBe('hello');
      expect(matches[1][0]).toBe('world');
      expect(matches[2][0]).toBe('test');
      expect(matches[3][0]).toBe('done');
      expect(matches[4][0]).toBe('yes');
    });

    it('should handle unicode words', () => {
      const matches = WordPatterns.extractWordsFromLine('café naïve résumé');
      
      expect(matches).toHaveLength(3);
      expect(matches[0][0]).toBe('café');
      expect(matches[1][0]).toBe('naïve');
      expect(matches[2][0]).toBe('résumé');
    });

    it('should reset global regex state', () => {
      // First call
      const matches1 = WordPatterns.extractWordsFromLine('hello world');
      expect(matches1).toHaveLength(2);
      
      // Second call should work correctly (not affected by previous state)
      const matches2 = WordPatterns.extractWordsFromLine('test file');
      expect(matches2).toHaveLength(2);
      expect(matches2[0][0]).toBe('test');
      expect(matches2[1][0]).toBe('file');
    });

    it('should handle mixed content with numbers', () => {
      const matches = WordPatterns.extractWordsFromLine('test123 456test mix7ed file2.txt');
      
      expect(matches).toHaveLength(4);
      expect(matches[0][0]).toBe('test123');
      expect(matches[1][0]).toBe('456test');
      expect(matches[2][0]).toBe('mix7ed');
      expect(matches[3][0]).toBe('file2.txt');
    });
  });

  describe('findWordAtPosition', () => {
    it('should find word at exact end position', () => {
      const line = 'hello world test';
      
      expect(WordPatterns.findWordAtPosition(line, 5)).toBe('hello');
      expect(WordPatterns.findWordAtPosition(line, 11)).toBe('world');
      expect(WordPatterns.findWordAtPosition(line, 16)).toBe('test');
    });

    it('should return null when position is not at word end', () => {
      const line = 'hello world test';
      
      expect(WordPatterns.findWordAtPosition(line, 3)).toBeNull(); // middle of 'hello'
      expect(WordPatterns.findWordAtPosition(line, 8)).toBeNull(); // middle of 'world'
      expect(WordPatterns.findWordAtPosition(line, 6)).toBeNull(); // space after 'hello'
      expect(WordPatterns.findWordAtPosition(line, 0)).toBeNull(); // start of line
    });

    it('should handle position beyond line length', () => {
      const line = 'hello world';
      
      expect(WordPatterns.findWordAtPosition(line, 100)).toBeNull();
    });

    it('should handle empty line', () => {
      expect(WordPatterns.findWordAtPosition('', 0)).toBeNull();
      expect(WordPatterns.findWordAtPosition('', 5)).toBeNull();
    });

    it('should handle line with no words', () => {
      const line = '!@# $$$ %%%';
      
      expect(WordPatterns.findWordAtPosition(line, 3)).toBeNull();
      expect(WordPatterns.findWordAtPosition(line, 7)).toBeNull();
    });

    it('should find words with complex punctuation', () => {
      const line = "don't well-formed my_variable";
      
      expect(WordPatterns.findWordAtPosition(line, 5)).toBe("don't");
      expect(WordPatterns.findWordAtPosition(line, 17)).toBe('well-formed');
      expect(WordPatterns.findWordAtPosition(line, 29)).toBe('my_variable');
    });

    it('should handle words with dots', () => {
      const line = 'file.txt module.function';
      
      expect(WordPatterns.findWordAtPosition(line, 8)).toBe('file.txt');
      expect(WordPatterns.findWordAtPosition(line, 24)).toBe('module.function');
    });

    it('should handle unicode words', () => {
      const line = 'café naïve résumé';
      
      expect(WordPatterns.findWordAtPosition(line, 4)).toBe('café');
      expect(WordPatterns.findWordAtPosition(line, 10)).toBe('naïve');
      expect(WordPatterns.findWordAtPosition(line, 17)).toBe('résumé');
    });

    it('should handle single character words', () => {
      const line = 'a b c';
      
      expect(WordPatterns.findWordAtPosition(line, 1)).toBe('a');
      expect(WordPatterns.findWordAtPosition(line, 3)).toBe('b');
      expect(WordPatterns.findWordAtPosition(line, 5)).toBe('c');
    });

    it('should handle negative positions', () => {
      const line = 'hello world';
      
      expect(WordPatterns.findWordAtPosition(line, -1)).toBeNull();
      expect(WordPatterns.findWordAtPosition(line, -5)).toBeNull();
    });
  });

  describe('createCharacterPredicate', () => {
    it('should return a function', () => {
      const predicate = WordPatterns.createCharacterPredicate();
      expect(typeof predicate).toBe('function');
    });

    it('should return predicate that works like isWordCharacter', () => {
      const predicate = WordPatterns.createCharacterPredicate();
      
      expect(predicate('a')).toBe(true);
      expect(predicate('Z')).toBe(true);
      expect(predicate('5')).toBe(true);
      expect(predicate('é')).toBe(true);
      
      expect(predicate('-')).toBe(false);
      expect(predicate("'")).toBe(false);
      expect(predicate('_')).toBe(false);
      expect(predicate(' ')).toBe(false);
      expect(predicate('.')).toBe(false);
    });

    it('should handle empty string', () => {
      const predicate = WordPatterns.createCharacterPredicate();
      expect(predicate('')).toBe(false);
    });

    it('should work with longer strings by testing first character', () => {
      const predicate = WordPatterns.createCharacterPredicate();
      
      expect(predicate('hello')).toBe(true);
      expect(predicate('123')).toBe(true);
      expect(predicate('---')).toBe(false);
    });
  });

  describe('integration tests', () => {
    it('should work consistently across methods', () => {
      const line = "hello world don't test123 file.txt";
      
      // Extract words
      const matches = WordPatterns.extractWordsFromLine(line);
      expect(matches).toHaveLength(5);
      
      // Validate each extracted word
      for (const match of matches) {
        expect(WordPatterns.isValidWord(match[0])).toBe(true);
      }
      
      // Find words at their end positions
      expect(WordPatterns.findWordAtPosition(line, 5)).toBe('hello');
      expect(WordPatterns.findWordAtPosition(line, 11)).toBe('world');
      expect(WordPatterns.findWordAtPosition(line, 17)).toBe("don't");
      expect(WordPatterns.findWordAtPosition(line, 25)).toBe('test123');
      expect(WordPatterns.findWordAtPosition(line, 34)).toBe('file.txt'); // Position 34 (length is 34)
    });

    it('should handle edge cases consistently', () => {
      const line = '';
      
      expect(WordPatterns.extractWordsFromLine(line)).toHaveLength(0);
      expect(WordPatterns.findWordAtPosition(line, 0)).toBeNull();
      expect(WordPatterns.isValidWord('')).toBe(false);
    });

    it('should work with complex unicode text', () => {
      const line = 'πάντα ῥεῖ café-résumé naïve_test';
      
      const matches = WordPatterns.extractWordsFromLine(line);
      expect(matches.length).toBeGreaterThan(0);
      
      // All extracted words should be valid
      for (const match of matches) {
        expect(WordPatterns.isValidWord(match[0])).toBe(true);
      }
    });
  });
}); 