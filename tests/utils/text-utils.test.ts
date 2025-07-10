import { TextUtils } from '../../src/utils/text_utils';

describe('TextUtils', () => {
  describe('maybeLowerCase', () => {
    it('should return lowercase string when lowerCase is true', () => {
      expect(TextUtils.maybeLowerCase('Hello World', true)).toBe('hello world');
      expect(TextUtils.maybeLowerCase('TEST', true)).toBe('test');
    });

    it('should return original string when lowerCase is false', () => {
      expect(TextUtils.maybeLowerCase('Hello World', false)).toBe('Hello World');
      expect(TextUtils.maybeLowerCase('TEST', false)).toBe('TEST');
    });

    it('should handle empty string', () => {
      expect(TextUtils.maybeLowerCase('', true)).toBe('');
      expect(TextUtils.maybeLowerCase('', false)).toBe('');
    });

    it('should handle special characters', () => {
      expect(TextUtils.maybeLowerCase('Hello@World!', true)).toBe('hello@world!');
      expect(TextUtils.maybeLowerCase('Hello@World!', false)).toBe('Hello@World!');
    });
  });

  describe('removeDiacritics', () => {
    it('should remove diacritics from characters', () => {
      expect(TextUtils.removeDiacritics('café')).toBe('cafe');
      expect(TextUtils.removeDiacritics('naïve')).toBe('naive');
      expect(TextUtils.removeDiacritics('résumé')).toBe('resume');
    });

    it('should handle strings without diacritics', () => {
      expect(TextUtils.removeDiacritics('hello')).toBe('hello');
      expect(TextUtils.removeDiacritics('world')).toBe('world');
    });

    it('should handle empty string', () => {
      expect(TextUtils.removeDiacritics('')).toBe('');
    });

    it('should handle mixed strings', () => {
      expect(TextUtils.removeDiacritics('Hello café naïve')).toBe('Hello cafe naive');
    });

    it('should handle special characters without diacritics', () => {
      expect(TextUtils.removeDiacritics('hello@world!')).toBe('hello@world!');
    });
  });

  describe('substringUntil', () => {
    it('should return substring until delimiter', () => {
      expect(TextUtils.substringUntil('hello world', ' ')).toBe('hello');
      expect(TextUtils.substringUntil('test@example.com', '@')).toBe('test');
    });

    it('should return full string if delimiter not found', () => {
      expect(TextUtils.substringUntil('hello world', 'x')).toBe('hello world');
      expect(TextUtils.substringUntil('test', '@')).toBe('test');
    });

    it('should handle empty string', () => {
      expect(TextUtils.substringUntil('', ' ')).toBe('');
    });

    it('should handle delimiter at start', () => {
      expect(TextUtils.substringUntil(' hello', ' ')).toBe('');
    });

    it('should handle multiple occurrences (return first)', () => {
      expect(TextUtils.substringUntil('hello world test', ' ')).toBe('hello');
    });

    it('should handle empty delimiter', () => {
      expect(TextUtils.substringUntil('hello', '')).toBe('');
    });
  });

  describe('substringMatches', () => {
    it('should return true when strings match at position', () => {
      expect(TextUtils.substringMatches('hello world', 'hello', 0)).toBe(true);
      expect(TextUtils.substringMatches('hello world', 'world', 6)).toBe(true);
    });

    it('should return false when strings do not match', () => {
      expect(TextUtils.substringMatches('hello world', 'test', 0)).toBe(false);
      expect(TextUtils.substringMatches('hello world', 'hello', 6)).toBe(false);
    });

    it('should handle partial matches', () => {
      expect(TextUtils.substringMatches('hello world', 'hell', 0)).toBe(true);
      expect(TextUtils.substringMatches('hello world', 'wor', 6)).toBe(true);
    });

    it('should handle exact boundary matches', () => {
      expect(TextUtils.substringMatches('hello', 'hello', 0)).toBe(true);
      expect(TextUtils.substringMatches('hello', 'o', 4)).toBe(true);
    });

    it('should handle out of bounds cases', () => {
      expect(TextUtils.substringMatches('hello', 'hello', 1)).toBe(false);
      expect(TextUtils.substringMatches('hello', 'world', 0)).toBe(false);
    });

    it('should handle empty strings', () => {
      expect(TextUtils.substringMatches('', '', 0)).toBe(true);
      expect(TextUtils.substringMatches('hello', '', 0)).toBe(true);
      expect(TextUtils.substringMatches('', 'hello', 0)).toBe(false);
    });
  });

  describe('filterMapIntoArray', () => {
    it('should filter and map items into array', () => {
      const result: number[] = [];
      const items = [1, 2, 3, 4, 5];
      
      TextUtils.filterMapIntoArray(
        result,
        items,
        (val) => val % 2 === 0, // filter even numbers
        (val) => val * 2        // double them
      );
      
      expect(result).toEqual([4, 8]); // 2*2=4, 4*2=8
    });

    it('should handle empty iterable', () => {
      const result: string[] = [];
      const items: number[] = [];
      
      TextUtils.filterMapIntoArray(
        result,
        items,
        (val) => true,
        (val) => val.toString()
      );
      
      expect(result).toEqual([]);
    });

    it('should handle no matching items', () => {
      const result: number[] = [];
      const items = [1, 3, 5];
      
      TextUtils.filterMapIntoArray(
        result,
        items,
        (val) => val % 2 === 0, // filter even numbers
        (val) => val * 2
      );
      
      expect(result).toEqual([]);
    });

    it('should handle all matching items', () => {
      const result: string[] = [];
      const items = ['a', 'b', 'c'];
      
      TextUtils.filterMapIntoArray(
        result,
        items,
        (val) => true,
        (val) => val.toUpperCase()
      );
      
      expect(result).toEqual(['A', 'B', 'C']);
    });

    it('should work with different types', () => {
      const result: string[] = [];
      const items = [1, 2, 3, 4, 5];
      
      TextUtils.filterMapIntoArray(
        result,
        items,
        (val) => val > 3,
        (val) => `item-${val}`
      );
      
      expect(result).toEqual(['item-4', 'item-5']);
    });
  });

  describe('indexOf', () => {
    it('should find index of first matching element', () => {
      const arr = [1, 2, 3, 4, 5];
      expect(TextUtils.indexOf(arr, (val) => val > 3)).toBe(3); // index of 4
      expect(TextUtils.indexOf(arr, (val) => val === 2)).toBe(1); // index of 2
    });

    it('should return -1 when no element matches', () => {
      const arr = [1, 2, 3, 4, 5];
      expect(TextUtils.indexOf(arr, (val) => val > 10)).toBe(-1);
      expect(TextUtils.indexOf(arr, (val) => val < 0)).toBe(-1);
    });

    it('should handle empty array', () => {
      const arr: number[] = [];
      expect(TextUtils.indexOf(arr, (val) => val > 0)).toBe(-1);
    });

    it('should respect fromIndex parameter', () => {
      const arr = [1, 2, 3, 2, 5];
      expect(TextUtils.indexOf(arr, (val) => val === 2, 0)).toBe(1);
      expect(TextUtils.indexOf(arr, (val) => val === 2, 2)).toBe(3);
      expect(TextUtils.indexOf(arr, (val) => val === 2, 4)).toBe(-1);
    });

    it('should handle fromIndex beyond array length', () => {
      const arr = [1, 2, 3];
      expect(TextUtils.indexOf(arr, (val) => val === 1, 5)).toBe(-1);
    });

    it('should work with different types', () => {
      const arr = ['hello', 'world', 'test'];
      expect(TextUtils.indexOf(arr, (val) => val.length > 4)).toBe(0); // 'hello'
      expect(TextUtils.indexOf(arr, (val) => val.startsWith('w'))).toBe(1); // 'world'
    });
  });
}); 