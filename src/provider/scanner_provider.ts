import { TFile, Vault } from "obsidian";

import { SQLiteDatabaseService, Word } from "../db/sqlite_database_service";
import { CompletrSettings } from "../settings";
import { WordPatterns } from "../word_patterns";
import { DictionaryProvider } from "./dictionary_provider";
import { SuggestionIgnorelist } from "./ignorelist";

class ScannerSuggestionProvider extends DictionaryProvider {
    readonly wordMap: Map<string, Map<string, Word>> = new Map();
    private db: SQLiteDatabaseService | null = null;
    private scanSourceId: number | null = null;
    private frequencyUpdates: Map<string, number> = new Map(); // Track frequency increments during scanning

    setVault(vault: Vault) {
        if (!this.db) {
            this.db = new SQLiteDatabaseService(vault);
        }
    }

    // Method to connect database when it becomes available
    async connectDatabase(database: SQLiteDatabaseService) {
        this.db = database;
        try {
            await this.db.initializeSources();
            await this.loadWordsFromDb();
        } catch (error) {
            console.error('Scanner: Failed to connect database:', error);
            this.db = null;
        }
    }

    async initialize(): Promise<void> {
        if (!this.db) {
            console.warn('Scanner: Database not set, using in-memory only mode');
            return;
        }
        
        try {
            await this.db.initialize();
            await this.db.initializeSources();
            await this.loadWordsFromDb();
        } catch (error) {
            console.error('Scanner: Database initialization failed, using in-memory only mode:', error);
            this.db = null; // Reset to null to indicate no database available
        }
    }

    isEnabled(settings: CompletrSettings): boolean {
        return settings.scanEnabled;
    }

    async scanFiles(settings: CompletrSettings, files: TFile[]) {
        if (this.db) {
            // Clear scan words before scanning (per-source clearing)
            await this.db.deleteScanWords();
        }
        
        // Clear frequency tracking for this scan session
        this.frequencyUpdates.clear();
        
        // Clear in-memory map since we deleted scan words from database
        this.wordMap.clear();
        
        for (let file of files) {
            await this.scanFile(settings, file);
        }
        
        // Write batched frequency updates to database after all files are scanned
        if (this.db) {
            await this.flushFrequencyUpdates();
        }
    }

    async scanFile(settings: CompletrSettings, file: TFile) {
        const contents = await file.vault.cachedRead(file);

        // Match words that:
        // 1. Start after spaces, periods, commas, or at line start
        // 2. Contain word characters (letters from any language, numbers)
        // 3. Can have internal hyphens, apostrophes, or underscores followed by more word chars
        // 4. Can have dot-separated segments (like file.txt)
        // 5. End at spaces, periods, commas, or line end
        for (let match of contents.matchAll(WordPatterns.SCANNER_PATTERN)) {
            const groupValue = match[0];
            if (!groupValue || groupValue.length < settings.minWordLength)
                continue;

            await this.addOrIncrementWord(groupValue);
        }
    }

    private async loadWordsFromDb() {
        this.wordMap.clear();
        
        if (!this.db) {
            console.warn('Scanner: Database not available, cannot load words');
            return;
        }
        
        // Get scan source ID if not already cached
        if (this.scanSourceId === null) {
            this.scanSourceId = await this.db.getScanSourceId();
        }
        
        if (this.scanSourceId === null) {
            // No scan source exists yet, nothing to load
            return;
        }
        
        // Load only scan words grouped by first letter from database
        const wordsGrouped = await this.db.getAllWordsBySource(this.scanSourceId);
        
        for (const [firstLetter, wordList] of wordsGrouped.entries()) {
            const wordsByWord = new Map<string, Word>();
            for (const word of wordList) {
                if (!SuggestionIgnorelist.hasText(word.word)) {
                    // Preserve the actual frequency from database
                    wordsByWord.set(word.word, {
                        word: word.word,
                        frequency: word.frequency
                    });
                }
            }
            if (wordsByWord.size > 0) {
                this.wordMap.set(firstLetter, wordsByWord);
            }
        }
    }

