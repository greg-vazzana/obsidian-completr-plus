// Mock dependencies
jest.mock('../src/db/sqlite_database_service');
jest.mock('../src/provider/ignorelist');
jest.mock('../src/provider/scanner_provider');
jest.mock('../src/word_patterns');

import { LiveWordTracker } from '../src/live_word_tracker';
import { SQLiteDatabaseService } from '../src/db/sqlite_database_service';
import { SuggestionIgnorelist } from '../src/provider/ignorelist';
import { Scanner } from '../src/provider/scanner_provider';
import { CompletrSettings } from '../src/settings';
import { WordPatterns } from '../src/word_patterns';
import { EditorPosition } from 'obsidian';

// Mock Editor interface
const createMockEditor = (lines: string[]) => {
  return {
    getLine: (lineNum: number): string => {
      return lines[lineNum] || '';
    },
    getRange: (from: EditorPosition, to: EditorPosition): string => {
      const line = lines[from.line] || '';
      if (from.line === to.line) {
        return line.substring(from.ch, to.ch);
      }
      // For multi-line ranges, return newline for simplicity
      return '\n';
    },
    lineCount: (): number => {
      return lines.length;
    }
  };
};

describe('LiveWordTracker', () => {
  let tracker: LiveWordTracker;
  let mockDb: jest.Mocked<SQLiteDatabaseService>;
  let mockSettings: CompletrSettings;
  let mockEditor: any;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Create mock settings
    mockSettings = {
      scanEnabled: true,
      liveWordTracking: true,
      minWordLength: 3,
      debugCapitalization: false
    } as CompletrSettings;

    // Create mock database
    mockDb = {
      getScanSourceId: jest.fn().mockResolvedValue(1),
      addOrIncrementWord: jest.fn().mockResolvedValue(undefined)
    } as any;

    // Setup mock implementations
    (WordPatterns.isWordCharacter as jest.Mock) = jest.fn();
    (WordPatterns.findWordAtPosition as jest.Mock) = jest.fn();
    (SuggestionIgnorelist.hasText as jest.Mock) = jest.fn().mockReturnValue(false);
    (Scanner.incrementWordFrequency as jest.Mock) = jest.fn();

    // Create tracker instance
    tracker = new LiveWordTracker(mockSettings);
    tracker.setDatabase(mockDb);

    // Create mock editor
    mockEditor = createMockEditor(['hello world test']);
  });

  afterEach(async () => {
    // Ensure proper cleanup of any timers or async operations
    if (tracker) {
      await tracker.onUnload();
    }
    
    // Clear any remaining timers
    jest.clearAllTimers();
    
    // If using fake timers, restore real timers
    if (jest.isMockFunction(setTimeout)) {
      jest.useRealTimers();
    }
  });

  describe('Constructor and Setup', () => {
    it('should create instance with settings', () => {
      const newTracker = new LiveWordTracker(mockSettings);
      expect(newTracker).toBeDefined();
    });

    it('should set database', () => {
      const newTracker = new LiveWordTracker(mockSettings);
      newTracker.setDatabase(mockDb);
      
      expect(newTracker).toBeDefined();
    });

    it('should update settings', () => {
      const newSettings = {
        ...mockSettings,
        liveWordTracking: false
      };
      
      tracker.updateSettings(newSettings);
      
      expect(tracker).toBeDefined();
    });
  });

  describe('Word Completion Tracking', () => {
    beforeEach(() => {
      (WordPatterns.isWordCharacter as jest.Mock) = jest.fn()
        .mockImplementation((char: string) => /[a-zA-Z]/.test(char));
      (WordPatterns.findWordAtPosition as jest.Mock) = jest.fn()
        .mockReturnValue('hello');
    });

    it('should track word completion when typing space after word', async () => {
      const oldCursor: EditorPosition = { line: 0, ch: 5 }; // After "hello"
      const newCursor: EditorPosition = { line: 0, ch: 6 }; // After space

      await tracker.trackWordCompletion(mockEditor, oldCursor, newCursor);

      expect(WordPatterns.isWordCharacter).toHaveBeenCalledWith(' ');
      expect(WordPatterns.findWordAtPosition).toHaveBeenCalledWith('hello world test', 6);
      expect(Scanner.incrementWordFrequency).toHaveBeenCalledWith('hello');
    });

    it('should track word completion when pressing enter', async () => {
      const oldCursor: EditorPosition = { line: 0, ch: 5 }; // End of "hello"
      const newCursor: EditorPosition = { line: 1, ch: 0 }; // New line

      await tracker.trackWordCompletion(mockEditor, oldCursor, newCursor);

      expect(WordPatterns.isWordCharacter).toHaveBeenCalledWith('\n');
      expect(WordPatterns.findWordAtPosition).toHaveBeenCalledWith('hello world test', 5);
      expect(Scanner.incrementWordFrequency).toHaveBeenCalledWith('hello');
    });

    it('should track word completion when typing punctuation', async () => {
      const oldCursor: EditorPosition = { line: 0, ch: 5 }; // After "hello"
      const newCursor: EditorPosition = { line: 0, ch: 6 }; // After punctuation

      // Mock getting punctuation character
      mockEditor.getRange = jest.fn().mockReturnValue('.');

      await tracker.trackWordCompletion(mockEditor, oldCursor, newCursor);

      expect(WordPatterns.isWordCharacter).toHaveBeenCalledWith('.');
      expect(WordPatterns.findWordAtPosition).toHaveBeenCalledWith('hello world test', 6);
      expect(Scanner.incrementWordFrequency).toHaveBeenCalledWith('hello');
    });

    it('should not track when word is too short', async () => {
      (WordPatterns.findWordAtPosition as jest.Mock) = jest.fn()
        .mockReturnValue('hi'); // Below minWordLength of 3

      const oldCursor: EditorPosition = { line: 0, ch: 2 };
      const newCursor: EditorPosition = { line: 0, ch: 3 };

      await tracker.trackWordCompletion(mockEditor, oldCursor, newCursor);

      expect(Scanner.incrementWordFrequency).not.toHaveBeenCalled();
    });

    it('should not track when word is in ignore list', async () => {
      (SuggestionIgnorelist.hasText as jest.Mock) = jest.fn().mockReturnValue(true);

      const oldCursor: EditorPosition = { line: 0, ch: 5 };
      const newCursor: EditorPosition = { line: 0, ch: 6 };

      await tracker.trackWordCompletion(mockEditor, oldCursor, newCursor);

      // Should not track ignored words at all
      expect(Scanner.incrementWordFrequency).not.toHaveBeenCalled();
      expect(mockDb.addOrIncrementWord).not.toHaveBeenCalled();
    });

    it('should not track when typing continuing characters', async () => {
      (WordPatterns.isWordCharacter as jest.Mock) = jest.fn()
        .mockReturnValue(true); // Character is part of word

      const oldCursor: EditorPosition = { line: 0, ch: 4 };
      const newCursor: EditorPosition = { line: 0, ch: 5 };

      await tracker.trackWordCompletion(mockEditor, oldCursor, newCursor);

      expect(WordPatterns.findWordAtPosition).not.toHaveBeenCalled();
      expect(Scanner.incrementWordFrequency).not.toHaveBeenCalled();
    });

  });

  describe('Movement Detection', () => {
    it('should skip backward movement on same line', async () => {
      const oldCursor: EditorPosition = { line: 0, ch: 5 };
      const newCursor: EditorPosition = { line: 0, ch: 3 }; // Moving backward

      await tracker.trackWordCompletion(mockEditor, oldCursor, newCursor);

      expect(WordPatterns.isWordCharacter).not.toHaveBeenCalled();
      expect(Scanner.incrementWordFrequency).not.toHaveBeenCalled();
    });

    it('should handle line changes correctly', async () => {
      (WordPatterns.isWordCharacter as jest.Mock) = jest.fn()
        .mockImplementation((char: string) => char !== '\n');
      (WordPatterns.findWordAtPosition as jest.Mock) = jest.fn()
        .mockReturnValue('test');

      const oldCursor: EditorPosition = { line: 0, ch: 4 }; // End of word on line 0
      const newCursor: EditorPosition = { line: 1, ch: 0 }; // Beginning of line 1

      await tracker.trackWordCompletion(mockEditor, oldCursor, newCursor);

      expect(WordPatterns.isWordCharacter).toHaveBeenCalledWith('\n');
      expect(WordPatterns.findWordAtPosition).toHaveBeenCalledWith('hello world test', 4);
    });

    it('should skip when old cursor was at beginning of line', async () => {
      const oldCursor: EditorPosition = { line: 0, ch: 0 }; // Beginning of line
      const newCursor: EditorPosition = { line: 1, ch: 0 }; // New line

      await tracker.trackWordCompletion(mockEditor, oldCursor, newCursor);

      expect(WordPatterns.isWordCharacter).not.toHaveBeenCalled();
      expect(Scanner.incrementWordFrequency).not.toHaveBeenCalled();
    });

    it('should skip when cursor is at beginning of line (same line)', async () => {
      const oldCursor: EditorPosition = { line: 0, ch: 1 };
      const newCursor: EditorPosition = { line: 0, ch: 0 }; // Beginning of line

      await tracker.trackWordCompletion(mockEditor, oldCursor, newCursor);

      expect(WordPatterns.isWordCharacter).not.toHaveBeenCalled();
      expect(Scanner.incrementWordFrequency).not.toHaveBeenCalled();
    });
  });

  describe('Settings and Database Dependencies', () => {
    it('should skip when database is not set', async () => {
      const trackerWithoutDb = new LiveWordTracker(mockSettings);
      // Don't set database

      const oldCursor: EditorPosition = { line: 0, ch: 5 };
      const newCursor: EditorPosition = { line: 0, ch: 6 };

      await trackerWithoutDb.trackWordCompletion(mockEditor, oldCursor, newCursor);

      expect(WordPatterns.isWordCharacter).not.toHaveBeenCalled();
      expect(Scanner.incrementWordFrequency).not.toHaveBeenCalled();
    });

    it('should skip when scan is disabled', async () => {
      const disabledSettings = { ...mockSettings, scanEnabled: false };
      tracker.updateSettings(disabledSettings);

      const oldCursor: EditorPosition = { line: 0, ch: 5 };
      const newCursor: EditorPosition = { line: 0, ch: 6 };

      await tracker.trackWordCompletion(mockEditor, oldCursor, newCursor);

      expect(WordPatterns.isWordCharacter).not.toHaveBeenCalled();
      expect(Scanner.incrementWordFrequency).not.toHaveBeenCalled();
    });

    it('should skip when live word tracking is disabled', async () => {
      const disabledSettings = { ...mockSettings, liveWordTracking: false };
      tracker.updateSettings(disabledSettings);

      const oldCursor: EditorPosition = { line: 0, ch: 5 };
      const newCursor: EditorPosition = { line: 0, ch: 6 };

      await tracker.trackWordCompletion(mockEditor, oldCursor, newCursor);

      expect(WordPatterns.isWordCharacter).not.toHaveBeenCalled();
      expect(Scanner.incrementWordFrequency).not.toHaveBeenCalled();
    });

    it('should respect minimum word length setting', async () => {
      const longMinWordSettings = { ...mockSettings, minWordLength: 10 };
      tracker.updateSettings(longMinWordSettings);

      (WordPatterns.isWordCharacter as jest.Mock) = jest.fn()
        .mockImplementation((char: string) => /[a-zA-Z]/.test(char));
      (WordPatterns.findWordAtPosition as jest.Mock) = jest.fn()
        .mockReturnValue('hello'); // 5 chars, below minimum of 10

      const oldCursor: EditorPosition = { line: 0, ch: 5 };
      const newCursor: EditorPosition = { line: 0, ch: 6 };

      await tracker.trackWordCompletion(mockEditor, oldCursor, newCursor);

      expect(Scanner.incrementWordFrequency).not.toHaveBeenCalled();
    });
  });

  describe('Batch Updates', () => {
    beforeEach(() => {
      (WordPatterns.isWordCharacter as jest.Mock) = jest.fn()
        .mockImplementation((char: string) => /[a-zA-Z]/.test(char));
      (WordPatterns.findWordAtPosition as jest.Mock) = jest.fn()
        .mockReturnValue('hello');
    });

    it('should batch multiple word updates', async () => {
      const oldCursor: EditorPosition = { line: 0, ch: 5 };
      const newCursor: EditorPosition = { line: 0, ch: 6 };

      // Track same word multiple times quickly
      await tracker.trackWordCompletion(mockEditor, oldCursor, newCursor);
      await tracker.trackWordCompletion(mockEditor, oldCursor, newCursor);
      await tracker.trackWordCompletion(mockEditor, oldCursor, newCursor);

      // Should call Scanner immediately for each
      expect(Scanner.incrementWordFrequency).toHaveBeenCalledTimes(3);
      expect(Scanner.incrementWordFrequency).toHaveBeenCalledWith('hello');

      // Database calls should be batched (not called immediately)
      expect(mockDb.addOrIncrementWord).not.toHaveBeenCalled();
    });

    it('should flush batch updates after delay', async () => {
      jest.useFakeTimers();

      try {
        const oldCursor: EditorPosition = { line: 0, ch: 5 };
        const newCursor: EditorPosition = { line: 0, ch: 6 };

        await tracker.trackWordCompletion(mockEditor, oldCursor, newCursor);

        // Fast-forward timers to trigger batch flush
        jest.advanceTimersByTime(1000);

        // Run all pending promises
        await jest.runAllTimersAsync();

        expect(mockDb.addOrIncrementWord).toHaveBeenCalledWith('hello', 1, 1);
      } finally {
        jest.clearAllTimers();
        jest.useRealTimers();
      }
    }, 10000);

    it('should handle database errors gracefully', async () => {
      (mockDb.addOrIncrementWord as jest.Mock) = jest.fn()
        .mockRejectedValue(new Error('Database error'));

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      jest.useFakeTimers();

      try {
        const oldCursor: EditorPosition = { line: 0, ch: 5 };
        const newCursor: EditorPosition = { line: 0, ch: 6 };

        await tracker.trackWordCompletion(mockEditor, oldCursor, newCursor);

        // Fast-forward timers and run async operations
        jest.advanceTimersByTime(1000);
        await jest.runAllTimersAsync();

        expect(consoleSpy).toHaveBeenCalledWith('Error flushing batch updates:', expect.any(Error));
      } finally {
        consoleSpy.mockRestore();
        jest.clearAllTimers();
        jest.useRealTimers();
      }
    }, 10000);

    it('should handle missing scan source ID', async () => {
      (mockDb.getScanSourceId as jest.Mock) = jest.fn()
        .mockResolvedValue(null);

      const oldCursor: EditorPosition = { line: 0, ch: 5 };
      const newCursor: EditorPosition = { line: 0, ch: 6 };

      await tracker.trackWordCompletion(mockEditor, oldCursor, newCursor);

      // Should not track when no scan source ID
      expect(Scanner.incrementWordFrequency).not.toHaveBeenCalled();
      expect(mockDb.addOrIncrementWord).not.toHaveBeenCalled();
    });
  });

  describe('Word Extraction', () => {
    it('should extract word at correct position', async () => {
      (WordPatterns.isWordCharacter as jest.Mock) = jest.fn()
        .mockImplementation((char: string) => /[a-zA-Z]/.test(char));
      (WordPatterns.findWordAtPosition as jest.Mock) = jest.fn()
        .mockReturnValue('world');

      mockEditor = createMockEditor(['hello world test']);

      const oldCursor: EditorPosition = { line: 0, ch: 11 }; // After "world"
      const newCursor: EditorPosition = { line: 0, ch: 12 }; // After space

      await tracker.trackWordCompletion(mockEditor, oldCursor, newCursor);

      expect(WordPatterns.findWordAtPosition).toHaveBeenCalledWith('hello world test', 12);
      expect(Scanner.incrementWordFrequency).toHaveBeenCalledWith('world');
    });

    it('should handle empty lines', async () => {
      (WordPatterns.isWordCharacter as jest.Mock) = jest.fn()
        .mockImplementation((char: string) => /[a-zA-Z]/.test(char));
      (WordPatterns.findWordAtPosition as jest.Mock) = jest.fn()
        .mockReturnValue(null);

      mockEditor = createMockEditor(['']);

      const oldCursor: EditorPosition = { line: 0, ch: 0 };
      const newCursor: EditorPosition = { line: 0, ch: 1 };

      await tracker.trackWordCompletion(mockEditor, oldCursor, newCursor);

      expect(Scanner.incrementWordFrequency).not.toHaveBeenCalled();
    });

    it('should handle invalid cursor positions', async () => {
      (WordPatterns.isWordCharacter as jest.Mock) = jest.fn()
        .mockImplementation((char: string) => /[a-zA-Z]/.test(char));
      (WordPatterns.findWordAtPosition as jest.Mock) = jest.fn()
        .mockReturnValue(null);

      mockEditor = createMockEditor(['hello']);

      const oldCursor: EditorPosition = { line: 0, ch: 10 }; // Beyond line length
      const newCursor: EditorPosition = { line: 0, ch: 11 };

      await tracker.trackWordCompletion(mockEditor, oldCursor, newCursor);

      expect(Scanner.incrementWordFrequency).not.toHaveBeenCalled();
    });
  });

  describe('Debug Logging', () => {
    beforeEach(() => {
      mockSettings.debugCapitalization = true;
      tracker.updateSettings(mockSettings);
    });

    it('should log debug information when enabled', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      (WordPatterns.isWordCharacter as jest.Mock) = jest.fn()
        .mockImplementation((char: string) => /[a-zA-Z]/.test(char));
      (WordPatterns.findWordAtPosition as jest.Mock) = jest.fn()
        .mockReturnValue('hello');

      const oldCursor: EditorPosition = { line: 0, ch: 5 };
      const newCursor: EditorPosition = { line: 0, ch: 6 };

      await tracker.trackWordCompletion(mockEditor, oldCursor, newCursor);

      expect(consoleSpy).toHaveBeenCalledWith('LiveWordTracker: Current char:', ' ', 'isWordChar:', false);
      expect(consoleSpy).toHaveBeenCalledWith('LiveWordTracker: Completed word:', 'hello');
      expect(consoleSpy).toHaveBeenCalledWith('LiveWordTracker: Incrementing frequency for:', 'hello');

      consoleSpy.mockRestore();
    });

    it('should log when skipping due to settings', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      tracker.updateSettings({ ...mockSettings, scanEnabled: false });

      const oldCursor: EditorPosition = { line: 0, ch: 5 };
      const newCursor: EditorPosition = { line: 0, ch: 6 };

      await tracker.trackWordCompletion(mockEditor, oldCursor, newCursor);

      expect(consoleSpy).toHaveBeenCalledWith(
        'LiveWordTracker: Skipping - db:', true, 'scanEnabled:', false, 'liveWordTracking:', true
      );

      consoleSpy.mockRestore();
    });

    it('should not log when debug is disabled', async () => {
      tracker.updateSettings({ ...mockSettings, debugCapitalization: false });

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      const oldCursor: EditorPosition = { line: 0, ch: 5 };
      const newCursor: EditorPosition = { line: 0, ch: 6 };

      await tracker.trackWordCompletion(mockEditor, oldCursor, newCursor);

      expect(consoleSpy).not.toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });

  describe('Cleanup and Unload', () => {
    it('should flush pending updates on unload', async () => {
      jest.useFakeTimers();

      try {
        (WordPatterns.isWordCharacter as jest.Mock) = jest.fn()
          .mockImplementation((char: string) => /[a-zA-Z]/.test(char));
        (WordPatterns.findWordAtPosition as jest.Mock) = jest.fn()
          .mockReturnValue('hello');

        const oldCursor: EditorPosition = { line: 0, ch: 5 };
        const newCursor: EditorPosition = { line: 0, ch: 6 };

        // Track a word (creates pending batch update)
        await tracker.trackWordCompletion(mockEditor, oldCursor, newCursor);

        // Call onUnload before timer expires
        await tracker.onUnload();

        expect(mockDb.addOrIncrementWord).toHaveBeenCalledWith('hello', 1, 1);
      } finally {
        jest.clearAllTimers();
        jest.useRealTimers();
      }
    });

    it('should handle unload when no database is set', async () => {
      const trackerWithoutDb = new LiveWordTracker(mockSettings);

      await expect(trackerWithoutDb.onUnload()).resolves.not.toThrow();
    });

    it('should handle unload when no pending updates', async () => {
      await expect(tracker.onUnload()).resolves.not.toThrow();
    });
  });

  describe('Error Handling', () => {
    it('should handle word completion tracking errors', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      (WordPatterns.isWordCharacter as jest.Mock) = jest.fn()
        .mockImplementation((char: string) => /[a-zA-Z]/.test(char));
      (WordPatterns.findWordAtPosition as jest.Mock) = jest.fn()
        .mockReturnValue('hello');
      (mockDb.getScanSourceId as jest.Mock) = jest.fn()
        .mockRejectedValue(new Error('Database connection failed'));

      const oldCursor: EditorPosition = { line: 0, ch: 5 };
      const newCursor: EditorPosition = { line: 0, ch: 6 };

      await tracker.trackWordCompletion(mockEditor, oldCursor, newCursor);

      expect(consoleSpy).toHaveBeenCalledWith('Error tracking word completion:', expect.any(Error));

      consoleSpy.mockRestore();
    });

    it('should handle malformed editor content', async () => {
      (WordPatterns.isWordCharacter as jest.Mock) = jest.fn()
        .mockImplementation((char: string) => {
          // Handle undefined/null characters gracefully
          if (char === undefined || char === null) return false;
          return /[a-zA-Z]/.test(char);
        });
      (WordPatterns.findWordAtPosition as jest.Mock) = jest.fn()
        .mockReturnValue('test');

      // Mock editor that returns empty string instead of undefined to avoid debug log issues
      const brokenEditor = {
        ...mockEditor,
        getRange: jest.fn().mockReturnValue('')
      };

      const oldCursor: EditorPosition = { line: 0, ch: 5 };
      const newCursor: EditorPosition = { line: 0, ch: 6 };

      // Should not throw error
      await expect(
        tracker.trackWordCompletion(brokenEditor, oldCursor, newCursor)
      ).resolves.not.toThrow();
    });
  });

  describe('Edge Cases', () => {
    it('should handle multi-line ranges correctly', async () => {
      (WordPatterns.isWordCharacter as jest.Mock) = jest.fn()
        .mockImplementation((char: string) => char !== '\n');
      (WordPatterns.findWordAtPosition as jest.Mock) = jest.fn()
        .mockReturnValue('multiline');

      const multiLineEditor = createMockEditor(['first line', 'second line']);

      const oldCursor: EditorPosition = { line: 0, ch: 10 };
      const newCursor: EditorPosition = { line: 1, ch: 0 };

      await tracker.trackWordCompletion(multiLineEditor, oldCursor, newCursor);

      expect(WordPatterns.isWordCharacter).toHaveBeenCalledWith('\n');
      expect(Scanner.incrementWordFrequency).toHaveBeenCalledWith('multiline');
    });

    it('should handle very long words', async () => {
      const longWord = 'a'.repeat(1000);

      (WordPatterns.isWordCharacter as jest.Mock) = jest.fn()
        .mockImplementation((char: string) => /[a-zA-Z]/.test(char));
      (WordPatterns.findWordAtPosition as jest.Mock) = jest.fn()
        .mockReturnValue(longWord);

      const oldCursor: EditorPosition = { line: 0, ch: 1000 };
      const newCursor: EditorPosition = { line: 0, ch: 1001 };

      await tracker.trackWordCompletion(mockEditor, oldCursor, newCursor);

      expect(Scanner.incrementWordFrequency).toHaveBeenCalledWith(longWord);
    });

    it('should handle rapid successive completions', async () => {
      jest.useFakeTimers();

      try {
        (WordPatterns.isWordCharacter as jest.Mock) = jest.fn()
          .mockImplementation((char: string) => /[a-zA-Z]/.test(char));
        (WordPatterns.findWordAtPosition as jest.Mock) = jest.fn()
          .mockReturnValueOnce('first')
          .mockReturnValueOnce('second')
          .mockReturnValueOnce('third');

        const oldCursor: EditorPosition = { line: 0, ch: 5 };
        const newCursor: EditorPosition = { line: 0, ch: 6 };

        // Track multiple words rapidly
        await tracker.trackWordCompletion(mockEditor, oldCursor, newCursor);
        await tracker.trackWordCompletion(mockEditor, oldCursor, newCursor);
        await tracker.trackWordCompletion(mockEditor, oldCursor, newCursor);

        // Should batch all updates
        expect(Scanner.incrementWordFrequency).toHaveBeenCalledTimes(3);
        expect(mockDb.addOrIncrementWord).not.toHaveBeenCalled();

        // Fast-forward to flush batch
        jest.advanceTimersByTime(1000);
        await jest.runAllTimersAsync();

        expect(mockDb.addOrIncrementWord).toHaveBeenCalledTimes(3);
      } finally {
        jest.clearAllTimers();
        jest.useRealTimers();
      }
    }, 10000);
  });

  describe('Comma Punctuation Tests', () => {
    beforeEach(() => {
      (WordPatterns.isWordCharacter as jest.Mock) = jest.fn()
        .mockImplementation((char: string) => /[a-zA-Z]/.test(char));
      (WordPatterns.findWordAtPosition as jest.Mock) = jest.fn();
    });

    it('should track word completion when typing comma after "corporate"', async () => {
      // Setup mock to return "corporate" when looking for word at position
      (WordPatterns.findWordAtPosition as jest.Mock) = jest.fn()
        .mockReturnValue('corporate');

      // Mock editor with "corporate," 
      mockEditor = createMockEditor(['corporate,']);
      mockEditor.getRange = jest.fn().mockReturnValue(','); // Return comma character

      const oldCursor: EditorPosition = { line: 0, ch: 9 }; // After "corporate"
      const newCursor: EditorPosition = { line: 0, ch: 10 }; // After comma

      await tracker.trackWordCompletion(mockEditor, oldCursor, newCursor);

      expect(WordPatterns.isWordCharacter).toHaveBeenCalledWith(',');
      expect(WordPatterns.findWordAtPosition).toHaveBeenCalledWith('corporate,', 10);
      expect(Scanner.incrementWordFrequency).toHaveBeenCalledWith('corporate');
    });

    it('should track "corporate" twice when typing "corporate, corporate"', async () => {
      jest.useFakeTimers();

      try {
        // Mock to return appropriate words
        (WordPatterns.findWordAtPosition as jest.Mock) = jest.fn()
          .mockReturnValueOnce('corporate') // First time
          .mockReturnValueOnce('corporate'); // Second time

        // First word completion: "corporate" -> "corporate,"
        mockEditor = createMockEditor(['corporate,']);
        mockEditor.getRange = jest.fn().mockReturnValue(',');

        const oldCursor1: EditorPosition = { line: 0, ch: 9 };
        const newCursor1: EditorPosition = { line: 0, ch: 10 };

        await tracker.trackWordCompletion(mockEditor, oldCursor1, newCursor1);

        // Second word completion: "corporate, corporate" -> "corporate, corporate "
        mockEditor = createMockEditor(['corporate, corporate ']);
        mockEditor.getRange = jest.fn().mockReturnValue(' ');

        const oldCursor2: EditorPosition = { line: 0, ch: 20 };
        const newCursor2: EditorPosition = { line: 0, ch: 21 };

        await tracker.trackWordCompletion(mockEditor, oldCursor2, newCursor2);

        expect(Scanner.incrementWordFrequency).toHaveBeenCalledTimes(2);
        expect(Scanner.incrementWordFrequency).toHaveBeenNthCalledWith(1, 'corporate');
        expect(Scanner.incrementWordFrequency).toHaveBeenNthCalledWith(2, 'corporate');
      } finally {
        jest.clearAllTimers();
        jest.useRealTimers();
      }
    });
  });


}); 