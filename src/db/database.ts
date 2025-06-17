import { Notice, Vault } from 'obsidian';
import { intoCompletrPath } from '../settings';
import { createHash } from 'crypto';

interface Source {
    id?: number;
    name: string;          // "scan" or word list filename
    type: "scan" | "word_list";
    last_updated: string;  // ISO timestamp
    checksum?: string;     // MD5 hash (for word_list type)
    file_exists?: boolean; // for word_list type
}

export interface Word {
    word: string;
    frequency: number;
    id?: number;
    first_letter?: string;
    source_id?: number;    // Foreign key to Source table
    created_at?: string;   // ISO timestamp
}

interface WordRow {
    id?: number;
    word: string;
    first_letter: string;
    source: string;
    list_id?: number;
    word_source_list: string;
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
        this.dbName = `completr-${vault.getName()}`;
    }

    async initialize(): Promise<void> {
        if (this.db) {
            return;
        }

        return new Promise<void>((resolve, reject) => {
            const request = indexedDB.open(this.dbName, 5); // Increment version for new schema

            request.onerror = () => reject(request.error);

            request.onupgradeneeded = (event) => {
                const db = (event.target as IDBOpenDBRequest).result;
                const oldVersion = event.oldVersion;

                // For fresh database (version 0)
                if (oldVersion < 1) {
                    const sourceStore = db.createObjectStore('sources', { keyPath: 'id', autoIncrement: true });
                    sourceStore.createIndex('name', 'name', { unique: true });
                    sourceStore.createIndex('type', 'type');

                    const wordStore = db.createObjectStore('words', { keyPath: 'id', autoIncrement: true });
                    wordStore.createIndex('word', 'word', { unique: true });
                    wordStore.createIndex('first_letter', 'first_letter');
                    wordStore.createIndex('source_id', 'source_id');

                    const latexStore = db.createObjectStore('latex_commands', { keyPath: 'id', autoIncrement: true });
                    latexStore.createIndex('first_letter', 'first_letter');
                    latexStore.createIndex('command', 'command', { unique: true });
                }

                // Add frequency column in version 5
                if (oldVersion < 5) {
                    const transaction = (event.target as IDBOpenDBRequest).transaction;
                    const wordStore = transaction.objectStore('words');
                    
                    if (!wordStore.indexNames.contains('frequency')) {
                        wordStore.createIndex('frequency', 'frequency');
                    }

                    // Update all existing records to have frequency = 1
                    const cursorRequest = wordStore.openCursor();
                    cursorRequest.onsuccess = (e: Event) => {
                        const cursor = (e.target as IDBRequest).result;
                        if (cursor) {
                            const value = cursor.value;
                            if (!value.frequency) {
                                value.frequency = 1;
                                cursor.update(value);
                            }
                            cursor.continue();
                        }
                    };
                }
            };

            request.onsuccess = () => {
                this.db = request.result;
                resolve();
            };
        });
    }

    private async transaction<T>(
        storeName: string,
        mode: IDBTransactionMode,
        callback: (store: IDBObjectStore) => Promise<T>
    ): Promise<T> {
        if (!this.db) {
            throw new Error('Database not initialized');
        }

        return new Promise<T>((resolve, reject) => {
            const transaction = this.db.transaction(storeName, mode);
            transaction.onerror = () => reject(transaction.error);
            
            const store = transaction.objectStore(storeName);
            callback(store)
                .then(resolve)
                .catch(reject);
        });
    }

    async initializeSources(): Promise<void> {
        // Ensure scan source exists
        const scanSource: Source = {
            name: 'scan',
            type: 'scan',
            last_updated: new Date().toISOString()
        };

        await this.transaction('sources', 'readwrite', async (store) => {
            const index = store.index('name');
            const existing = await new Promise<Source>((resolve) => {
                const request = index.get('scan');
                request.onsuccess = () => resolve(request.result);
            });

            if (!existing) {
                await new Promise<void>((resolve, reject) => {
                    const request = store.add(scanSource);
                    request.onerror = () => reject(request.error);
                    request.onsuccess = () => resolve();
                });
            }
        });
    }

    async calculateFileHash(contents: string): Promise<string> {
        return createHash('md5').update(contents).digest('hex');
    }

    async addOrUpdateWordListSource(filename: string, contents: string): Promise<number> {
        const hash = await this.calculateFileHash(contents);
        
        return this.transaction('sources', 'readwrite', async (store) => {
            const index = store.index('name');
            const existing = await new Promise<Source>((resolve) => {
                const request = index.get(filename);
                request.onsuccess = () => resolve(request.result);
            });

            if (existing) {
                if (existing.checksum !== hash) {
                    // Delete all words from this source if hash changed
                    await this.deleteWordsBySource(existing.id);
                    
                    existing.checksum = hash;
                    existing.last_updated = new Date().toISOString();
                    existing.file_exists = true;

                    await new Promise<void>((resolve, reject) => {
                        const request = store.put(existing);
                        request.onerror = () => reject(request.error);
                        request.onsuccess = () => resolve();
                    });

                    new Notice(`Word list '${filename}' has changed and will be re-imported`);
                    return existing.id;
                }
                return existing.id;
            } else {
                const source: Source = {
                    name: filename,
                    type: 'word_list',
                    checksum: hash,
                    last_updated: new Date().toISOString(),
                    file_exists: true
                };

                return new Promise<number>((resolve, reject) => {
                    const request = store.add(source);
                    request.onerror = () => reject(request.error);
                    request.onsuccess = () => resolve(request.result as number);
                });
            }
        });
    }

    async markSourceFileStatus(filename: string, exists: boolean): Promise<void> {
        await this.transaction('sources', 'readwrite', async (store) => {
            const index = store.index('name');
            const existing = await new Promise<Source>((resolve) => {
                const request = index.get(filename);
                request.onsuccess = () => resolve(request.result);
            });

            if (existing && existing.file_exists !== exists) {
                existing.file_exists = exists;
                existing.last_updated = new Date().toISOString();

                await new Promise<void>((resolve, reject) => {
                    const request = store.put(existing);
                    request.onerror = () => reject(request.error);
                    request.onsuccess = () => resolve();
                });

                if (!exists) {
                    new Notice(`Word list '${filename}' no longer exists`);
                }
            }
        });
    }

    async addWord(word: string, sourceId: number): Promise<void> {
        await this.transaction('words', 'readwrite', async (store) => {
            const index = store.index('word');
            const existing = await new Promise<Word>((resolve) => {
                const request = index.get(word);
                request.onsuccess = () => resolve(request.result);
            });

            if (!existing) {
                const newWord: Word = {
                    word,
                    frequency: 1,
                    first_letter: word.charAt(0),
                    source_id: sourceId,
                    created_at: new Date().toISOString()
                };

                await new Promise<void>((resolve, reject) => {
                    const request = store.add(newWord);
                    request.onerror = () => reject(request.error);
                    request.onsuccess = () => resolve();
                });
            }
            // If word exists, keep original source_id and frequency as requested
        });
    }

    async getWordsByFirstLetter(letter: string): Promise<string[]> {
        return this.transaction('words', 'readonly', async (store) => {
            return new Promise<string[]>((resolve, reject) => {
                const index = store.index('first_letter');
                const request = index.getAll(letter);
                request.onerror = () => reject(request.error);
                request.onsuccess = () => {
                    const rows = request.result as Word[];
                    resolve([...new Set(rows.map(row => row.word))]);
                };
            });
        });
    }

    private async deleteWordsBySource(sourceId: number): Promise<void> {
        await this.transaction('words', 'readwrite', async (store) => {
            const index = store.index('source_id');
            const request = index.getAllKeys(sourceId);
            
            const keys = await new Promise<IDBValidKey[]>((resolve, reject) => {
                request.onerror = () => reject(request.error);
                request.onsuccess = () => resolve(request.result);
            });

            for (const key of keys) {
                await new Promise<void>((resolve, reject) => {
                    const deleteRequest = store.delete(key);
                    deleteRequest.onerror = () => reject(deleteRequest.error);
                    deleteRequest.onsuccess = () => resolve();
                });
            }
        });
    }

    async deleteAllWords(): Promise<void> {
        await this.transaction('words', 'readwrite', async (store) => {
            return new Promise<void>((resolve, reject) => {
                const request = store.clear();
                request.onerror = () => reject(request.error);
                request.onsuccess = () => resolve();
            });
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

    async getWordCount(source: string = 'scan'): Promise<number> {
        if (!this.db) {
            throw new Error('Database not initialized');
        }

        return this.transaction('words', 'readonly', async (store) => {
            return new Promise<number>((resolve, reject) => {
                const request = store.count();
                request.onerror = () => reject(request.error);
                request.onsuccess = () => resolve(request.result as number);
            });
        });
    }
} 