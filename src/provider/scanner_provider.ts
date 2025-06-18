import { TFile, Vault } from "obsidian";
import { CompletrSettings } from "../settings";
import { DictionaryProvider } from "./dictionary_provider";
import { Word } from "../db/database";
import { SuggestionBlacklist } from "./blacklist";
import { DatabaseService } from "../db/database";

class ScannerSuggestionProvider extends DictionaryProvider {
    readonly wordMap: Map<string, Map<string, Word>> = new Map();
    private db: DatabaseService | null = null;
    private scanSourceId: number | null = null;
    private frequencyUpdates: Map<string, number> = new Map(); // Track frequency increments during scanning

    setVault(vault: Vault) {
        this.db = new DatabaseService(vault);
    }

    async initialize(): Promise<void> {
        if (!this.db) {
            throw new Error('Scanner not properly initialized: db not set');
        }
        await this.db.initialize();
        await this.db.initializeSources();
        await this.loadWordsFromDb();
    }

    isEnabled(settings: CompletrSettings): boolean {
        return settings.scanEnabled;
    }

    async scanFiles(settings: CompletrSettings, files: TFile[]) {
        if (!this.db) {
            throw new Error('Scanner not properly initialized: db not set');
        }
        
        // Clear scan words before scanning (per-source clearing)
        await this.db.deleteScanWords();
        
        // Clear frequency tracking for this scan session
        this.frequencyUpdates.clear();
        
        // Clear in-memory map since we deleted scan words from database
        this.wordMap.clear();
        
        for (let file of files) {
            await this.scanFile(settings, file);
        }
        
        // Write batched frequency updates to database after all files are scanned
        await this.flushFrequencyUpdates();
    }

    async scanFile(settings: CompletrSettings, file: TFile) {
        if (!this.db) {
            throw new Error('Scanner not properly initialized: db not set');
        }

        const contents = await file.vault.cachedRead(file);

        // Match words that:
        // 1. Start after spaces, periods, commas, or at line start
        // 2. Contain word characters (letters from any language, numbers)
        // 3. Can have internal hyphens, apostrophes, or underscores followed by more word chars
        // 4. Can have dot-separated segments (like file.txt)
        // 5. End at spaces, periods, commas, or line end
        const regex = new RegExp("\\$+.*?\\$+|`+.*?`+|\\[+.*?\\]+|https?:\\/\\/[^\\n\\s]+|(?:^|(?<=\\s|[.,]))(?:[\\p{L}\\d]+(?:[-'_][\\p{L}\\d]+)*(?:\\.[\\p{L}\\d]+)*)", "gsu");
        for (let match of contents.matchAll(regex)) {
            const groupValue = match[0];
            if (!groupValue || groupValue.length < settings.minWordLength)
                continue;

            await this.addOrIncrementWord(groupValue);
        }
    }

    private async loadWordsFromDb() {
        if (!this.db) {
            throw new Error('Scanner not properly initialized: db not set');
        }
        this.wordMap.clear();
        
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
                if (!SuggestionBlacklist.hasText(word.word)) {
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
        if (!word || !this.db || SuggestionBlacklist.hasText(word)) {
            return;
        }

        // Get scan source ID if not already cached
        if (this.scanSourceId === null) {
            this.scanSourceId = await this.db.getScanSourceId();
            
            if (this.scanSourceId === null) {
                throw new Error('Scan source not found in database');
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
        
        // Track frequency increment for batch database update
        const currentIncrement = this.frequencyUpdates.get(word) || 0;
        this.frequencyUpdates.set(word, currentIncrement + 1);
    }

    private async flushFrequencyUpdates() {
        if (!this.db || this.frequencyUpdates.size === 0) {
            return;
        }

        // Write all frequency updates to database
        for (const [word, incrementCount] of this.frequencyUpdates.entries()) {
            try {
                await this.db.addOrIncrementWord(word, this.scanSourceId!, incrementCount);
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
            await this.initialize();
        }
    }

    async deleteAllWords() {
        if (!this.db) {
            throw new Error('Scanner not properly initialized: db not set');
        }
        this.wordMap.clear();
        await this.db.deleteScanWords(); // Only delete scan words instead of all words
    }

    async deleteScanWords() {
        if (!this.db) {
            throw new Error('Scanner not properly initialized: db not set');
        }
        // Clear in-memory scan words and database scan words
        this.wordMap.clear();
        await this.db.deleteScanWords();
    }

    // Keep the old addWord method for backwards compatibility, but mark as deprecated
    private async addWord(word: string) {
        await this.addOrIncrementWord(word);
    }
}

// Create a singleton instance but don't initialize it with a vault yet
export const Scanner = new ScannerSuggestionProvider();
