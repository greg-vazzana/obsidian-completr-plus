import { Vault } from 'obsidian';
import { intoCompletrPath } from '../settings';

interface WordRow {
    id?: number;
    word: string;
    first_letter: string;
    source: string;
    list_id?: number;
    created_at: string;
}

interface LatexCommandRow {
    id?: number;
    command: string;
    first_letter: string;
    description?: string;
    created_at: string;
}

interface WordListRow {
    id?: number;
    name: string;
    description?: string;
    enabled: boolean;
    created_at: string;
}

interface FrontMatterRow {
    id?: number;
    key: string;
    value: string;
    file_path?: string;
    frequency: number;
    created_at: string;
}

interface CountResult {
    count: number;
}

export class DatabaseService {
    private db: IDBDatabase | null = null;
    private readonly dbName: string;

    constructor(vault: Vault) {
        // Use vault ID as part of database name to isolate data between vaults
        this.dbName = `completr-plus-${vault.getName()}`;
    }

    async initialize(): Promise<void> {
        if (this.db) {
            return;
        }

        return new Promise<void>((resolve, reject) => {
            const request = indexedDB.open(this.dbName, 1);

            request.onerror = () => reject(request.error);

            request.onupgradeneeded = (event) => {
                const db = (event.target as IDBOpenDBRequest).result;

                // Create stores if they don't exist
                if (!db.objectStoreNames.contains('words')) {
                    const wordStore = db.createObjectStore('words', { keyPath: 'id', autoIncrement: true });
                    wordStore.createIndex('first_letter', 'first_letter');
                    wordStore.createIndex('word_source', ['word', 'source', 'list_id'], { unique: true });
                }

                if (!db.objectStoreNames.contains('latex_commands')) {
                    const latexStore = db.createObjectStore('latex_commands', { keyPath: 'id', autoIncrement: true });
                    latexStore.createIndex('first_letter', 'first_letter');
                    latexStore.createIndex('command', 'command', { unique: true });
                }

                if (!db.objectStoreNames.contains('word_lists')) {
                    const listStore = db.createObjectStore('word_lists', { keyPath: 'id', autoIncrement: true });
                    listStore.createIndex('name', 'name', { unique: true });
                }

                if (!db.objectStoreNames.contains('frontmatter')) {
                    const fmStore = db.createObjectStore('frontmatter', { keyPath: 'id', autoIncrement: true });
                    fmStore.createIndex('key', 'key');
                    fmStore.createIndex('key_value_file', ['key', 'value', 'file_path'], { unique: true });
                }
            };

            request.onsuccess = () => {
                this.db = request.result;
                resolve();
            };
        });
    }

    async close(): Promise<void> {
        if (this.db) {
            this.db.close();
            this.db = null;
        }
    }

    private async transaction<T>(storeName: string, mode: IDBTransactionMode, callback: (store: IDBObjectStore) => Promise<T>): Promise<T> {
        if (!this.db) {
            throw new Error('Database not initialized');
        }

        return new Promise<T>((resolve, reject) => {
            const transaction = this.db!.transaction(storeName, mode);
            const store = transaction.objectStore(storeName);

            transaction.onerror = () => reject(transaction.error);

            callback(store).then(resolve).catch(reject);
        });
    }

    async addWord(word: string, source: string = 'scan', listId?: number): Promise<void> {
        const row: WordRow = {
            word,
            first_letter: word.charAt(0),
            source,
            list_id: listId,
            created_at: new Date().toISOString()
        };

        await this.transaction('words', 'readwrite', async (store) => {
            return new Promise<void>((resolve, reject) => {
                const request = store.add(row);
                request.onerror = () => {
                    if (request.error?.name === 'ConstraintError') {
                        resolve(); // Ignore duplicate entries
                    } else {
                        reject(request.error);
                    }
                };
                request.onsuccess = () => resolve();
            });
        });
    }

    async addWords(words: string[], source: string = 'scan', listId?: number): Promise<void> {
        await this.transaction('words', 'readwrite', async (store) => {
            for (const word of words) {
                const row: WordRow = {
                    word,
                    first_letter: word.charAt(0),
                    source,
                    list_id: listId,
                    created_at: new Date().toISOString()
                };
                await new Promise<void>((resolve) => {
                    const request = store.add(row);
                    request.onerror = () => resolve(); // Ignore errors (duplicates)
                    request.onsuccess = () => resolve();
                });
            }
        });
    }

    async addLatexCommand(command: string, description?: string): Promise<void> {
        const row: LatexCommandRow = {
            command,
            first_letter: command.charAt(0),
            description,
            created_at: new Date().toISOString()
        };

        await this.transaction('latex_commands', 'readwrite', async (store) => {
            return new Promise<void>((resolve, reject) => {
                const request = store.add(row);
                request.onerror = () => {
                    if (request.error?.name === 'ConstraintError') {
                        resolve(); // Ignore duplicate entries
                    } else {
                        reject(request.error);
                    }
                };
                request.onsuccess = () => resolve();
            });
        });
    }

    async getLatexCommandsByFirstLetter(letter: string, ignoreCase: boolean = true): Promise<LatexCommandRow[]> {
        return this.transaction('latex_commands', 'readonly', async (store) => {
            return new Promise<LatexCommandRow[]>((resolve, reject) => {
                const index = store.index('first_letter');
                const request = index.getAll(ignoreCase ? letter.toLowerCase() : letter);
                request.onerror = () => reject(request.error);
                request.onsuccess = () => resolve(request.result as LatexCommandRow[]);
            });
        });
    }

