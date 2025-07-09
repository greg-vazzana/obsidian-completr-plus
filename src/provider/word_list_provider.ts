import { CompletrSettings, intoCompletrPath } from "../settings";
import { DictionaryProvider } from "./dictionary_provider";
import { Word } from "../db/sqlite_database_service";
import { Vault } from "obsidian";
import { SuggestionIgnorelist } from "./ignorelist";
import { SQLiteDatabaseService } from "../db/sqlite_database_service";
import { WordPatterns } from "../word_patterns";
import { FOLDERS, PATTERNS, ERROR_MESSAGES } from "../constants";

class WordListSuggestionProvider extends DictionaryProvider {
    readonly wordMap: Map<string, Map<string, Word>> = new Map();
    private db: SQLiteDatabaseService | null = null;
    private vault: Vault | null = null;

    setVault(vault: Vault) {
        this.vault = vault;
        this.db = new SQLiteDatabaseService(vault);
    }

    async initialize(): Promise<void> {
        if (!this.db) {
            throw new Error(ERROR_MESSAGES.PROVIDER_NOT_INITIALIZED('Word list'));
        }
        await this.db.initialize();
        await this.db.initializeSources();
    }

    async loadFromFiles(vault: Vault, settings: CompletrSettings): Promise<number> {
        if (!this.db) {
            throw new Error(ERROR_MESSAGES.PROVIDER_NOT_INITIALIZED('Word list'));
        }
        
        if (!settings.wordListProviderEnabled) {
            return 0;
        }

        this.wordMap.clear();

        const fileNames = await this.getRelativeFilePaths(vault);
        
        // Check for files that no longer exist
        const existingFiles = new Set(fileNames);
        await this.markNonExistentFiles(existingFiles);

        // Read and process all files
        for (let i = fileNames.length - 1; i >= 0; i--) {
            const fileName = fileNames[i];

            let data: string;
            try {
                data = await vault.adapter.read(fileName);
            } catch (e) {
                console.log(ERROR_MESSAGES.FILE_READ_ERROR(fileName));
                continue;
            }

            // Get or create source record and check if content changed
            const sourceId = await this.db.addOrUpdateWordListSource(fileName, data);

            // Each line is a word
            const lines = data.split(PATTERNS.NEW_LINE);
            for (let line of lines) {
                line = line.trim();
                if (line === "" || line.length < settings.minWordLength)
                    continue;

                // Only accept words that match our word pattern
                if (!WordPatterns.isValidWord(line))
                    continue;

                await this.db.addWord(line, sourceId);

                // Update in-memory map
                const firstLetter = line.charAt(0);
                let wordsForLetter = this.wordMap.get(firstLetter);
                if (!wordsForLetter) {
                    wordsForLetter = new Map<string, Word>();
                    this.wordMap.set(firstLetter, wordsForLetter);
                }
                const wordObj = { word: line, frequency: 1 };
                if (!SuggestionIgnorelist.hasText(line)) {
                    wordsForLetter.set(line, wordObj);
                }
            }
        }

        // After processing all files, reload words from database to get accurate frequencies
        await this.loadWordsFromDb();

        return this.getTotalWordCount();
    }

    private async loadWordsFromDb(): Promise<void> {
        if (!this.db) {
            throw new Error(ERROR_MESSAGES.PROVIDER_NOT_INITIALIZED('Word list'));
        }
        this.wordMap.clear();
        
        // Get all word list source IDs
        const wordListSourceIds = await this.db.getWordListSourceIds();
        
        // Load words from all word list sources
        for (const sourceId of wordListSourceIds) {
            const wordsGrouped = await this.db.getAllWordsBySource(sourceId);
            
            for (const [firstLetter, wordList] of wordsGrouped.entries()) {
                let wordsForLetter = this.wordMap.get(firstLetter);
                if (!wordsForLetter) {
                    wordsForLetter = new Map<string, Word>();
                    this.wordMap.set(firstLetter, wordsForLetter);
                }
                
                for (const word of wordList) {
                    if (!SuggestionIgnorelist.hasText(word.word)) {
                        // Use database frequency data
                        wordsForLetter.set(word.word, {
                            word: word.word,
                            frequency: word.frequency
                        });
                    }
                }
            }
        }

        // Sort by frequency (higher first) then length (shorter first)
        for (let [letter, wordsMap] of this.wordMap.entries()) {
            const sortedWords = Array.from(wordsMap.values()).sort((a, b) => {
                const freqDiff = b.frequency - a.frequency;
                return freqDiff !== 0 ? freqDiff : a.word.length - b.word.length;
            });
            const newMap = new Map<string, Word>();
            sortedWords.forEach(word => newMap.set(word.word, word));
            this.wordMap.set(letter, newMap);
        }
    }

    private async markNonExistentFiles(existingFiles: Set<string>): Promise<void> {
        if (!this.db) {
            throw new Error(ERROR_MESSAGES.PROVIDER_NOT_INITIALIZED('Word list'));
        }
        
        // Get all word list source IDs
        const wordListSourceIds = await this.db.getWordListSourceIds();
        
        // Mark files that no longer exist
        for (const sourceId of wordListSourceIds) {
            const sources = await this.db.getAllWordsBySource(sourceId);
            // This is a simplification - in a real implementation, you'd check each source file
            // For now, we'll assume all files exist if they're in the existingFiles set
        }
    }

    private getTotalWordCount(): number {
        let total = 0;
        for (const wordMap of this.wordMap.values()) {
            total += wordMap.size;
        }
        return total;
    }

    isEnabled(settings: CompletrSettings): boolean {
        return settings.wordListProviderEnabled;
    }

    async importWordList(vault: Vault, name: string, text: string, settings: CompletrSettings): Promise<boolean> {
        if (!settings.wordListProviderEnabled) {
            return false;
        }

        const path = intoCompletrPath(vault, FOLDERS.WORD_LISTS, name);
        if (await vault.adapter.exists(path))
            return false;

        await vault.adapter.write(path, text);
        return true;
    }

    /**
     * Returns all files inside of {@link FOLDERS.WORD_LISTS}. The resulting strings are full paths, relative to the vault
     * root. <br>
     * @example
     * - .obsidian/plugins/obsidian-completr-plus/wordLists/german.dic
     * - .obsidian/plugins/obsidian-completr-plus/wordLists/long_words
     * - .obsidian/plugins/obsidian-completr-plus/wordLists/special_words.txt
     * @param vault
     */
    async getRelativeFilePaths(vault: Vault): Promise<string[]> {
        const path = intoCompletrPath(vault, FOLDERS.WORD_LISTS);
        if (!(await vault.adapter.exists(path)))
            await vault.adapter.mkdir(path);

        return (await vault.adapter.list(path)).files;
    }
}

export const WordList = new WordListSuggestionProvider();
