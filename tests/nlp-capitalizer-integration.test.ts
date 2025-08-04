/**
 * Integration tests for the new NLP Capitalizer implementation
 * Tests real-world scenarios with URLs, emails, markdown, etc.
 */

import NLPCapitalizer, { CapitalizationConfig } from '../src/nlp_capitalizer';
import { Editor, EditorPosition } from 'obsidian';

// Mock Editor interface for testing
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
    }
  } as unknown as Editor;
};

describe('NLPCapitalizer Integration Tests', () => {
  let capitalizer: NLPCapitalizer;
  let mockEditor: Editor;

  beforeEach(() => {
    capitalizer = new NLPCapitalizer({
      enabled: true,
      capitalizeLines: true,
      capitalizeSentences: true,
      preserveMixedCase: true,
      respectSpecialContexts: true,
      debug: false
    });
  });

  describe('URL Handling', () => {
    it('should not capitalize within HTTP URLs', () => {
      mockEditor = createMockEditor(['visit https://example.com for info']);
      const cursor: EditorPosition = { line: 0, ch: 15 }; // within URL
      
      capitalizer.attemptCapitalization(mockEditor, cursor, ' ');
      
      expect(mockEditor.getLine(0)).toBe('visit https://example.com for info');
    });

    it('should not capitalize within HTTPS URLs', () => {
      mockEditor = createMockEditor(['check https://secure.example.com/path']);
      const cursor: EditorPosition = { line: 0, ch: 20 }; // within URL
      
      capitalizer.attemptCapitalization(mockEditor, cursor, ' ');
      
      expect(mockEditor.getLine(0)).toBe('check https://secure.example.com/path');
    });

    it('should not capitalize within www URLs', () => {
      mockEditor = createMockEditor(['visit www.example.com today']);
      const cursor: EditorPosition = { line: 0, ch: 10 }; // within URL
      
      capitalizer.attemptCapitalization(mockEditor, cursor, ' ');
      
      expect(mockEditor.getLine(0)).toBe('visit www.example.com today');
    });

    it('should capitalize text outside URLs', () => {
      mockEditor = createMockEditor(['visit https://example.com. now go there']);
      const cursor: EditorPosition = { line: 0, ch: 35 }; // after URL and period
      
      capitalizer.attemptCapitalization(mockEditor, cursor, ' ');
      
      expect(mockEditor.getLine(0)).toBe('Visit https://example.com. Now go there');
    });
  });

  describe('Email Handling', () => {
    it('should not capitalize within standard emails', () => {
      mockEditor = createMockEditor(['contact user@example.com for help']);
      const cursor: EditorPosition = { line: 0, ch: 15 }; // within email
      
      capitalizer.attemptCapitalization(mockEditor, cursor, ' ');
      
      expect(mockEditor.getLine(0)).toBe('contact user@example.com for help');
    });

    it('should not capitalize within complex emails', () => {
      mockEditor = createMockEditor(['email user.name+tag@sub.domain.co.uk works']);
      const cursor: EditorPosition = { line: 0, ch: 20 }; // within email
      
      capitalizer.attemptCapitalization(mockEditor, cursor, ' ');
      
      expect(mockEditor.getLine(0)).toBe('email user.name+tag@sub.domain.co.uk works');
    });

    it('should capitalize text outside emails', () => {
      mockEditor = createMockEditor(['email user@example.com. he will respond']);
      const cursor: EditorPosition = { line: 0, ch: 35 }; // after email and period
      
      capitalizer.attemptCapitalization(mockEditor, cursor, ' ');
      
      expect(mockEditor.getLine(0)).toBe('Email user@example.com. He will respond');
    });
  });

  describe('Ellipses Handling', () => {
    it('should not capitalize immediately after three dots', () => {
      mockEditor = createMockEditor(['First sentence... maybe not']);
      const cursor: EditorPosition = { line: 0, ch: 20 }; // right after ellipses, before "maybe"
      
      capitalizer.attemptCapitalization(mockEditor, cursor, ' ');
      
      // Should capitalize line start but not after ellipses
      expect(mockEditor.getLine(0)).toBe('First sentence... maybe not');
    });

    it('should not capitalize immediately after Unicode ellipsis', () => {
      mockEditor = createMockEditor(['First sentence… maybe not']);
      const cursor: EditorPosition = { line: 0, ch: 18 }; // right after ellipsis, before "maybe"
      
      capitalizer.attemptCapitalization(mockEditor, cursor, ' ');
      
      // Should capitalize line start but not after ellipsis
      expect(mockEditor.getLine(0)).toBe('First sentence… maybe not');
    });

    it('should capitalize at line start even with ellipses present', () => {
      // Test line capitalization with ellipses present - this should work
      mockEditor = createMockEditor(['thinking... maybe not']);
      const cursor: EditorPosition = { line: 0, ch: 8 }; // after "thinking"
      
      capitalizer.attemptCapitalization(mockEditor, cursor, ' ');
      
      // Should capitalize line start even with ellipses
      expect(mockEditor.getLine(0)).toBe('Thinking... maybe not');
    });

    it('should treat ellipses as continuation, not sentence boundary', () => {
      mockEditor = createMockEditor(['First part... second part. Third sentence.']);
      const cursor: EditorPosition = { line: 0, ch: 40 }; // near end
      
      capitalizer.attemptCapitalization(mockEditor, cursor, ' ');
      
      // Should capitalize line start and after the period, but not after ellipses
      expect(mockEditor.getLine(0)).toBe('First part... second part. Third sentence.');
    });
  });

  describe('Markdown Context Handling', () => {
    it('should not capitalize within inline code', () => {
      mockEditor = createMockEditor(['use `console.log()` to debug']);
      const cursor: EditorPosition = { line: 0, ch: 10 }; // within code
      
      capitalizer.attemptCapitalization(mockEditor, cursor, ' ');
      
      expect(mockEditor.getLine(0)).toBe('use `console.log()` to debug');
    });

    it('should not capitalize within markdown links', () => {
      mockEditor = createMockEditor(['check [this link](https://example.com) out']);
      const cursor: EditorPosition = { line: 0, ch: 15 }; // within link
      
      capitalizer.attemptCapitalization(mockEditor, cursor, ' ');
      
      expect(mockEditor.getLine(0)).toBe('check [this link](https://example.com) out');
    });

    it('should not capitalize within wiki links', () => {
      mockEditor = createMockEditor(['see [[another page]] for details']);
      const cursor: EditorPosition = { line: 0, ch: 10 }; // within wiki link
      
      capitalizer.attemptCapitalization(mockEditor, cursor, ' ');
      
      expect(mockEditor.getLine(0)).toBe('see [[another page]] for details');
    });

    it('should capitalize after markdown headers', () => {
      mockEditor = createMockEditor(['# this is a header']);
      const cursor: EditorPosition = { line: 0, ch: 10 }; // after header prefix
      
      capitalizer.attemptCapitalization(mockEditor, cursor, ' ');
      
      expect(mockEditor.getLine(0)).toBe('# This is a header');
    });

    it('should capitalize after list items', () => {
      mockEditor = createMockEditor(['- this is a list item']);
      const cursor: EditorPosition = { line: 0, ch: 8 }; // after list prefix
      
      capitalizer.attemptCapitalization(mockEditor, cursor, ' ');
      
      expect(mockEditor.getLine(0)).toBe('- This is a list item');
    });

    it('should capitalize after blockquotes', () => {
      mockEditor = createMockEditor(['> this is a quote']);
      const cursor: EditorPosition = { line: 0, ch: 8 }; // after quote prefix
      
      capitalizer.attemptCapitalization(mockEditor, cursor, ' ');
      
      expect(mockEditor.getLine(0)).toBe('> This is a quote');
    });
  });

  describe('Mixed Case Preservation', () => {
    it('should preserve mixed case words like iPhone', () => {
      mockEditor = createMockEditor(['i love my iPhone device']);
      const cursor: EditorPosition = { line: 0, ch: 15 }; // after iPhone
      
      capitalizer.attemptCapitalization(mockEditor, cursor, ' ');
      
      expect(mockEditor.getLine(0)).toBe('I love my iPhone device');
    });

    it('should preserve mixed case words like JavaScript', () => {
      mockEditor = createMockEditor(['learning JavaScript is fun']);
      const cursor: EditorPosition = { line: 0, ch: 20 }; // after JavaScript
      
      capitalizer.attemptCapitalization(mockEditor, cursor, ' ');
      
      expect(mockEditor.getLine(0)).toBe('Learning JavaScript is fun');
    });

    it('should allow disabling mixed case preservation', () => {
      capitalizer.updateConfig({ preserveMixedCase: false });
      mockEditor = createMockEditor(['iphone is great']);
      const cursor: EditorPosition = { line: 0, ch: 10 }; // after iphone
      
      capitalizer.attemptCapitalization(mockEditor, cursor, ' ');
      
      expect(mockEditor.getLine(0)).toBe('Iphone is great');
    });
  });

  describe('Sentence Boundaries', () => {
    it('should capitalize after periods with proper spacing', () => {
      mockEditor = createMockEditor(['first sentence. second sentence here']);
      const cursor: EditorPosition = { line: 0, ch: 25 }; // after "second"
      
      capitalizer.attemptCapitalization(mockEditor, cursor, ' ');
      
      expect(mockEditor.getLine(0)).toBe('First sentence. Second sentence here');
    });

    it('should capitalize after exclamation marks', () => {
      mockEditor = createMockEditor(['wow! that is amazing']);
      const cursor: EditorPosition = { line: 0, ch: 15 }; // after "that"
      
      capitalizer.attemptCapitalization(mockEditor, cursor, ' ');
      
      expect(mockEditor.getLine(0)).toBe('Wow! That is amazing');
    });

    it('should capitalize after question marks', () => {
      mockEditor = createMockEditor(['really? i think so']);
      const cursor: EditorPosition = { line: 0, ch: 15 }; // after "i"
      
      capitalizer.attemptCapitalization(mockEditor, cursor, ' ');
      
      expect(mockEditor.getLine(0)).toBe('Really? I think so');
    });

    it('should not capitalize after abbreviations', () => {
      mockEditor = createMockEditor(['contact Dr. Smith for help']);
      const cursor: EditorPosition = { line: 0, ch: 20 }; // after "Smith"
      
      capitalizer.attemptCapitalization(mockEditor, cursor, ' ');
      
      expect(mockEditor.getLine(0)).toBe('Contact Dr. Smith for help');
    });
  });

  describe('Complex Real-World Scenarios', () => {
    it('should handle mixed content correctly', () => {
      const content = 'email me at user@example.com. Visit https://test.com for details... maybe later.';
      mockEditor = createMockEditor([content]);
      const cursor: EditorPosition = { line: 0, ch: content.length };
      
      capitalizer.attemptCapitalization(mockEditor, cursor, ' ');
      
      const expected = 'Email me at user@example.com. Visit https://test.com for details... maybe later.';
      expect(mockEditor.getLine(0)).toBe(expected);
    });

    it('should handle markdown with special content', () => {
      const content = '# my iPhone Setup\n\n- visit https://apple.com\n- email support@apple.com\n- use `git clone` command';
      const lines = content.split('\n');
      mockEditor = createMockEditor(lines);
      
      // Simulate typing through the content
      for (let line = 0; line < lines.length; line++) {
        const lineLength = mockEditor.getLine(line).length;
        const cursor: EditorPosition = { line, ch: lineLength };
        capitalizer.attemptCapitalization(mockEditor, cursor, ' ');
      }
      
      const result = mockEditor.getValue();
      expect(result).toContain('# My iPhone Setup');
      expect(result).toContain('- Visit https://apple.com');
      expect(result).toContain('- Email support@apple.com');
      expect(result).toContain('- Use `git clone` command');
    });

    it('should respect special contexts when enabled', () => {
      mockEditor = createMockEditor(['visit www.example.com/path']);
      const cursor: EditorPosition = { line: 0, ch: 15 }; // within URL
      
      capitalizer.attemptCapitalization(mockEditor, cursor, ' ');
      
      expect(mockEditor.getLine(0)).toBe('visit www.example.com/path');
    });

    it('should ignore special contexts when disabled', () => {
      capitalizer.updateConfig({ respectSpecialContexts: false });
      mockEditor = createMockEditor(['visit www.example.com/path']);
      const cursor: EditorPosition = { line: 0, ch: 20 }; // after content
      
      capitalizer.attemptCapitalization(mockEditor, cursor, ' ');
      
      expect(mockEditor.getLine(0)).toBe('Visit www.example.com/path');
    });
  });

  describe('Performance and Caching', () => {
    it('should handle rapid successive calls efficiently', () => {
      mockEditor = createMockEditor(['this is a test sentence']);
      const startTime = Date.now();
      
      // Simulate rapid typing
      for (let i = 0; i < 10; i++) {
        const cursor: EditorPosition = { line: 0, ch: 10 + i };
        capitalizer.attemptCapitalization(mockEditor, cursor, ' ');
      }
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      // Should complete rapidly (under 100ms for 10 calls)
      expect(duration).toBeLessThan(100);
      expect(mockEditor.getLine(0)).toBe('This is a test sentence');
    });
  });

  describe('Configuration Options', () => {
    it('should respect enabled/disabled state', () => {
      capitalizer.updateConfig({ enabled: false });
      mockEditor = createMockEditor(['this should not capitalize']);
      const cursor: EditorPosition = { line: 0, ch: 20 };
      
      capitalizer.attemptCapitalization(mockEditor, cursor, ' ');
      
      expect(mockEditor.getLine(0)).toBe('this should not capitalize');
    });

    it('should allow disabling line capitalization', () => {
      capitalizer.updateConfig({ capitalizeLines: false });
      mockEditor = createMockEditor(['this should not capitalize']);
      const cursor: EditorPosition = { line: 0, ch: 10 };
      
      capitalizer.attemptCapitalization(mockEditor, cursor, ' ');
      
      expect(mockEditor.getLine(0)).toBe('this should not capitalize');
    });

    it('should allow disabling sentence capitalization', () => {
      capitalizer.updateConfig({ capitalizeSentences: false });
      mockEditor = createMockEditor(['first sentence. second sentence']);
      const cursor: EditorPosition = { line: 0, ch: 25 };
      
      capitalizer.attemptCapitalization(mockEditor, cursor, ' ');
      
      expect(mockEditor.getLine(0)).toBe('First sentence. second sentence');
    });
  });
});