    async createWordList(name: string, description?: string): Promise<number> {
        const row: WordListRow = {
            name,
            description,
            enabled: true,
            created_at: new Date().toISOString()
        };

        return this.transaction('word_lists', 'readwrite', async (store) => {
            return new Promise<number>((resolve, reject) => {
                const request = store.add(row);
                request.onerror = () => reject(request.error);
                request.onsuccess = () => resolve(request.result as number);
            });
        });
    }

    async getWordLists(): Promise<WordListRow[]> {
        return this.transaction('word_lists', 'readonly', async (store) => {
            return new Promise<WordListRow[]>((resolve, reject) => {
                const request = store.getAll();
                request.onerror = () => reject(request.error);
                request.onsuccess = () => resolve(request.result as WordListRow[]);
            });
        });
    }

    async addFrontMatterEntry(key: string, value: string, filePath?: string): Promise<void> {
        await this.transaction('frontmatter', 'readwrite', async (store) => {
            return new Promise<void>((resolve, reject) => {
                const index = store.index('key_value_file');
                const request = index.get([key, value, filePath]);
                request.onerror = () => reject(request.error);
                request.onsuccess = () => {
                    const existing = request.result;
                    if (existing) {
                        existing.frequency += 1;
                        store.put(existing);
                    } else {
                        store.add({
                            key,
                            value,
                            file_path: filePath,
                            frequency: 1,
                            created_at: new Date().toISOString()
                        });
                    }
                    resolve();
                };
            });
        });
    }

    async getFrontMatterSuggestions(key: string, prefix: string = ''): Promise<string[]> {
        return this.transaction('frontmatter', 'readonly', async (store) => {
            return new Promise<string[]>((resolve, reject) => {
                const index = store.index('key');
                const request = index.getAll(key);
                request.onerror = () => reject(request.error);
                request.onsuccess = () => {
                    const rows = request.result as FrontMatterRow[];
                    const filtered = rows
                        .filter(row => row.value.startsWith(prefix))
                        .sort((a, b) => b.frequency - a.frequency)
                        .slice(0, 10)
                        .map(row => row.value);
                    resolve(filtered);
                };
            });
        });
    }

    async getWordsByFirstLetter(letter: string, ignoreCase: boolean = true): Promise<string[]> {
        return this.transaction('words', 'readonly', async (store) => {
            return new Promise<string[]>((resolve, reject) => {
                const index = store.index('first_letter');
                const request = index.getAll(ignoreCase ? letter.toLowerCase() : letter);
                request.onerror = () => reject(request.error);
                request.onsuccess = () => {
                    const rows = request.result as WordRow[];
                    resolve([...new Set(rows.map(row => row.word))]);
                };
            });
        });
    }

    async deleteAllWords(source: string = 'scan'): Promise<void> {
        await this.transaction('words', 'readwrite', async (store) => {
            return new Promise<void>((resolve, reject) => {
                const request = store.openCursor();
                request.onerror = () => reject(request.error);
                request.onsuccess = (event) => {
                    const cursor = (event.target as IDBRequest).result;
                    if (cursor) {
                        const row = cursor.value as WordRow;
                        if (row.source === source) {
                            cursor.delete();
                        }
                        cursor.continue();
                    } else {
                        resolve();
                    }
                };
            });
        });
    }

    async deleteWordList(listId: number): Promise<void> {
        await this.transaction('word_lists', 'readwrite', async (store) => {
            return new Promise<void>((resolve, reject) => {
                const request = store.delete(listId);
                request.onerror = () => reject(request.error);
                request.onsuccess = () => resolve();
            });
        });

        // Delete associated words
        await this.transaction('words', 'readwrite', async (store) => {
            return new Promise<void>((resolve, reject) => {
                const request = store.openCursor();
                request.onerror = () => reject(request.error);
                request.onsuccess = (event) => {
                    const cursor = (event.target as IDBRequest).result;
                    if (cursor) {
                        const row = cursor.value as WordRow;
                        if (row.list_id === listId) {
                            cursor.delete();
                        }
                        cursor.continue();
                    } else {
                        resolve();
                    }
                };
            });
        });
    }

    async searchWords(query: string, ignoreCase: boolean = true): Promise<string[]> {
        return this.transaction('words', 'readonly', async (store) => {
            return new Promise<string[]>((resolve, reject) => {
                const request = store.getAll();
                request.onerror = () => reject(request.error);
                request.onsuccess = () => {
                    const rows = request.result as WordRow[];
                    const searchQuery = ignoreCase ? query.toLowerCase() : query;
                    const results = rows
                        .filter(row => {
                            const word = ignoreCase ? row.word.toLowerCase() : row.word;
                            return word.includes(searchQuery);
                        })
                        .map(row => row.word);
                    resolve([...new Set(results)]);
                };
            });
        });
    }

    getWordCount(source: string = 'scan'): number {
        if (!this.db) {
            throw new Error('Database not initialized');
        }

        const stmt = this.db.prepare('SELECT COUNT(*) as count FROM words WHERE source = ?');
        return (stmt.get(source) as CountResult).count;
    }
} 