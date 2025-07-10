// Mock dependencies
jest.mock('../../src/utils/text_utils');
jest.mock('../../src/utils/validation_utils');

import { EditorUtils, BlockType } from '../../src/utils/editor_utils';
import { TextUtils } from '../../src/utils/text_utils';
import { ValidationUtils } from '../../src/utils/validation_utils';
import { Editor, EditorPosition } from 'obsidian';
import { Text, EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

// Mock CodeMirror Text interface
const createMockText = (lines: string[]): Text => {
  const content = lines.join('\n');
  
  return {
    length: content.length,
    lines: lines.length,
    line: (number: number) => {
      const lineContent = lines[number - 1] || '';
      return {
        number,
        from: 0,
        to: lineContent.length,
        text: lineContent
      };
    },
    lineAt: (offset: number) => {
      // Simple implementation - just return first line for safety
      const firstLine = lines[0] || '';
      return {
        number: 1,
        from: 0,
        to: firstLine.length,
        text: firstLine
      };
    },
    toString: () => content,
    slice: (from: number, to?: number) => content.slice(from, to)
  } as unknown as Text;
};

// Mock Editor interface
const createMockEditor = (lines: string[]) => {
  return {
    getLine: (lineNum: number): string => {
      return lines[lineNum] || '';
    },
    getRange: (from: EditorPosition, to: EditorPosition): string => {
      if (from.line === to.line) {
        const line = lines[from.line] || '';
        return line.substring(from.ch, to.ch);
      }
      // Multi-line range - simplified implementation
      let result = '';
      for (let i = from.line; i <= to.line; i++) {
        const line = lines[i] || '';
        if (i === from.line) {
          result += line.substring(from.ch);
        } else if (i === to.line) {
          result += '\n' + line.substring(0, to.ch);
        } else {
          result += '\n' + line;
        }
      }
      return result;
    },
    lineCount: (): number => {
      return lines.length;
    },
    lastLine: (): number => {
      return lines.length - 1;
    },
    cm: {
      state: {} as EditorState,
      view: {} as EditorView
    }
  } as any;
};

describe('EditorUtils', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup default mock implementations
    (TextUtils.substringMatches as jest.Mock) = jest.fn();
    (TextUtils.indexOf as jest.Mock) = jest.fn();
    (ValidationUtils.getFrontMatterBounds as jest.Mock) = jest.fn();
  });

  describe('Position Conversion', () => {
    describe('posFromIndex', () => {
      it('should have posFromIndex method available', () => {
        expect(typeof EditorUtils.posFromIndex).toBe('function');
      });
    });

    describe('indexFromPos', () => {
      it('should have indexFromPos method available', () => {
        expect(typeof EditorUtils.indexFromPos).toBe('function');
      });
    });
  });

  describe('matchWordBackwards', () => {
    let mockEditor: any;
    const mockCharPredicate = jest.fn();

    beforeEach(() => {
      mockEditor = createMockEditor(['hello world test']);
      mockCharPredicate.mockClear();
    });

    it('should match word backwards from cursor', () => {
      mockCharPredicate.mockImplementation((char: string) => /[a-zA-Z]/.test(char));
      
      const result = EditorUtils.matchWordBackwards(
        mockEditor, 
        { line: 0, ch: 5 }, // After "hello"
        mockCharPredicate
      );
      
      expect(result.query).toBe('hello');
      expect(result.separatorChar).toBe('');
    });

    it('should find separator character', () => {
      mockCharPredicate.mockImplementation((char: string) => /[a-zA-Z]/.test(char));
      
      const result = EditorUtils.matchWordBackwards(
        mockEditor, 
        { line: 0, ch: 11 }, // After "world"
        mockCharPredicate
      );
      
      expect(result.query).toBe('world');
      expect(result.separatorChar).toBe(' ');
    });

    it('should respect maxLookBackDistance', () => {
      mockCharPredicate.mockImplementation((char: string) => /[a-zA-Z]/.test(char));
      
      const result = EditorUtils.matchWordBackwards(
        mockEditor, 
        { line: 0, ch: 16 }, // After "test"
        mockCharPredicate,
        3 // Only look back 3 characters
      );
      
      expect(result.query).toBe('est'); // Only last 3 characters
      expect(result.separatorChar).toBe(''); // Limited look-back doesn't include separator
    });

    it('should handle cursor at beginning of line', () => {
      mockCharPredicate.mockImplementation((char: string) => /[a-zA-Z]/.test(char));
      
      const result = EditorUtils.matchWordBackwards(
        mockEditor, 
        { line: 0, ch: 0 },
        mockCharPredicate
      );
      
      expect(result.query).toBe('');
      expect(result.separatorChar).toBe('');
    });

    it('should handle partial word matching', () => {
      mockCharPredicate.mockImplementation((char: string) => /[a-zA-Z]/.test(char));
      
      const result = EditorUtils.matchWordBackwards(
        mockEditor, 
        { line: 0, ch: 3 }, // Middle of "hello"
        mockCharPredicate
      );
      
      expect(result.query).toBe('hel');
      expect(result.separatorChar).toBe('');
    });

    it('should handle punctuation as separator', () => {
      mockEditor = createMockEditor(['hello,world']);
      mockCharPredicate.mockImplementation((char: string) => /[a-zA-Z]/.test(char));
      
      const result = EditorUtils.matchWordBackwards(
        mockEditor, 
        { line: 0, ch: 11 }, // After "world"
        mockCharPredicate
      );
      
      expect(result.query).toBe('world');
      expect(result.separatorChar).toBe(',');
    });

    it('should handle empty line', () => {
      mockEditor = createMockEditor(['']);
      mockCharPredicate.mockImplementation((char: string) => /[a-zA-Z]/.test(char));
      
      const result = EditorUtils.matchWordBackwards(
        mockEditor, 
        { line: 0, ch: 0 },
        mockCharPredicate
      );
      
      expect(result.query).toBe('');
      expect(result.separatorChar).toBe('');
    });
  });

  describe('BlockType enum', () => {
    it('should have correct properties for DOLLAR_SINGLE', () => {
      expect(BlockType.DOLLAR_SINGLE.c).toBe('$');
      expect(BlockType.DOLLAR_SINGLE.isMultiLine).toBe(false);
      expect(BlockType.DOLLAR_SINGLE.isDollarBlock).toBe(true);
      expect(BlockType.DOLLAR_SINGLE.isCodeBlock).toBe(false);
      expect(BlockType.DOLLAR_SINGLE.otherType).toBe(BlockType.DOLLAR_MULTI);
    });

    it('should have correct properties for DOLLAR_MULTI', () => {
      expect(BlockType.DOLLAR_MULTI.c).toBe('$$');
      expect(BlockType.DOLLAR_MULTI.isMultiLine).toBe(true);
      expect(BlockType.DOLLAR_MULTI.isDollarBlock).toBe(true);
      expect(BlockType.DOLLAR_MULTI.isCodeBlock).toBe(false);
      expect(BlockType.DOLLAR_MULTI.otherType).toBe(BlockType.DOLLAR_SINGLE);
    });

    it('should have correct properties for CODE_SINGLE', () => {
      expect(BlockType.CODE_SINGLE.c).toBe('`');
      expect(BlockType.CODE_SINGLE.isMultiLine).toBe(false);
      expect(BlockType.CODE_SINGLE.isDollarBlock).toBe(false);
      expect(BlockType.CODE_SINGLE.isCodeBlock).toBe(true);
      expect(BlockType.CODE_SINGLE.otherType).toBe(BlockType.CODE_MULTI);
    });

    it('should have correct properties for CODE_MULTI', () => {
      expect(BlockType.CODE_MULTI.c).toBe('```');
      expect(BlockType.CODE_MULTI.isMultiLine).toBe(true);
      expect(BlockType.CODE_MULTI.isDollarBlock).toBe(false);
      expect(BlockType.CODE_MULTI.isCodeBlock).toBe(true);
      expect(BlockType.CODE_MULTI.otherType).toBe(BlockType.CODE_SINGLE);
    });

    it('should have correct SINGLE_TYPES array', () => {
      expect(BlockType.SINGLE_TYPES).toEqual([BlockType.DOLLAR_SINGLE, BlockType.CODE_SINGLE]);
    });
  });

  describe('getLatexBlockType', () => {
    let mockEditor: any;

    beforeEach(() => {
      mockEditor = createMockEditor([]);
      (ValidationUtils.getFrontMatterBounds as jest.Mock) = jest.fn().mockReturnValue(null);
      (TextUtils.substringMatches as jest.Mock) = jest.fn();
      (TextUtils.indexOf as jest.Mock) = jest.fn();
    });

    it('should have getLatexBlockType method available', () => {
      expect(typeof EditorUtils.getLatexBlockType).toBe('function');
    });

    it('should return null when no blocks found', () => {
      mockEditor = createMockEditor(['plain text']);
      
      const result = EditorUtils.getLatexBlockType(mockEditor, { line: 0, ch: 5 }, true);
      
      expect(result).toBeNull();
    });

    it('should call validation utilities', () => {
      mockEditor = createMockEditor(['text']);
      
      EditorUtils.getLatexBlockType(mockEditor, { line: 0, ch: 2 }, true);
      
      expect(ValidationUtils.getFrontMatterBounds).toHaveBeenCalled();
    });
  });

  describe('editorToCodeMirrorState', () => {
    it('should return CodeMirror state from editor', () => {
      const mockState = {} as EditorState;
      const mockEditor = { cm: { state: mockState } } as any;
      
      const result = EditorUtils.editorToCodeMirrorState(mockEditor);
      
      expect(result).toBe(mockState);
    });
  });

  describe('editorToCodeMirrorView', () => {
    it('should return CodeMirror view from editor', () => {
      const mockView = {} as EditorView;
      const mockEditor = { cm: mockView } as any;
      
      const result = EditorUtils.editorToCodeMirrorView(mockEditor);
      
      expect(result).toBe(mockView);
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle empty document', () => {
      const doc = createMockText([]);
      
      expect(EditorUtils.posFromIndex(doc, 0)).toEqual({ line: 0, ch: 0 });
      expect(EditorUtils.indexFromPos(doc, { line: 0, ch: 0 })).toBe(0);
    });

    it('should handle single empty line', () => {
      const doc = createMockText(['']);
      
      expect(EditorUtils.posFromIndex(doc, 0)).toEqual({ line: 0, ch: 0 });
      expect(EditorUtils.indexFromPos(doc, { line: 0, ch: 0 })).toBe(0);
    });

    it('should handle unicode characters correctly', () => {
      const doc = createMockText(['héllo', 'wørld']);
      
      const pos = EditorUtils.posFromIndex(doc, 3);
      const offset = EditorUtils.indexFromPos(doc, pos);
      
      expect(pos.line).toBe(0);
      expect(offset).toBe(3);
    });
  });
}); 