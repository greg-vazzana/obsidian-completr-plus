import { TFile, Vault } from "obsidian";
import { CompletrSettings } from "../settings";
import { DictionaryProvider } from "./dictionary_provider";
import { SuggestionBlacklist } from "./blacklist";
import { DatabaseService } from "../db/database";

class ScannerSuggestionProvider extends DictionaryProvider {
    private db: DatabaseService | null = null;
    readonly wordMap: Map<string, Set<string>> = new Map<string, Set<string>>();
    private scanSourceId: number | null = null;

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
        for (let file of files) {
            await this.scanFile(settings, file);
        }
    }

    async scanFile(settings: CompletrSettings, file: TFile) {
        if (!this.db) {
            throw new Error('Scanner not properly initialized: db not set');
        }

        const contents = await file.vault.cachedRead(file);

        // Match words that:
        // 1. Start after spaces, periods, commas, or at line start
        // 2. Contain word characters (letters, numbers)
        // 3. Can have internal hyphens, apostrophes, or underscores followed by more word chars
        // 4. Can have dot-separated segments (like file.txt)
        // 5. End at spaces, periods, commas, or line end
        const regex = new RegExp("\\$+.*?\\$+|`+.*?`+|\\[+.*?\\]+|https?:\\/\\/[^\\n\\s]+|(?:^|(?<=\\s|[.,]))[\\w]+(?:[-'_]\\w+)*(?:\\.\\w+)*(?=$|\\s|[.,])", "gsu");
        for (let match of contents.matchAll(regex)) {
            const groupValue = match[0]; // Use match[0] since we're not using a capture group anymore
            if (!groupValue || groupValue.length < settings.minWordLength)
                continue;

            await this.addWord(groupValue);
        }
    }

    private async loadWordsFromDb() {
        if (!this.db) {
            throw new Error('Scanner not properly initialized: db not set');
        }
        this.wordMap.clear();
        // Load all words and organize them by first letter in memory
        const letters = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
        for (const letter of letters) {
            const words = await this.db.getWordsByFirstLetter(letter);
            if (words.length > 0) {
                const set = new Set<string>();
                words.forEach(word => set.add(word));
                this.wordMap.set(letter, set);
            }
        }
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
        await this.db.deleteAllWords();
    }

    private async addWord(word: string) {
        if (!word || !this.db || SuggestionBlacklist.hasText(word)) {
            return;
        }

        // Get scan source ID if not already cached
        if (this.scanSourceId === null) {
            const index = this.db['db'].transaction('sources', 'readonly')
                .objectStore('sources')
                .index('name');
            
            const request = index.get('scan');
            this.scanSourceId = await new Promise((resolve, reject) => {
                request.onerror = () => reject(request.error);
                request.onsuccess = () => resolve(request.result?.id ?? null);
            });

            if (this.scanSourceId === null) {
                throw new Error('Scan source not found in database');
            }
        }

        await this.db.addWord(word, this.scanSourceId);
        
        // Also update in-memory map for fast lookups
        let list = this.wordMap.get(word.charAt(0));
        if (!list) {
            list = new Set<string>();
            this.wordMap.set(word.charAt(0), list);
        }
        list.add(word);
    }
}

// Create a singleton instance but don't initialize it with a vault yet
export const Scanner = new ScannerSuggestionProvider();
