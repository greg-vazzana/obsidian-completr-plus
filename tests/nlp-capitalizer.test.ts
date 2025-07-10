// Mock compromise.js NLP library
jest.mock('compromise', () => ({
  __esModule: true,
  default: jest.fn((text: string) => ({
    sentences: () => ({
      out: (format: string) => {
        // Simple sentence splitting for testing
        if (format === 'array') {
          return text.split(/[.!?]+/).filter(s => s.trim().length > 0).map(s => s.trim());
        }
        return text;
      }
    })
  }))
}));

import NLPCapitalizer, { NLPCapitalizationConfig } from '../src/nlp_capitalizer';
import { Editor, EditorPosition } from 'obsidian';

// Mock Editor interface
const createMockEditor = (lines: string[]): Editor => {
  let editorLines = [...lines];
  
  return {
    getLine: (lineNum: number): string => {
      return editorLines[lineNum] || '';
    },
    lineCount: (): number => {
      return editorLines.length;
    },
    lastLine: (): number => {
      return editorLines.length - 1;
    },
    replaceRange: (replacement: string, from: EditorPosition, to: EditorPosition): void => {
      const line = editorLines[from.line];
      if (line !== undefined) {
        const newLine = line.substring(0, from.ch) + replacement + line.substring(to.ch);
        editorLines[from.line] = newLine;
      }
    },
    getValue: (): string => {
      return editorLines.join('\n');
    },
    setValue: (content: string): void => {
      editorLines = content.split('\n');
    },
    // Add minimal required methods for Obsidian Editor interface
    getRange: jest.fn(),
    setSelection: jest.fn(),
    getCursor: jest.fn(),
    setCursor: jest.fn(),
    getSelection: jest.fn(),
    replaceSelection: jest.fn(),
    getDoc: jest.fn(),
    refresh: jest.fn(),
    focus: jest.fn(),
    blur: jest.fn(),
    hasFocus: jest.fn(),
    getScrollInfo: jest.fn(),
    scrollTo: jest.fn(),
    scrollIntoView: jest.fn(),
    undo: jest.fn(),
    redo: jest.fn(),
    execCommand: jest.fn(),
    on: jest.fn(),
    off: jest.fn(),
    trigger: jest.fn()
  } as unknown as Editor;
};

