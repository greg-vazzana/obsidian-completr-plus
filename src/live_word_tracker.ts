import { EditorPosition } from "obsidian";
import { CompletrSettings } from "./settings";
import { SQLiteDatabaseService } from "./db/sqlite_database_service";
import { WordPatterns } from "./word_patterns";
import { SuggestionIgnorelist } from "./provider/ignorelist";
import { Scanner } from "./provider/scanner_provider";

export class LiveWordTracker {
    private db: SQLiteDatabaseService | null = null;
    private settings: CompletrSettings;
    private batchUpdates: Map<string, number> = new Map();
    private batchTimeout: NodeJS.Timeout | null = null;
    private readonly BATCH_DELAY_MS = 1000; // 1 second delay for batching

    constructor(settings: CompletrSettings) {
        this.settings = settings;
    }

    private debugLog(message: string, ...args: any[]) {
        if (this.settings.debugCapitalization) {
            console.log(message, ...args);
        }
    }

    setDatabase(db: SQLiteDatabaseService) {
        this.db = db;
    }

    updateSettings(settings: CompletrSettings) {
        this.settings = settings;
    }

    async trackWordCompletion(editor: any, oldCursor: EditorPosition, newCursor: EditorPosition): Promise<void> {
        if (!this.db || !this.settings.scanEnabled || !this.settings.liveWordTracking) {
            this.debugLog('LiveWordTracker: Skipping - db:', !!this.db, 'scanEnabled:', this.settings.scanEnabled, 'liveWordTracking:', this.settings.liveWordTracking);
            return;
        }

        const isLineChange = newCursor.line !== oldCursor.line;
        const isBackwardMovement = !isLineChange && newCursor.ch <= oldCursor.ch;
        
        // Skip only backward movement on the same line (navigation)
        if (isBackwardMovement) {
            this.debugLog('LiveWordTracker: Skipping - backward movement on same line');
            return;
        }

        let currentChar: string;
        let checkCursor: EditorPosition;
        
        if (isLineChange) {
            // Line changed - check for completed word at the end of the OLD line
            if (oldCursor.ch === 0) {
                this.debugLog('LiveWordTracker: Skipping - old cursor was at beginning of line');
                return;
            }
            
            // Simulate newline character as the completion trigger
            currentChar = '\n';
            checkCursor = oldCursor;
            this.debugLog('LiveWordTracker: Line change detected - checking old line for completed word');
        } else {
            // Same line - normal logic
            if (newCursor.ch === 0) {
                this.debugLog('LiveWordTracker: Skipping - cursor at beginning of line');
                return;
            }
            
            currentChar = editor.getRange(
                { line: newCursor.line, ch: newCursor.ch - 1 },
                { line: newCursor.line, ch: newCursor.ch }
            );
            checkCursor = newCursor;
        }

        this.debugLog('LiveWordTracker: Current char:', currentChar.replace(/\n/g, '\\n'), 'isWordChar:', this.isWordCharacter(currentChar));

        // If current character is not a word character, we might have completed a word
        if (!this.isWordCharacter(currentChar)) {
            const completedWord = this.extractCompletedWord(editor, checkCursor);
            this.debugLog('LiveWordTracker: Completed word:', completedWord);
            if (completedWord && completedWord.length >= this.settings.minWordLength) {
                this.debugLog('LiveWordTracker: Incrementing frequency for:', completedWord);
                await this.incrementWordFrequency(completedWord);
            }
        }
    }

    private isWordCharacter(char: string): boolean {
        return WordPatterns.isWordCharacter(char);
    }

    private extractCompletedWord(editor: any, cursor: EditorPosition): string | null {
        const line = editor.getLine(cursor.line);
        this.debugLog('LiveWordTracker: Line:', line, 'Cursor ch:', cursor.ch);
        
        const word = WordPatterns.findWordAtPosition(line, cursor.ch - 1);
        
        if (word && word.length >= this.settings.minWordLength) {
            this.debugLog('LiveWordTracker: Extracted word:', `"${word}"`, 'using WordPatterns');
            return word;
        }
        
        this.debugLog('LiveWordTracker: No valid word found at cursor position');
        return null;
    }

    private async incrementWordFrequency(word: string): Promise<void> {
        if (!this.db) return;

        // Check ignore list
        if (SuggestionIgnorelist.hasText(word)) {
            return;
        }

        try {
            // Get scan source ID
            const scanSourceId = await this.db.getScanSourceId();
            if (!scanSourceId) return;

            // Add to batch updates
            const currentCount = this.batchUpdates.get(word) || 0;
            this.batchUpdates.set(word, currentCount + 1);

            // Update in-memory frequency immediately for Scanner provider
            Scanner.incrementWordFrequency(word);

            // Schedule batch database update
            this.scheduleBatchUpdate(scanSourceId);

        } catch (error) {
            console.error('Error tracking word completion:', error);
        }
    }

    private scheduleBatchUpdate(scanSourceId: number): void {
        if (this.batchTimeout) {
            clearTimeout(this.batchTimeout);
        }

        this.batchTimeout = setTimeout(async () => {
            await this.flushBatchUpdates(scanSourceId);
        }, this.BATCH_DELAY_MS);
    }

    private async flushBatchUpdates(scanSourceId: number): Promise<void> {
        if (!this.db || this.batchUpdates.size === 0) {
            return;
        }

        try {
            // Process all batched updates
            for (const [word, incrementBy] of this.batchUpdates) {
                await this.db.addOrIncrementWord(word, scanSourceId, incrementBy);
            }

            // Clear the batch
            this.batchUpdates.clear();
            this.batchTimeout = null;

        } catch (error) {
            console.error('Error flushing batch updates:', error);
        }
    }

    async onUnload(): Promise<void> {
        // Flush any pending updates before unloading
        if (this.batchTimeout) {
            clearTimeout(this.batchTimeout);
            const scanSourceId = await this.db?.getScanSourceId();
            if (scanSourceId) {
                await this.flushBatchUpdates(scanSourceId);
            }
        }
    }
} 