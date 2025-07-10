// Mock dependencies
jest.mock('../src/word_patterns');

import PeriodInserter from '../src/period_inserter';
import { WordPatterns } from '../src/word_patterns';
import { Editor, EditorPosition } from 'obsidian';

// Mock Editor interface
const createMockEditor = (lines: string[], cursorLine: number = 0, cursorCh: number = 0) => {
  let currentCursor: EditorPosition = { line: cursorLine, ch: cursorCh };
  
  return {
    getLine: (lineNum: number): string => {
      return lines[lineNum] || '';
    },
    getCursor: (): EditorPosition => {
      return currentCursor;
    },
    setCursor: (pos: EditorPosition): void => {
      currentCursor = pos;
    },
    replaceRange: jest.fn(),
    lineCount: (): number => {
      return lines.length;
    }
  } as any;
};

describe('PeriodInserter', () => {
  let periodInserter: PeriodInserter;
  let mockEditor: any;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();
    
    // Setup WordPatterns mock
    (WordPatterns.isWordCharacter as jest.Mock) = jest.fn();
    
    // Create fresh instance
    periodInserter = new PeriodInserter();
    
    // Create mock editor
    mockEditor = createMockEditor(['hello world test']);
  });

  describe('State Management', () => {
    it('should start with canInsert as false', () => {
      expect(periodInserter.canInsertPeriod()).toBe(false);
    });

    it('should allow insertion when allowInsertPeriod is called', () => {
      periodInserter.allowInsertPeriod();
      expect(periodInserter.canInsertPeriod()).toBe(true);
    });

    it('should cancel insertion when cancelInsertPeriod is called', () => {
      // First allow insertion
      periodInserter.allowInsertPeriod();
      expect(periodInserter.canInsertPeriod()).toBe(true);
      
      // Then cancel it
      periodInserter.cancelInsertPeriod();
      expect(periodInserter.canInsertPeriod()).toBe(false);
    });

    it('should handle multiple state changes correctly', () => {
      // Start false
      expect(periodInserter.canInsertPeriod()).toBe(false);
      
      // Allow -> true
      periodInserter.allowInsertPeriod();
      expect(periodInserter.canInsertPeriod()).toBe(true);
      
      // Allow again -> still true
      periodInserter.allowInsertPeriod();
      expect(periodInserter.canInsertPeriod()).toBe(true);
      
      // Cancel -> false
      periodInserter.cancelInsertPeriod();
      expect(periodInserter.canInsertPeriod()).toBe(false);
      
      // Cancel again -> still false
      periodInserter.cancelInsertPeriod();
      expect(periodInserter.canInsertPeriod()).toBe(false);
    });
  });

  describe('Period Insertion', () => {
    beforeEach(() => {
      // Allow insertion for these tests
      periodInserter.allowInsertPeriod();
    });

    it('should insert period and cancel insertion state', () => {
      mockEditor = createMockEditor(['hello world'], 0, 5); // Cursor after "hello"
      (WordPatterns.isWordCharacter as jest.Mock) = jest.fn().mockReturnValue(false);

      periodInserter.attemptInsert(mockEditor);

      // Should insert period at position before cursor
      expect(mockEditor.replaceRange).toHaveBeenCalledWith('.', { line: 0, ch: 4 });
      
      // Should cancel insertion state
      expect(periodInserter.canInsertPeriod()).toBe(false);
    });

    it('should not insert period when cursor is in middle of word', () => {
      mockEditor = createMockEditor(['hello world'], 0, 3); // Cursor in middle of "hello"
      (WordPatterns.isWordCharacter as jest.Mock) = jest.fn().mockReturnValue(true); // Next char is word character

      periodInserter.attemptInsert(mockEditor);

      // Should not insert period
      expect(mockEditor.replaceRange).not.toHaveBeenCalled();
      
      // Should still cancel insertion state
      expect(periodInserter.canInsertPeriod()).toBe(false);
    });

    it('should insert period at end of line', () => {
      mockEditor = createMockEditor(['hello'], 0, 5); // Cursor at end of line
      (WordPatterns.isWordCharacter as jest.Mock) = jest.fn().mockReturnValue(false);

      periodInserter.attemptInsert(mockEditor);

      expect(mockEditor.replaceRange).toHaveBeenCalledWith('.', { line: 0, ch: 4 });
      expect(periodInserter.canInsertPeriod()).toBe(false);
    });

    it('should handle cursor at beginning of line', () => {
      mockEditor = createMockEditor(['hello world'], 0, 0); // Cursor at beginning
      (WordPatterns.isWordCharacter as jest.Mock) = jest.fn().mockReturnValue(false);

      periodInserter.attemptInsert(mockEditor);

      // Should try to insert at position -1 (before beginning)
      expect(mockEditor.replaceRange).toHaveBeenCalledWith('.', { line: 0, ch: -1 });
      expect(periodInserter.canInsertPeriod()).toBe(false);
    });

    it('should handle multi-line content', () => {
      mockEditor = createMockEditor(['first line', 'second line'], 1, 6); // Cursor after "second"
      (WordPatterns.isWordCharacter as jest.Mock) = jest.fn().mockReturnValue(false);

      periodInserter.attemptInsert(mockEditor);

      expect(mockEditor.replaceRange).toHaveBeenCalledWith('.', { line: 1, ch: 5 });
      expect(periodInserter.canInsertPeriod()).toBe(false);
    });

    it('should not insert when next character is a word character', () => {
      mockEditor = createMockEditor(['hello world'], 0, 3); // Cursor between "hel" and "lo"
      (WordPatterns.isWordCharacter as jest.Mock) = jest.fn().mockReturnValue(true); // "l" is word character

      periodInserter.attemptInsert(mockEditor);

      expect(mockEditor.replaceRange).not.toHaveBeenCalled();
      expect(periodInserter.canInsertPeriod()).toBe(false);
    });

    it('should insert when next character is punctuation', () => {
      mockEditor = createMockEditor(['hello, world'], 0, 5); // Cursor before comma
      (WordPatterns.isWordCharacter as jest.Mock) = jest.fn().mockReturnValue(false); // "," is not word character

      periodInserter.attemptInsert(mockEditor);

      expect(mockEditor.replaceRange).toHaveBeenCalledWith('.', { line: 0, ch: 4 });
      expect(periodInserter.canInsertPeriod()).toBe(false);
    });

    it('should insert when next character is whitespace', () => {
      mockEditor = createMockEditor(['hello world'], 0, 5); // Cursor before space
      (WordPatterns.isWordCharacter as jest.Mock) = jest.fn().mockReturnValue(false); // " " is not word character

      periodInserter.attemptInsert(mockEditor);

      expect(mockEditor.replaceRange).toHaveBeenCalledWith('.', { line: 0, ch: 4 });
      expect(periodInserter.canInsertPeriod()).toBe(false);
    });

    it('should always cancel insertion state even when not inserting', () => {
      mockEditor = createMockEditor(['hello world'], 0, 3);
      (WordPatterns.isWordCharacter as jest.Mock) = jest.fn().mockReturnValue(true);

      // Verify state is initially allowed
      expect(periodInserter.canInsertPeriod()).toBe(true);

      periodInserter.attemptInsert(mockEditor);

      // Should cancel even when no insertion happened
      expect(periodInserter.canInsertPeriod()).toBe(false);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty line', () => {
      mockEditor = createMockEditor([''], 0, 0);
      (WordPatterns.isWordCharacter as jest.Mock) = jest.fn().mockReturnValue(false);
      
      periodInserter.allowInsertPeriod();
      periodInserter.attemptInsert(mockEditor);

      expect(mockEditor.replaceRange).toHaveBeenCalledWith('.', { line: 0, ch: -1 });
      expect(periodInserter.canInsertPeriod()).toBe(false);
    });

    it('should handle line with only whitespace', () => {
      mockEditor = createMockEditor(['   '], 0, 2); // Cursor in middle of spaces
      (WordPatterns.isWordCharacter as jest.Mock) = jest.fn().mockReturnValue(false);
      
      periodInserter.allowInsertPeriod();
      periodInserter.attemptInsert(mockEditor);

      expect(mockEditor.replaceRange).toHaveBeenCalledWith('.', { line: 0, ch: 1 });
      expect(periodInserter.canInsertPeriod()).toBe(false);
    });

    it('should handle cursor beyond line length', () => {
      mockEditor = createMockEditor(['hello'], 0, 10); // Cursor way past end
      (WordPatterns.isWordCharacter as jest.Mock) = jest.fn().mockReturnValue(false);
      
      periodInserter.allowInsertPeriod();
      periodInserter.attemptInsert(mockEditor);

      expect(mockEditor.replaceRange).toHaveBeenCalledWith('.', { line: 0, ch: 9 });
      expect(periodInserter.canInsertPeriod()).toBe(false);
    });

    it('should handle undefined/null line content', () => {
      mockEditor = createMockEditor(['hello'], 0, 3);
      // Mock getLine to return undefined for current line
      mockEditor.getLine = jest.fn().mockReturnValue(undefined);
      (WordPatterns.isWordCharacter as jest.Mock) = jest.fn().mockReturnValue(false);
      
      periodInserter.allowInsertPeriod();
      
      // Current implementation doesn't handle undefined line gracefully, throws error
      expect(() => {
        periodInserter.attemptInsert(mockEditor);
      }).toThrow();
      
      // State should still be cancelled even after error
      expect(periodInserter.canInsertPeriod()).toBe(false);
    });

    it('should handle special characters in line', () => {
      mockEditor = createMockEditor(['hello@world#test'], 0, 6); // Cursor after "@"
      (WordPatterns.isWordCharacter as jest.Mock) = jest.fn().mockReturnValue(true); // "w" is word character
      
      periodInserter.allowInsertPeriod();
      periodInserter.attemptInsert(mockEditor);

      expect(mockEditor.replaceRange).not.toHaveBeenCalled();
      expect(periodInserter.canInsertPeriod()).toBe(false);
    });

    it('should handle Unicode characters', () => {
      mockEditor = createMockEditor(['héllo wørld'], 0, 6); // Cursor after "héllo"
      (WordPatterns.isWordCharacter as jest.Mock) = jest.fn().mockReturnValue(false); // " " is not word character
      
      periodInserter.allowInsertPeriod();
      periodInserter.attemptInsert(mockEditor);

      expect(mockEditor.replaceRange).toHaveBeenCalledWith('.', { line: 0, ch: 5 });
      expect(periodInserter.canInsertPeriod()).toBe(false);
    });
  });

  describe('WordPatterns Integration', () => {
    it('should call WordPatterns.isWordCharacter with correct character', () => {
      mockEditor = createMockEditor(['hello world'], 0, 5); // Cursor before space
      
      periodInserter.allowInsertPeriod();
      periodInserter.attemptInsert(mockEditor);

      expect(WordPatterns.isWordCharacter).toHaveBeenCalledWith(' ');
    });

    it('should call WordPatterns.isWordCharacter with character at cursor position', () => {
      mockEditor = createMockEditor(['hello!world'], 0, 6); // Cursor after "!"
      
      periodInserter.allowInsertPeriod();
      periodInserter.attemptInsert(mockEditor);

      expect(WordPatterns.isWordCharacter).toHaveBeenCalledWith('w');
    });

    it('should handle WordPatterns returning true correctly', () => {
      mockEditor = createMockEditor(['hello world'], 0, 4); // Cursor in middle of "hello"
      (WordPatterns.isWordCharacter as jest.Mock) = jest.fn().mockReturnValue(true);
      
      periodInserter.allowInsertPeriod();
      periodInserter.attemptInsert(mockEditor);

      expect(WordPatterns.isWordCharacter).toHaveBeenCalledWith('o');
      expect(mockEditor.replaceRange).not.toHaveBeenCalled();
    });

    it('should handle WordPatterns returning false correctly', () => {
      mockEditor = createMockEditor(['hello world'], 0, 5); // Cursor before space
      (WordPatterns.isWordCharacter as jest.Mock) = jest.fn().mockReturnValue(false);
      
      periodInserter.allowInsertPeriod();
      periodInserter.attemptInsert(mockEditor);

      expect(WordPatterns.isWordCharacter).toHaveBeenCalledWith(' ');
      expect(mockEditor.replaceRange).toHaveBeenCalledWith('.', { line: 0, ch: 4 });
    });
  });
}); 