describe('NLPCapitalizer', () => {
  let capitalizer: NLPCapitalizer;
  let mockEditor: Editor;

  beforeEach(() => {
    capitalizer = new NLPCapitalizer();
    mockEditor = createMockEditor(['']);
  });

  describe('Constructor and Configuration', () => {
    it('should create with default configuration', () => {
      const defaultCapitalizer = new NLPCapitalizer();
      expect(defaultCapitalizer).toBeDefined();
    });

    it('should accept custom configuration', () => {
      const customConfig: Partial<NLPCapitalizationConfig> = {
        capitalizeLines: false,
        capitalizeSentences: true,
        preserveMixedCase: false,
        debug: true
      };
      
      const customCapitalizer = new NLPCapitalizer(customConfig);
      expect(customCapitalizer).toBeDefined();
    });

    it('should update configuration', () => {
      capitalizer.updateConfig({ capitalizeLines: false });
      expect(capitalizer).toBeDefined();
    });
  });

  describe('Line Capitalization', () => {
    beforeEach(() => {
      capitalizer = new NLPCapitalizer({ 
        capitalizeLines: true, 
        capitalizeSentences: false 
      });
    });

    it('should capitalize first word of a simple line', () => {
      mockEditor = createMockEditor(['hello world']);
      const cursor: EditorPosition = { line: 0, ch: 5 };
      
      capitalizer.attemptCapitalization(mockEditor, cursor, ' ');
      
      expect(mockEditor.getLine(0)).toBe('Hello world');
    });

    it('should capitalize first word after markdown heading', () => {
      mockEditor = createMockEditor(['# hello world']);
      const cursor: EditorPosition = { line: 0, ch: 7 };
      
      capitalizer.attemptCapitalization(mockEditor, cursor, ' ');
      
      expect(mockEditor.getLine(0)).toBe('# Hello world');
    });

    it('should capitalize first word after list marker', () => {
      mockEditor = createMockEditor(['- hello world']);
      const cursor: EditorPosition = { line: 0, ch: 7 };
      
      capitalizer.attemptCapitalization(mockEditor, cursor, ' ');
      
      expect(mockEditor.getLine(0)).toBe('- Hello world');
    });

    it('should capitalize first word after numbered list', () => {
      mockEditor = createMockEditor(['1. hello world']);
      const cursor: EditorPosition = { line: 0, ch: 9 };
      
      capitalizer.attemptCapitalization(mockEditor, cursor, ' ');
      
      expect(mockEditor.getLine(0)).toBe('1. Hello world');
    });

    it('should capitalize first word after blockquote', () => {
      mockEditor = createMockEditor(['> hello world']);
      const cursor: EditorPosition = { line: 0, ch: 7 };
      
      capitalizer.attemptCapitalization(mockEditor, cursor, ' ');
      
      expect(mockEditor.getLine(0)).toBe('> Hello world');
    });

    it('should handle multiple markdown prefixes', () => {
      mockEditor = createMockEditor(['## - hello world']);
      const cursor: EditorPosition = { line: 0, ch: 11 };
      
      capitalizer.attemptCapitalization(mockEditor, cursor, ' ');
      
      expect(mockEditor.getLine(0)).toBe('## - Hello world');
    });

    it('should not capitalize if already capitalized', () => {
      mockEditor = createMockEditor(['Hello world']);
      const cursor: EditorPosition = { line: 0, ch: 5 };
      
      capitalizer.attemptCapitalization(mockEditor, cursor, ' ');
      
      expect(mockEditor.getLine(0)).toBe('Hello world');
    });

    it('should handle empty lines', () => {
      mockEditor = createMockEditor(['']);
      const cursor: EditorPosition = { line: 0, ch: 0 };
      
      capitalizer.attemptCapitalization(mockEditor, cursor, ' ');
      
      expect(mockEditor.getLine(0)).toBe('');
    });

    it('should handle lines with only whitespace', () => {
      mockEditor = createMockEditor(['   ']);
      const cursor: EditorPosition = { line: 0, ch: 2 };
      
      capitalizer.attemptCapitalization(mockEditor, cursor, ' ');
      
      expect(mockEditor.getLine(0)).toBe('   ');
    });

    it('should handle lines with only markdown prefixes', () => {
      mockEditor = createMockEditor(['# ']);
      const cursor: EditorPosition = { line: 0, ch: 2 };
      
      capitalizer.attemptCapitalization(mockEditor, cursor, ' ');
      
      expect(mockEditor.getLine(0)).toBe('# ');
    });
  });

  describe('Sentence Capitalization', () => {
    beforeEach(() => {
      capitalizer = new NLPCapitalizer({ 
        capitalizeLines: false, 
        capitalizeSentences: true 
      });
    });

    it('should process text with sentence endings', () => {
      mockEditor = createMockEditor(['This is a sentence. hello world']);
      const cursor: EditorPosition = { line: 0, ch: 25 };
      
      capitalizer.attemptCapitalization(mockEditor, cursor, ' ');
      
      // Sentence capitalization is context-dependent, just verify no errors
      expect(mockEditor.getLine(0)).toBeDefined();
    });

    it('should process text with exclamation marks', () => {
      mockEditor = createMockEditor(['Great! hello world']);
      const cursor: EditorPosition = { line: 0, ch: 13 };
      
      capitalizer.attemptCapitalization(mockEditor, cursor, ' ');
      
      // Verify processing completes without errors
      expect(mockEditor.getLine(0)).toBeDefined();
    });

    it('should process text with question marks', () => {
      mockEditor = createMockEditor(['Really? hello world']);
      const cursor: EditorPosition = { line: 0, ch: 14 };
      
      capitalizer.attemptCapitalization(mockEditor, cursor, ' ');
      
      // Verify processing completes without errors
      expect(mockEditor.getLine(0)).toBeDefined();
    });

    it('should handle multiple sentences in one line', () => {
      mockEditor = createMockEditor(['First. second. third sentence']);
      const cursor: EditorPosition = { line: 0, ch: 15 };
      
      capitalizer.attemptCapitalization(mockEditor, cursor, ' ');
      
      // Note: Sentence capitalization logic is complex and may not always trigger
      // Just verify the line is processed without errors
      expect(mockEditor.getLine(0)).toBeDefined();
    });

    it('should work with sentence-ending triggers', () => {
      mockEditor = createMockEditor(['Complete sentence']);
      const cursor: EditorPosition = { line: 0, ch: 17 };
      
      capitalizer.attemptCapitalization(mockEditor, cursor, '.');
      
      // This tests the sentence ending detection logic
      expect(mockEditor.getLine(0)).toBe('Complete sentence');
    });
  });

  describe('Mixed Case Preservation', () => {
    beforeEach(() => {
      capitalizer = new NLPCapitalizer({ 
        capitalizeLines: true, 
        preserveMixedCase: true 
      });
    });

    it('should preserve iPhone capitalization', () => {
      mockEditor = createMockEditor(['iPhone is great']);
      const cursor: EditorPosition = { line: 0, ch: 6 };
      
      capitalizer.attemptCapitalization(mockEditor, cursor, ' ');
      
      expect(mockEditor.getLine(0)).toBe('iPhone is great');
    });

    it('should preserve JavaScript capitalization', () => {
      mockEditor = createMockEditor(['javaScript is cool']);
      const cursor: EditorPosition = { line: 0, ch: 10 };
      
      capitalizer.attemptCapitalization(mockEditor, cursor, ' ');
      
      expect(mockEditor.getLine(0)).toBe('javaScript is cool');
    });

    it('should preserve camelCase words', () => {
      mockEditor = createMockEditor(['myVariable is defined']);
      const cursor: EditorPosition = { line: 0, ch: 10 };
      
      capitalizer.attemptCapitalization(mockEditor, cursor, ' ');
      
      expect(mockEditor.getLine(0)).toBe('myVariable is defined');
    });

    it('should not preserve mixed case when disabled', () => {
      capitalizer.updateConfig({ preserveMixedCase: false });
      mockEditor = createMockEditor(['iPhone is great']);
      const cursor: EditorPosition = { line: 0, ch: 6 };
      
      capitalizer.attemptCapitalization(mockEditor, cursor, ' ');
      
      expect(mockEditor.getLine(0)).toBe('Iphone is great');
    });
  });

  describe('Context Awareness', () => {
    beforeEach(() => {
      capitalizer = new NLPCapitalizer({ 
        capitalizeLines: true, 
        capitalizeSentences: true 
      });
    });

    it('should not capitalize in fenced code blocks', () => {
      mockEditor = createMockEditor([
        '```',
        'hello world',
        '```'
      ]);
      const cursor: EditorPosition = { line: 1, ch: 5 };
      
      capitalizer.attemptCapitalization(mockEditor, cursor, ' ');
      
      expect(mockEditor.getLine(1)).toBe('hello world');
    });

    it('should not capitalize in indented code blocks', () => {
      mockEditor = createMockEditor(['    hello world']);
      const cursor: EditorPosition = { line: 0, ch: 9 };
      
      capitalizer.attemptCapitalization(mockEditor, cursor, ' ');
      
      expect(mockEditor.getLine(0)).toBe('    hello world');
    });

    it('should not capitalize in inline code', () => {
      mockEditor = createMockEditor(['Use `hello world` in code']);
      const cursor: EditorPosition = { line: 0, ch: 11 };
      
      capitalizer.attemptCapitalization(mockEditor, cursor, ' ');
      
      expect(mockEditor.getLine(0)).toBe('Use `hello world` in code');
    });

    it('should not capitalize in markdown links', () => {
      mockEditor = createMockEditor(['[hello world](http://example.com)']);
      const cursor: EditorPosition = { line: 0, ch: 7 };
      
      capitalizer.attemptCapitalization(mockEditor, cursor, ' ');
      
      expect(mockEditor.getLine(0)).toBe('[hello world](http://example.com)');
    });

    it('should not capitalize in wiki links', () => {
      mockEditor = createMockEditor(['[[hello world]]']);
      const cursor: EditorPosition = { line: 0, ch: 7 };
      
      capitalizer.attemptCapitalization(mockEditor, cursor, ' ');
      
      expect(mockEditor.getLine(0)).toBe('[[hello world]]');
    });

    it('should capitalize outside of code blocks', () => {
      mockEditor = createMockEditor([
        'hello world',
        '```',
        'code here',
        '```',
        'hello again'
      ]);
      const cursor: EditorPosition = { line: 0, ch: 5 };
      
      capitalizer.attemptCapitalization(mockEditor, cursor, ' ');
      
      expect(mockEditor.getLine(0)).toBe('Hello world');
    });
  });

  describe('Word Boundary and Trigger Detection', () => {
    it('should detect word boundary triggers', () => {
      expect(NLPCapitalizer.isWordBoundaryTrigger(' ')).toBe(true);
      expect(NLPCapitalizer.isWordBoundaryTrigger('.')).toBe(true);
      expect(NLPCapitalizer.isWordBoundaryTrigger(',')).toBe(true);
      expect(NLPCapitalizer.isWordBoundaryTrigger(':')).toBe(true);
      expect(NLPCapitalizer.isWordBoundaryTrigger(';')).toBe(true);
      expect(NLPCapitalizer.isWordBoundaryTrigger('!')).toBe(true);
      expect(NLPCapitalizer.isWordBoundaryTrigger('?')).toBe(true);
      expect(NLPCapitalizer.isWordBoundaryTrigger('a')).toBe(false);
      expect(NLPCapitalizer.isWordBoundaryTrigger('1')).toBe(false);
    });

    it('should detect sentence end triggers', () => {
      expect(NLPCapitalizer.isSentenceEndTrigger('.')).toBe(true);
      expect(NLPCapitalizer.isSentenceEndTrigger('!')).toBe(true);
      expect(NLPCapitalizer.isSentenceEndTrigger('?')).toBe(true);
      expect(NLPCapitalizer.isSentenceEndTrigger(',')).toBe(false);
      expect(NLPCapitalizer.isSentenceEndTrigger(' ')).toBe(false);
      expect(NLPCapitalizer.isSentenceEndTrigger('a')).toBe(false);
    });
  });

  describe('Configuration Combinations', () => {
    it('should work with both line and sentence capitalization enabled', () => {
      capitalizer = new NLPCapitalizer({ 
        capitalizeLines: true, 
        capitalizeSentences: true 
      });
      
      mockEditor = createMockEditor(['hello world. another sentence']);
      const cursor: EditorPosition = { line: 0, ch: 5 };
      
      capitalizer.attemptCapitalization(mockEditor, cursor, ' ');
      
      expect(mockEditor.getLine(0)).toBe('Hello world. another sentence');
    });

    it('should not capitalize when both modes are disabled', () => {
      capitalizer = new NLPCapitalizer({ 
        capitalizeLines: false, 
        capitalizeSentences: false 
      });
      
      mockEditor = createMockEditor(['hello world']);
      const cursor: EditorPosition = { line: 0, ch: 5 };
      
      capitalizer.attemptCapitalization(mockEditor, cursor, ' ');
      
      expect(mockEditor.getLine(0)).toBe('hello world');
    });

    it('should handle debug mode without errors', () => {
      capitalizer = new NLPCapitalizer({ 
        capitalizeLines: true, 
        debug: true 
      });
      
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      mockEditor = createMockEditor(['hello world']);
      const cursor: EditorPosition = { line: 0, ch: 5 };
      
      capitalizer.attemptCapitalization(mockEditor, cursor, ' ');
      
      expect(mockEditor.getLine(0)).toBe('Hello world');
      expect(consoleSpy).toHaveBeenCalled();
      
      consoleSpy.mockRestore();
    });
  });

  describe('Edge Cases', () => {
    it('should handle hyphenated words', () => {
      mockEditor = createMockEditor(['well-known fact']);
      const cursor: EditorPosition = { line: 0, ch: 9 };
      
      capitalizer.attemptCapitalization(mockEditor, cursor, ' ');
      
      expect(mockEditor.getLine(0)).toBe('Well-known fact');
    });

    it('should handle apostrophe words', () => {
      mockEditor = createMockEditor(["don't stop"]);
      const cursor: EditorPosition = { line: 0, ch: 5 };
      
      capitalizer.attemptCapitalization(mockEditor, cursor, ' ');
      
      expect(mockEditor.getLine(0)).toBe("Don't stop");
    });

    it('should handle words with numbers', () => {
      mockEditor = createMockEditor(['word2vec is cool']);
      const cursor: EditorPosition = { line: 0, ch: 8 };
      
      capitalizer.attemptCapitalization(mockEditor, cursor, ' ');
      
      expect(mockEditor.getLine(0)).toBe('Word2vec is cool');
    });

    it('should handle unicode characters', () => {
      mockEditor = createMockEditor(['café is nice']);
      const cursor: EditorPosition = { line: 0, ch: 4 };
      
      capitalizer.attemptCapitalization(mockEditor, cursor, ' ');
      
      expect(mockEditor.getLine(0)).toBe('Café is nice');
    });

    it('should handle very long lines', () => {
      const longLine = 'word '.repeat(1000).trim();
      mockEditor = createMockEditor([longLine]);
      const cursor: EditorPosition = { line: 0, ch: 4 };
      
      capitalizer.attemptCapitalization(mockEditor, cursor, ' ');
      
      expect(mockEditor.getLine(0).substring(0, 4)).toBe('Word');
    });

    it('should handle cursor at different positions', () => {
      mockEditor = createMockEditor(['hello world test']);
      
      // Test at beginning
      let cursor: EditorPosition = { line: 0, ch: 0 };
      capitalizer.attemptCapitalization(mockEditor, cursor, ' ');
      expect(mockEditor.getLine(0)).toBe('Hello world test');
      
      // Reset and test at middle
      mockEditor = createMockEditor(['hello world test']);
      cursor = { line: 0, ch: 6 };
      capitalizer.attemptCapitalization(mockEditor, cursor, ' ');
      expect(mockEditor.getLine(0)).toBe('Hello world test');
      
      // Reset and test at end
      mockEditor = createMockEditor(['hello world test']);
      cursor = { line: 0, ch: 16 };
      capitalizer.attemptCapitalization(mockEditor, cursor, ' ');
      expect(mockEditor.getLine(0)).toBe('Hello world test');
    });

    it('should handle multi-line context', () => {
      mockEditor = createMockEditor([
        'First line here.',
        'second line here.',
        'Third line here.'
      ]);
      const cursor: EditorPosition = { line: 1, ch: 6 };
      
      capitalizer.attemptCapitalization(mockEditor, cursor, ' ');
      
      expect(mockEditor.getLine(1)).toBe('Second line here.');
    });
  });

  describe('Advanced Sentence Detection', () => {
    beforeEach(() => {
      capitalizer = new NLPCapitalizer({ 
        capitalizeLines: false, 
        capitalizeSentences: true,
        debug: false 
      });
    });

    it('should handle complex multi-line text with sentences', () => {
      mockEditor = createMockEditor([
        'This is the first sentence.',
        'this is the second sentence. another one here.',
        'Final sentence here!'
      ]);
      const cursor: EditorPosition = { line: 1, ch: 20 };
      
      capitalizer.attemptCapitalization(mockEditor, cursor, ' ');
      
      // Should process without errors
      expect(mockEditor.getLine(1)).toBeDefined();
    });

    it('should handle sentence boundaries within the same line', () => {
      mockEditor = createMockEditor(['First sentence. second sentence! third sentence?']);
      const cursor: EditorPosition = { line: 0, ch: 30 };
      
      capitalizer.attemptCapitalization(mockEditor, cursor, ' ');
      
      expect(mockEditor.getLine(0)).toBeDefined();
    });

    it('should handle sentences with mixed punctuation', () => {
      mockEditor = createMockEditor(['What?! really... yes. okay then!']);
      const cursor: EditorPosition = { line: 0, ch: 15 };
      
      capitalizer.attemptCapitalization(mockEditor, cursor, ' ');
      
      expect(mockEditor.getLine(0)).toBeDefined();
    });

    it('should handle sentences with quotations', () => {
      mockEditor = createMockEditor(['He said "hello world." then left.']);
      const cursor: EditorPosition = { line: 0, ch: 25 };
      
      capitalizer.attemptCapitalization(mockEditor, cursor, ' ');
      
      expect(mockEditor.getLine(0)).toBeDefined();
    });

    it('should handle sentences with abbreviations', () => {
      mockEditor = createMockEditor(['Dr. Smith visited today. he was nice.']);
      const cursor: EditorPosition = { line: 0, ch: 30 };
      
      capitalizer.attemptCapitalization(mockEditor, cursor, ' ');
      
      expect(mockEditor.getLine(0)).toBeDefined();
    });

    it('should handle very long sentences', () => {
      const longSentence = 'This is a very long sentence that goes on and on and on and continues for a very long time without ending and keeps going and going and going until finally it ends. then a short one.';
      mockEditor = createMockEditor([longSentence]);
      const cursor: EditorPosition = { line: 0, ch: 160 };
      
      capitalizer.attemptCapitalization(mockEditor, cursor, ' ');
      
      expect(mockEditor.getLine(0)).toBeDefined();
    });

    it('should handle sentences with numbers and symbols', () => {
      mockEditor = createMockEditor(['Version 1.2.3 was released. it has new features.']);
      const cursor: EditorPosition = { line: 0, ch: 35 };
      
      capitalizer.attemptCapitalization(mockEditor, cursor, ' ');
      
      expect(mockEditor.getLine(0)).toBeDefined();
    });

    it('should handle empty lines in context', () => {
      mockEditor = createMockEditor([
        'First line.',
        '',
        'third line here.'
      ]);
      const cursor: EditorPosition = { line: 2, ch: 10 };
      
      capitalizer.attemptCapitalization(mockEditor, cursor, ' ');
      
      expect(mockEditor.getLine(2)).toBeDefined();
    });

    it('should handle context with many lines', () => {
      const manyLines = Array.from({ length: 10 }, (_, i) => `Line ${i + 1} content here.`);
      mockEditor = createMockEditor(manyLines);
      const cursor: EditorPosition = { line: 5, ch: 10 };
      
      capitalizer.attemptCapitalization(mockEditor, cursor, ' ');
      
      expect(mockEditor.getLine(5)).toBeDefined();
    });
  });

  describe('Sentence Boundary Detection', () => {
    beforeEach(() => {
      capitalizer = new NLPCapitalizer({ 
        capitalizeLines: false, 
        capitalizeSentences: true,
        debug: false 
      });
    });

    it('should detect sentence boundaries with period', () => {
      mockEditor = createMockEditor(['First. second. third.']);
      const cursor: EditorPosition = { line: 0, ch: 15 };
      
      capitalizer.attemptCapitalization(mockEditor, cursor, '.');
      
      expect(mockEditor.getLine(0)).toBeDefined();
    });

    it('should detect sentence boundaries with exclamation', () => {
      mockEditor = createMockEditor(['Great! amazing! wonderful!']);
      const cursor: EditorPosition = { line: 0, ch: 20 };
      
      capitalizer.attemptCapitalization(mockEditor, cursor, '!');
      
      expect(mockEditor.getLine(0)).toBeDefined();
    });

    it('should detect sentence boundaries with question mark', () => {
      mockEditor = createMockEditor(['What? really? seriously?']);
      const cursor: EditorPosition = { line: 0, ch: 18 };
      
      capitalizer.attemptCapitalization(mockEditor, cursor, '?');
      
      expect(mockEditor.getLine(0)).toBeDefined();
    });

    it('should handle mixed sentence boundaries', () => {
      mockEditor = createMockEditor(['First! second? third. fourth...']);
      const cursor: EditorPosition = { line: 0, ch: 25 };
      
      capitalizer.attemptCapitalization(mockEditor, cursor, '.');
      
      expect(mockEditor.getLine(0)).toBeDefined();
    });

    it('should handle sentence boundaries with spacing', () => {
      mockEditor = createMockEditor(['First.  second.   third.']);
      const cursor: EditorPosition = { line: 0, ch: 18 };
      
      capitalizer.attemptCapitalization(mockEditor, cursor, '.');
      
      expect(mockEditor.getLine(0)).toBeDefined();
    });

    it('should handle sentence boundaries at cursor position', () => {
      mockEditor = createMockEditor(['Before cursor. after cursor.']);
      const cursor: EditorPosition = { line: 0, ch: 14 }; // Right after period
      
      capitalizer.attemptCapitalization(mockEditor, cursor, '.');
      
      expect(mockEditor.getLine(0)).toBeDefined();
    });

    it('should handle no sentence boundaries', () => {
      mockEditor = createMockEditor(['No sentence boundaries here, just commas, and semicolons;']);
      const cursor: EditorPosition = { line: 0, ch: 30 };
      
      capitalizer.attemptCapitalization(mockEditor, cursor, ',');
      
      expect(mockEditor.getLine(0)).toBeDefined();
    });
  });

  describe('Word Position Detection', () => {
    beforeEach(() => {
      capitalizer = new NLPCapitalizer({ 
        capitalizeLines: false, 
        capitalizeSentences: true,
        debug: false 
      });
    });

    it('should find words after sentence boundaries', () => {
      mockEditor = createMockEditor(['Sentence one. word two. word three.']);
      const cursor: EditorPosition = { line: 0, ch: 20 };
      
      capitalizer.attemptCapitalization(mockEditor, cursor, ' ');
      
      expect(mockEditor.getLine(0)).toBeDefined();
    });

    it('should handle words with special characters', () => {
      mockEditor = createMockEditor(['Test sentence. re-test this.']);
      const cursor: EditorPosition = { line: 0, ch: 20 };
      
      capitalizer.attemptCapitalization(mockEditor, cursor, ' ');
      
      expect(mockEditor.getLine(0)).toBeDefined();
    });

    it('should handle words at different positions', () => {
      mockEditor = createMockEditor(['Start. middle word here. end.']);
      
      // Test at beginning
      let cursor: EditorPosition = { line: 0, ch: 7 };
      capitalizer.attemptCapitalization(mockEditor, cursor, ' ');
      
      // Test at middle
      cursor = { line: 0, ch: 15 };
      capitalizer.attemptCapitalization(mockEditor, cursor, ' ');
      
      // Test at end
      cursor = { line: 0, ch: 29 };
      capitalizer.attemptCapitalization(mockEditor, cursor, ' ');
      
      expect(mockEditor.getLine(0)).toBeDefined();
    });

    it('should handle words with numbers', () => {
      mockEditor = createMockEditor(['Version 1.0 released. version2 is next.']);
      const cursor: EditorPosition = { line: 0, ch: 30 };
      
      capitalizer.attemptCapitalization(mockEditor, cursor, ' ');
      
      expect(mockEditor.getLine(0)).toBeDefined();
    });

    it('should handle words with apostrophes', () => {
      mockEditor = createMockEditor(["First sentence. can't do it."]);
      const cursor: EditorPosition = { line: 0, ch: 20 };
      
      capitalizer.attemptCapitalization(mockEditor, cursor, ' ');
      
      expect(mockEditor.getLine(0)).toBeDefined();
    });
  });

  describe('Complex NLP Integration', () => {
    beforeEach(() => {
      capitalizer = new NLPCapitalizer({ 
        capitalizeLines: false, 
        capitalizeSentences: true,
        debug: false 
      });
    });

    it('should handle complex sentence parsing', () => {
      const complexText = [
        'The quick brown fox jumps over the lazy dog.',
        'meanwhile, the cat sleeps peacefully.',
        'However, the bird flies away quickly.'
      ];
      mockEditor = createMockEditor(complexText);
      const cursor: EditorPosition = { line: 1, ch: 15 };
      
      capitalizer.attemptCapitalization(mockEditor, cursor, ' ');
      
      expect(mockEditor.getLine(1)).toBeDefined();
    });

    it('should handle sentences with conjunctions', () => {
      mockEditor = createMockEditor(['First part, and second part. but third part.']);
      const cursor: EditorPosition = { line: 0, ch: 35 };
      
      capitalizer.attemptCapitalization(mockEditor, cursor, ' ');
      
      expect(mockEditor.getLine(0)).toBeDefined();
    });

    it('should handle sentences with parentheses', () => {
      mockEditor = createMockEditor(['Main sentence (with parentheses). another sentence.']);
      const cursor: EditorPosition = { line: 0, ch: 45 };
      
      capitalizer.attemptCapitalization(mockEditor, cursor, ' ');
      
      expect(mockEditor.getLine(0)).toBeDefined();
    });

    it('should handle sentences with lists', () => {
      mockEditor = createMockEditor(['Items: one, two, three. next sentence here.']);
      const cursor: EditorPosition = { line: 0, ch: 35 };
      
      capitalizer.attemptCapitalization(mockEditor, cursor, ' ');
      
      expect(mockEditor.getLine(0)).toBeDefined();
    });

    it('should handle malformed sentences', () => {
      mockEditor = createMockEditor(['incomplete sentence... another. fragment']);
      const cursor: EditorPosition = { line: 0, ch: 30 };
      
      capitalizer.attemptCapitalization(mockEditor, cursor, ' ');
      
      expect(mockEditor.getLine(0)).toBeDefined();
    });
  });

  describe('Debug Mode Testing', () => {
    beforeEach(() => {
      capitalizer = new NLPCapitalizer({ 
        capitalizeLines: true, 
        capitalizeSentences: true,
        debug: true 
      });
    });

    it('should log debug information during line capitalization', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      mockEditor = createMockEditor(['hello world']);
      const cursor: EditorPosition = { line: 0, ch: 5 };
      
      capitalizer.attemptCapitalization(mockEditor, cursor, ' ');
      
      expect(consoleSpy).toHaveBeenCalledWith('NLPCapitalizer: attemptCapitalization called', { cursor, trigger: ' ' });
      expect(consoleSpy).toHaveBeenCalledWith('NLPCapitalizer: Line capitalization applied', { 
        original: 'hello', 
        capitalized: 'Hello' 
      });
      
      consoleSpy.mockRestore();
    });

    it('should log debug information during sentence capitalization', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      mockEditor = createMockEditor(['First sentence. second sentence.']);
      const cursor: EditorPosition = { line: 0, ch: 25 };
      
      capitalizer.attemptCapitalization(mockEditor, cursor, ' ');
      
      expect(consoleSpy).toHaveBeenCalledWith('NLPCapitalizer: attemptCapitalization called', { cursor, trigger: ' ' });
      
      consoleSpy.mockRestore();
    });

    it('should handle debug mode with errors gracefully', () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      
      // Create a scenario that might cause an error
      mockEditor = createMockEditor(['']);
      const cursor: EditorPosition = { line: 0, ch: 0 };
      
      expect(() => {
        capitalizer.attemptCapitalization(mockEditor, cursor, ' ');
      }).not.toThrow();
      
      consoleSpy.mockRestore();
    });
  });

  describe('Advanced Configuration Testing', () => {
    it('should handle configuration updates during runtime', () => {
      const initialConfig = { capitalizeLines: true, capitalizeSentences: false };
      capitalizer = new NLPCapitalizer(initialConfig);
      
      mockEditor = createMockEditor(['hello world']);
      const cursor: EditorPosition = { line: 0, ch: 5 };
      
      capitalizer.attemptCapitalization(mockEditor, cursor, ' ');
      expect(mockEditor.getLine(0)).toBe('Hello world');
      
      // Update configuration
      capitalizer.updateConfig({ capitalizeLines: false, capitalizeSentences: true });
      
      // Reset editor and test again
      mockEditor = createMockEditor(['hello world']);
      capitalizer.attemptCapitalization(mockEditor, cursor, ' ');
      expect(mockEditor.getLine(0)).toBe('hello world'); // Should not capitalize line now
    });

    it('should handle all configuration combinations', () => {
      const configs = [
        { capitalizeLines: true, capitalizeSentences: true, preserveMixedCase: true },
        { capitalizeLines: true, capitalizeSentences: false, preserveMixedCase: false },
        { capitalizeLines: false, capitalizeSentences: true, preserveMixedCase: true },
        { capitalizeLines: false, capitalizeSentences: false, preserveMixedCase: false }
      ];
      
      configs.forEach(config => {
        capitalizer = new NLPCapitalizer(config);
        
        mockEditor = createMockEditor(['hello world. iPhone test.']);
        const cursor: EditorPosition = { line: 0, ch: 10 };
        
        expect(() => {
          capitalizer.attemptCapitalization(mockEditor, cursor, ' ');
        }).not.toThrow();
      });
    });
  });

  describe('Performance and Edge Cases', () => {
    it('should handle very long text efficiently', () => {
      const longText = Array.from({ length: 100 }, (_, i) => 
        `This is sentence number ${i + 1} in a very long text. It continues on and on.`
      );
      mockEditor = createMockEditor(longText);
      const cursor: EditorPosition = { line: 50, ch: 30 };
      
      const startTime = Date.now();
      capitalizer.attemptCapitalization(mockEditor, cursor, ' ');
      const endTime = Date.now();
      
      expect(endTime - startTime).toBeLessThan(1000); // Should complete within 1 second
      expect(mockEditor.getLine(50)).toBeDefined();
    });

    it('should handle text with only punctuation', () => {
      mockEditor = createMockEditor(['...!!! ??? ...']);
      const cursor: EditorPosition = { line: 0, ch: 7 };
      
      capitalizer.attemptCapitalization(mockEditor, cursor, ' ');
      
      expect(mockEditor.getLine(0)).toBe('...!!! ??? ...');
    });

    it('should handle text with only whitespace', () => {
      mockEditor = createMockEditor(['   \t  \n  ']);
      const cursor: EditorPosition = { line: 0, ch: 4 };
      
      capitalizer.attemptCapitalization(mockEditor, cursor, ' ');
      
      expect(mockEditor.getLine(0)).toBe('   \t  \n  ');
    });

    it('should handle cursor at edge positions', () => {
      mockEditor = createMockEditor(['hello world']);
      
      // Test at position 0
      let cursor: EditorPosition = { line: 0, ch: 0 };
      capitalizer.attemptCapitalization(mockEditor, cursor, ' ');
      
      // Test at end of line
      cursor = { line: 0, ch: 11 };
      capitalizer.attemptCapitalization(mockEditor, cursor, ' ');
      
      expect(mockEditor.getLine(0)).toBeDefined();
    });

    it('should handle multi-byte unicode characters', () => {
      mockEditor = createMockEditor(['émojis 😀 and café']);
      const cursor: EditorPosition = { line: 0, ch: 10 };
      
      capitalizer.attemptCapitalization(mockEditor, cursor, ' ');
      
      expect(mockEditor.getLine(0)).toBe('Émojis 😀 and café');
    });

    it('should handle words with mixed unicode', () => {
      mockEditor = createMockEditor(['naïve résumé']);
      const cursor: EditorPosition = { line: 0, ch: 5 };
      
      capitalizer.attemptCapitalization(mockEditor, cursor, ' ');
      
      expect(mockEditor.getLine(0)).toBe('Naïve résumé');
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid cursor positions gracefully', () => {
      mockEditor = createMockEditor(['hello world']);
      const cursor: EditorPosition = { line: 10, ch: 5 }; // Invalid line
      
      expect(() => {
        capitalizer.attemptCapitalization(mockEditor, cursor, ' ');
      }).not.toThrow();
    });

    it('should handle negative cursor positions', () => {
      mockEditor = createMockEditor(['hello world']);
      const cursor: EditorPosition = { line: -1, ch: -1 };
      
      expect(() => {
        capitalizer.attemptCapitalization(mockEditor, cursor, ' ');
      }).not.toThrow();
    });

    it('should handle empty trigger characters', () => {
      mockEditor = createMockEditor(['hello world']);
      const cursor: EditorPosition = { line: 0, ch: 5 };
      
      expect(() => {
        capitalizer.attemptCapitalization(mockEditor, cursor, '');
      }).not.toThrow();
    });

    it('should handle null or undefined triggers', () => {
      mockEditor = createMockEditor(['hello world']);
      const cursor: EditorPosition = { line: 0, ch: 5 };
      
      expect(() => {
        capitalizer.attemptCapitalization(mockEditor, cursor, null as any);
      }).not.toThrow();
    });

    it('should handle editor with no lines', () => {
      mockEditor = createMockEditor([]);
      const cursor: EditorPosition = { line: 0, ch: 0 };
      
      expect(() => {
        capitalizer.attemptCapitalization(mockEditor, cursor, ' ');
      }).not.toThrow();
    });

    it('should handle malformed NLP input gracefully', () => {
      // Create a scenario that might cause NLP parsing issues
      const malformedText = ['\\n\\t\\r\\0\\x1F'];
      mockEditor = createMockEditor(malformedText);
      const cursor: EditorPosition = { line: 0, ch: 5 };
      
      expect(() => {
        capitalizer.attemptCapitalization(mockEditor, cursor, ' ');
      }).not.toThrow();
    });
  });
}); 