    private async addOrIncrementWord(word: string) {
        if (!word || SuggestionIgnorelist.hasText(word)) {
            return;
        }

        // If database is available, get scan source ID
        if (this.db && this.scanSourceId === null) {
            this.scanSourceId = await this.db.getScanSourceId();
            
            if (this.scanSourceId === null) {
                console.warn('Scanner: Scan source not found in database');
            }
        }

        const firstLetter = word.charAt(0);
        
        // Update in-memory map
        let wordsForLetter = this.wordMap.get(firstLetter);
        if (!wordsForLetter) {
            wordsForLetter = new Map<string, Word>();
            this.wordMap.set(firstLetter, wordsForLetter);
        }
        
        const existingWord = wordsForLetter.get(word);
        if (existingWord) {
            // Increment frequency in memory
            existingWord.frequency += 1;
        } else {
            // Add new word to memory with frequency 1
            wordsForLetter.set(word, { word, frequency: 1 });
        }
        
        // Track frequency increment for batch database update (if database available)
        if (this.db) {
            const currentIncrement = this.frequencyUpdates.get(word) || 0;
            this.frequencyUpdates.set(word, currentIncrement + 1);
        }
    }

    private async flushFrequencyUpdates() {
        if (!this.db || this.frequencyUpdates.size === 0) {
            return;
        }

        // Write all frequency updates to database
        for (const [word, incrementCount] of this.frequencyUpdates.entries()) {
            try {
                if (this.scanSourceId !== null) {
                    await this.db.addOrIncrementWord(word, this.scanSourceId, incrementCount);
                }
            } catch (error) {
                console.error(`Failed to update frequency for word "${word}":`, error);
                // Continue with other words even if one fails
            }
        }
        
        // Clear the updates after successful flush
        this.frequencyUpdates.clear();
    }

    async saveData(vault: Vault) {
        // No need to save data as it's already in the database
    }

    async loadData(vault: Vault) {
        // Only set vault and initialize if not already initialized
        if (!this.db) {
            this.setVault(vault);
            try {
                await this.initialize();
            } catch (error) {
                console.error('Scanner loadData: Failed to initialize:', error);
            }
        }
    }

    async deleteAllWords() {
        this.wordMap.clear();
        if (this.db) {
            await this.db.deleteScanWords(); // Only delete scan words instead of all words
        }
    }

    async deleteScanWords() {
        // Clear in-memory scan words and database scan words
        this.wordMap.clear();
        if (this.db) {
            await this.db.deleteScanWords();
        }
    }

    // Keep the old addWord method for backwards compatibility, but mark as deprecated
    private async addWord(word: string) {
        await this.addOrIncrementWord(word);
    }

    /**
     * Public method to increment word frequency in memory for live tracking
     * This is used by the live word tracker to immediately update frequencies
     * without waiting for the next full scan
     */
    incrementWordFrequency(word: string): void {
        if (!word || SuggestionIgnorelist.hasText(word)) {
            return;
        }

        const firstLetter = word.charAt(0);
        const wordsForLetter = this.wordMap.get(firstLetter);
        
        if (wordsForLetter) {
            const existingWord = wordsForLetter.get(word);
            if (existingWord) {
                existingWord.frequency += 1;
            } else {
                // Add new word to memory with frequency 1
                wordsForLetter.set(word, { word, frequency: 1 });
            }
        } else {
            // Create new letter group and add word
            const newWordsForLetter = new Map<string, Word>();
            newWordsForLetter.set(word, { word, frequency: 1 });
            this.wordMap.set(firstLetter, newWordsForLetter);
        }
    }
}

// Create a singleton instance but don't initialize it with a vault yet
export const Scanner = new ScannerSuggestionProvider();
