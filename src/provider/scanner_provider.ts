import { TFile, Vault } from "obsidian";
import { CompletrSettings } from "../settings";
import { DictionaryProvider } from "./dictionary_provider";
import { SuggestionBlacklist } from "./blacklist";
import { DatabaseService } from "../db/database";

class ScannerSuggestionProvider extends DictionaryProvider {
    private db: DatabaseService | null = null;
    readonly wordMap: Map<string, Set<string>> = new Map<string, Set<string>>();
    private vault: Vault | null = null;

    setVault(vault: Vault) {
        this.vault = vault;
        this.db = new DatabaseService(vault);
    }

    isEnabled(settings: CompletrSettings): boolean {
        return settings.fileScannerProviderEnabled;
    }

    async initialize() {
        if (!this.db || !this.vault) {
            throw new Error('Scanner not properly initialized: vault not set');
        }
        await this.db.initialize();
        await this.loadWordsFromDb();
    }

    async onunload() {
        if (this.db) {
            await this.db.close();
            this.db = null;
        }
        this.vault = null;
    }

    async scanFiles(settings: CompletrSettings, files: TFile[]) {
        if (!this.db || !this.vault) {
            throw new Error('Scanner not properly initialized: vault not set');
        }
        for (let file of files) {
            await this.scanFile(settings, file, false);
        }
    }

    async scanFile(settings: CompletrSettings, file: TFile, saveImmediately: boolean) {
        if (!this.vault) {
            throw new Error('Scanner not properly initialized: vault not set');
        }
        const contents = await file.vault.cachedRead(file);

        const regex = new RegExp("\\$+.*?\\$+|`+.*?`+|\\[+.*?\\]+|https?:\\/\\/[^\\n\\s]+|([" + settings.characterRegex + "]+)", "gsu");
        for (let match of contents.matchAll(regex)) {
            const groupValue = match[1];
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
        if (!this.vault || !this.db) {
            this.setVault(vault);
            await this.initialize();
        }
    }

    async deleteAllWords(vault: Vault) {
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

        await this.db.addWord(word);
        
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
