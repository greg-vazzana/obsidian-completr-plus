import { CompletrSettings, intoCompletrPath } from "../settings";
import { DictionaryProvider } from "./dictionary_provider";
import { Word } from "../db/database";
import { Vault } from "obsidian";
import { SuggestionBlacklist } from "./blacklist";
import { DatabaseService } from "../db/database";

const WORD_LISTS_FOLDER_PATH = "wordLists";
const NEW_LINE_REGEX = /\r?\n/;

class WordListSuggestionProvider extends DictionaryProvider {
    readonly wordMap: Map<string, Map<string, Word>> = new Map();
    private db: DatabaseService | null = null;
    private vault: Vault | null = null;

    setVault(vault: Vault) {
        this.vault = vault;
        this.db = new DatabaseService(vault);
    }

    isEnabled(settings: CompletrSettings): boolean {
        return settings.wordListProviderEnabled;
    }

    async initialize(): Promise<void> {
        if (!this.db) {
            throw new Error('Word list provider not properly initialized: db not set');
        }
        await this.db.initialize();
        await this.db.initializeSources();
    }

    async loadFromFiles(vault: Vault, settings: CompletrSettings): Promise<number> {
        if (!this.db) {
            throw new Error('Word list provider not properly initialized: db not set');
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
                console.log("Completr: Unable to read " + fileName);
                continue;
            }

            // Get or create source record and check if content changed
            const sourceId = await this.db.addOrUpdateWordListSource(fileName, data);

            // Each line is a word
            const lines = data.split(NEW_LINE_REGEX);
            for (let line of lines) {
                line = line.trim();
                if (line === "" || line.length < settings.minWordLength)
                    continue;

                // Only accept words that match our word pattern
                if (!line.match(/^[\p{L}\d]+(?:[-'_][\p{L}\d]+)*(?:\.[\p{L}\d]+)*$/u))
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
                if (!SuggestionBlacklist.hasText(line)) {
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
            throw new Error('Word list provider not properly initialized: db not set');
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
                    if (!SuggestionBlacklist.hasText(word.word)) {
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

    private getTotalWordCount(): number {
        let count = 0;
        for (let [letter, wordsMap] of this.wordMap.entries()) {
            count += wordsMap.size;
        }
        return count;
    }

    private async markNonExistentFiles(existingFiles: Set<string>): Promise<void> {
        if (!this.db || !this.vault) {
            throw new Error('Word list provider not properly initialized');
        }

        const path = intoCompletrPath(this.vault, WORD_LISTS_FOLDER_PATH);
        if (!(await this.vault.adapter.exists(path))) {
            return;
        }

        const files = await this.vault.adapter.list(path);
        for (const file of files.files) {
            await this.db.markSourceFileStatus(file, existingFiles.has(file));
        }
    }

    async deleteWordList(vault: Vault, path: string) {
        await vault.adapter.remove(path);
    }

    async importWordList(vault: Vault, name: string, text: string, settings: CompletrSettings): Promise<boolean> {
        if (!settings.wordListProviderEnabled) {
            return false;
        }

        const path = intoCompletrPath(vault, WORD_LISTS_FOLDER_PATH, name);
        if (await vault.adapter.exists(path))
            return false;

        await vault.adapter.write(path, text);
        return true;
    }

    /**
     * Returns all files inside of {@link BASE_FOLDER_PATH}. The resulting strings are full paths, relative to the vault
     * root. <br>
     * @example
     * - .obsidian/plugins/obsidian-completr-plus/wordLists/german.dic
     * - .obsidian/plugins/obsidian-completr-plus/wordLists/long_words
     * - .obsidian/plugins/obsidian-completr-plus/wordLists/special_words.txt
     * @param vault
     */
    async getRelativeFilePaths(vault: Vault): Promise<string[]> {
        const path = intoCompletrPath(vault, WORD_LISTS_FOLDER_PATH);
        if (!(await vault.adapter.exists(path)))
            await vault.adapter.mkdir(path);

        return (await vault.adapter.list(path)).files;
    }
}

export const WordList = new WordListSuggestionProvider();
