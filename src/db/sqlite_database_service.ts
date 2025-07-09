import { Notice, Vault } from 'obsidian';
import { createHash } from 'crypto';
import initSqlJs, { Database, SqlJsStatic } from 'sql.js';
import { SQLITE_SCHEMA } from './sqlite_schema';
import { intoCompletrPath } from '../settings';
import { DATABASE_SAVE_INTERVAL_MS } from '../constants';

// Import the same interfaces from the original database service
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

export class SQLiteDatabaseService {
    private db: Database | null = null;
    private SQL: SqlJsStatic | null = null;
    private vault: Vault;
    private dbFilePath: string;
    private saveTimer: NodeJS.Timer | null = null;
    private isDirty: boolean = false;
    private isInitialized: boolean = false;

    constructor(vault: Vault) {
        this.vault = vault;
        this.dbFilePath = `${this.vault.configDir}/plugins/obsidian-completr-plus/completr.db`;
    }

    async initialize(): Promise<void> {
        if (this.isInitialized) {
            return;
        }

        try {
            // Load WASM file using vault adapter - same approach as ignorelist.ts
            const wasmPath = intoCompletrPath(this.vault, 'sql-wasm.wasm');
            const wasmBinary = await this.vault.adapter.readBinary(wasmPath);
            
            // Initialize sql.js with the WASM binary data
            this.SQL = await initSqlJs({
                wasmBinary: new Uint8Array(wasmBinary)
            });

            // Try to load existing database file
            await this.loadDatabase();

            // Set up periodic save
            this.setupPeriodicSave();

            this.isInitialized = true;
        } catch (error) {
            console.error('Failed to initialize SQLite database:', error);
            throw error;
        }
    }

    private async loadDatabase(): Promise<void> {
        if (!this.SQL) {
            throw new Error('SQL.js not initialized');
        }

        try {
            // Check if database file exists
            if (await this.vault.adapter.exists(this.dbFilePath)) {
                // Load existing database
                const fileData = await this.vault.adapter.readBinary(this.dbFilePath);
                const uint8Array = new Uint8Array(fileData);
                this.db = new this.SQL.Database(uint8Array);
                console.log('Loaded existing SQLite database');
            } else {
                // Create new database
                this.db = new this.SQL.Database();
                console.log('Created new SQLite database');
            }

            // Ensure schema is up to date
            this.db.exec(SQLITE_SCHEMA);
            
            // Initialize required sources
            await this.initializeSources();
            
            // Save the database to ensure schema is persisted
            await this.saveDatabase();
        } catch (error) {
            console.error('Failed to load database, creating new one:', error);
            // Create new database on corruption
            this.db = new this.SQL.Database();
            this.db.exec(SQLITE_SCHEMA);
            await this.initializeSources();
            await this.saveDatabase();
        }
    }

    private async saveDatabase(): Promise<void> {
        if (!this.db) {
            return;
        }

        try {
            const data = this.db.export();
            await this.vault.adapter.writeBinary(this.dbFilePath, data);
            this.isDirty = false;
            console.log('Database saved to:', this.dbFilePath);
        } catch (error) {
            console.error('Failed to save database:', error);
            // Don't throw - allow operation to continue
        }
    }

    private setupPeriodicSave(): void {
        if (this.saveTimer) {
            clearInterval(this.saveTimer);
        }

        this.saveTimer = setInterval(async () => {
            if (this.isDirty) {
                await this.saveDatabase();
            }
        }, DATABASE_SAVE_INTERVAL_MS);
    }

    private markDirty(): void {
        this.isDirty = true;
    }

    async shutdown(): Promise<void> {
        if (this.saveTimer) {
            clearInterval(this.saveTimer);
            this.saveTimer = null;
        }

        if (this.isDirty) {
            await this.saveDatabase();
        }

        if (this.db) {
            this.db.close();
            this.db = null;
        }

        this.isInitialized = false;
    }

    private ensureInitialized(): void {
        if (!this.db) {
            throw new Error('Database not initialized');
        }
    }



    async initializeSources(): Promise<void> {
        this.ensureInitialized();

        // Ensure scan source exists
        const stmt = this.db.prepare('SELECT id FROM sources WHERE name = ?');
        const result = stmt.get(['scan']);
        
        if (!result || result.length === 0) {
            const insertStmt = this.db.prepare(`
                INSERT INTO sources (name, type, last_updated) 
                VALUES (?, ?, ?)
            `);
            insertStmt.run(['scan', 'scan', new Date().toISOString()]);
            insertStmt.free();
            this.markDirty();
        }

        stmt.free();
    }

    async calculateFileHash(contents: string): Promise<string> {
        return createHash('md5').update(contents).digest('hex');
    }

    async addOrUpdateWordListSource(filename: string, contents: string): Promise<number> {
        this.ensureInitialized();
        
        const hash = await this.calculateFileHash(contents);
        
        // Check if source exists
        const selectResult = this.db.exec('SELECT * FROM sources WHERE name = ?', [filename]);
        
        if (selectResult.length > 0 && selectResult[0].values.length > 0) {
            const row = selectResult[0].values[0];
            const existing: Source = {
                id: row[0] as number,
                name: row[1] as string,
                type: row[2] as "scan" | "word_list",
                last_updated: row[3] as string,
                checksum: row[4] as string || null,
                file_exists: row[5] !== null ? Boolean(row[5]) : null
            };
            
            if (existing.checksum !== hash) {
                // Delete all words from this source if hash changed
                await this.deleteWordsBySource(existing.id!);
                
                // Update source
                this.db.exec(`
                    UPDATE sources 
                    SET checksum = ?, last_updated = ?, file_exists = 1 
                    WHERE id = ?
                `, [hash, new Date().toISOString(), existing.id]);
                this.markDirty();
                
                new Notice(`Word list '${filename}' has changed and will be re-imported`);
            }
            return existing.id!;
        } else {
            // Create new source
            this.db.exec(`
                INSERT INTO sources (name, type, checksum, last_updated, file_exists) 
                VALUES (?, ?, ?, ?, 1)
            `, [filename, 'word_list', hash, new Date().toISOString()]);
            
            const result = this.db.exec('SELECT last_insert_rowid() as id');
            const insertId = result[0].values[0][0] as number;
            
            this.markDirty();
            return insertId;
        }
    }

    async markSourceFileStatus(filename: string, exists: boolean): Promise<void> {
        this.ensureInitialized();
        
        const selectStmt = this.db.prepare('SELECT * FROM sources WHERE name = ?');
        const row = selectStmt.get([filename]);
        
        if (row && row.length > 0) {
            const existing: Source = {
                id: row[0] as number,
                name: row[1] as string,
                type: row[2] as "scan" | "word_list",
                last_updated: row[3] as string,
                checksum: row[4] as string || null,
                file_exists: row[5] !== null ? Boolean(row[5]) : null
            };
            
            if (existing.file_exists !== exists) {
                const updateStmt = this.db.prepare(`
                    UPDATE sources 
                    SET file_exists = ?, last_updated = ? 
                    WHERE id = ?
                `);
                updateStmt.run([exists ? 1 : 0, new Date().toISOString(), existing.id]);
                this.markDirty();
                
                if (!exists) {
                    new Notice(`Word list '${filename}' no longer exists`);
                }
                
                updateStmt.free();
            }
        }
        
        selectStmt.free();
    }

    async addWord(word: string, sourceId: number): Promise<void> {
        this.ensureInitialized();
        
        const selectStmt = this.db.prepare('SELECT id FROM words WHERE word = ?');
        const existing = selectStmt.get([word]);
        
        if (!existing) {
            const insertStmt = this.db.prepare(`
                INSERT INTO words (word, first_letter, source_id, frequency, created_at) 
                VALUES (?, ?, ?, 1, ?)
            `);
            insertStmt.run([word, word.charAt(0), sourceId, new Date().toISOString()]);
            this.markDirty();
            insertStmt.free();
        }
        
        selectStmt.free();
    }

    async addOrIncrementWord(word: string, sourceId: number, incrementBy: number = 1): Promise<void> {
        this.ensureInitialized();
        
        const selectStmt = this.db.prepare('SELECT id, frequency FROM words WHERE word = ?');
        const row = selectStmt.get([word]);
        
        if (row && row.length > 0) {
            const existing = {
                id: row[0] as number,
                frequency: row[1] as number
            };
            const updateStmt = this.db.prepare('UPDATE words SET frequency = frequency + ? WHERE id = ?');
            updateStmt.run([incrementBy, existing.id]);
            updateStmt.free();
        } else {
            const insertStmt = this.db.prepare(`
                INSERT INTO words (word, first_letter, source_id, frequency, created_at) 
                VALUES (?, ?, ?, ?, ?)
            `);
            insertStmt.run([word, word.charAt(0), sourceId, incrementBy, new Date().toISOString()]);
            insertStmt.free();
        }
        
        this.markDirty();
        selectStmt.free();
    }

    async getWordsByFirstLetter(letter: string): Promise<string[]> {
        this.ensureInitialized();
        
        const results = this.db.exec(`
            SELECT word FROM words 
            WHERE first_letter = ? 
            ORDER BY frequency DESC, word ASC
        `, [letter]);
        
        if (results.length === 0) return [];
        
        return results[0].values.map(row => row[0] as string);
    }

    async getAllWordsGroupedByFirstLetter(): Promise<Map<string, Word[]>> {
        this.ensureInitialized();
        
        const results = this.db.exec(`
            SELECT id, word, first_letter, source_id, frequency, created_at 
            FROM words 
            ORDER BY first_letter, frequency DESC, word ASC
        `);
        
        if (results.length === 0) return new Map();
        
        const grouped = new Map<string, Word[]>();
        for (const row of results[0].values) {
            const word: Word = {
                id: row[0] as number,
                word: row[1] as string,
                first_letter: row[2] as string,
                source_id: row[3] as number,
                frequency: row[4] as number,
                created_at: row[5] as string
            };
            
            const firstLetter = word.first_letter!;
            if (!grouped.has(firstLetter)) {
                grouped.set(firstLetter, []);
            }
            grouped.get(firstLetter)!.push(word);
        }
        
        return grouped;
    }

    async getAllWordsBySource(sourceId: number): Promise<Map<string, Word[]>> {
        this.ensureInitialized();
        
        const results = this.db.exec(`
            SELECT id, word, first_letter, source_id, frequency, created_at 
            FROM words 
            WHERE source_id = ?
            ORDER BY first_letter, frequency DESC, word ASC
        `, [sourceId]);
        
        if (results.length === 0) return new Map();
        
        const grouped = new Map<string, Word[]>();
        for (const row of results[0].values) {
            const word: Word = {
                id: row[0] as number,
                word: row[1] as string,
                first_letter: row[2] as string,
                source_id: row[3] as number,
                frequency: row[4] as number,
                created_at: row[5] as string
            };
            
            const firstLetter = word.first_letter!;
            if (!grouped.has(firstLetter)) {
                grouped.set(firstLetter, []);
            }
            grouped.get(firstLetter)!.push(word);
        }
        
        return grouped;
    }

    private async deleteWordsBySource(sourceId: number): Promise<void> {
        this.ensureInitialized();
        
        const stmt = this.db.prepare('DELETE FROM words WHERE source_id = ?');
        stmt.run([sourceId]);
        stmt.free();
        this.markDirty();
    }

    async deleteScanWords(): Promise<void> {
        this.ensureInitialized();
        
        const sourceId = await this.getScanSourceId();
        if (sourceId) {
            await this.deleteWordsBySource(sourceId);
        }
    }

    async deleteAllWords(): Promise<void> {
        this.ensureInitialized();
        
        const stmt = this.db.prepare('DELETE FROM words');
        stmt.run();
        stmt.free();
        this.markDirty();
    }

    async addLatexCommand(command: string, description?: string): Promise<void> {
        this.ensureInitialized();
        
        const stmt = this.db.prepare(`
            INSERT OR IGNORE INTO latex_commands (command, first_letter, description, created_at) 
            VALUES (?, ?, ?, ?)
        `);
        stmt.run([command, command.charAt(0), description ?? null, new Date().toISOString()]);
        stmt.free();
        this.markDirty();
    }

    async getLatexCommandsByFirstLetter(letter: string, ignoreCase: boolean = true): Promise<LatexCommandRow[]> {
        this.ensureInitialized();
        
        const searchLetter = ignoreCase ? letter.toLowerCase() : letter;
        const results = this.db.exec(`
            SELECT id, command, first_letter, description, created_at 
            FROM latex_commands 
            WHERE first_letter = ?
        `, [searchLetter]);
        
        if (results.length === 0) return [];
        
        return results[0].values.map(row => ({
            id: row[0] as number,
            command: row[1] as string,
            first_letter: row[2] as string,
            description: row[3] as string,
            created_at: row[4] as string
        }));
    }

    async createWordList(name: string, description?: string): Promise<number> {
        this.ensureInitialized();
        
        const stmt = this.db.prepare(`
            INSERT INTO word_lists (name, description, enabled, created_at) 
            VALUES (?, ?, 1, ?)
        `);
        stmt.run([name, description ?? null, new Date().toISOString()]);
        stmt.free();
        this.markDirty();
        
        // Get the last inserted row ID
        const result = this.db.exec('SELECT last_insert_rowid() as id');
        return result[0].values[0][0] as number;
    }

    async getWordLists(): Promise<WordListRow[]> {
        this.ensureInitialized();
        
        const results = this.db.exec(`
            SELECT id, name, description, enabled, created_at 
            FROM word_lists 
            ORDER BY name
        `);
        
        if (results.length === 0) return [];
        
        return results[0].values.map(row => ({
            id: row[0] as number,
            name: row[1] as string,
            description: row[2] as string,
            enabled: Boolean(row[3]),
            created_at: row[4] as string
        }));
    }

    async addFrontMatterEntry(key: string, value: string, filePath?: string): Promise<void> {
        this.ensureInitialized();
        
        // Check if entry exists
        const selectStmt = this.db.prepare(`
            SELECT id, frequency FROM frontmatter 
            WHERE key = ? AND value = ? AND file_path = ?
        `);
        const row = selectStmt.get([key, value, filePath ?? null]);
        
        if (row && row.length > 0) {
            const existing = {
                id: row[0] as number,
                frequency: row[1] as number
            };
            // Increment frequency
            const updateStmt = this.db.prepare('UPDATE frontmatter SET frequency = frequency + 1 WHERE id = ?');
            updateStmt.run([existing.id]);
            updateStmt.free();
        } else {
            // Create new entry
            const insertStmt = this.db.prepare(`
                INSERT INTO frontmatter (key, value, file_path, frequency, created_at) 
                VALUES (?, ?, ?, 1, ?)
            `);
            insertStmt.run([key, value, filePath ?? null, new Date().toISOString()]);
            insertStmt.free();
        }
        
        selectStmt.free();
        this.markDirty();
    }

    async getFrontMatterSuggestions(key: string, prefix: string = ''): Promise<string[]> {
        this.ensureInitialized();
        
        const results = this.db.exec(`
            SELECT value FROM frontmatter 
            WHERE key = ? AND value LIKE ?
            ORDER BY frequency DESC 
            LIMIT 10
        `, [key, `${prefix}%`]);
        
        if (results.length === 0) return [];
        
        return results[0].values.map(row => row[0] as string);
    }

    async searchWords(query: string, ignoreCase: boolean = true): Promise<string[]> {
        this.ensureInitialized();
        
        const searchQuery = ignoreCase ? `%${query.toLowerCase()}%` : `%${query}%`;
        const results = this.db.exec(`
            SELECT DISTINCT word FROM words 
            WHERE ${ignoreCase ? 'LOWER(word)' : 'word'} LIKE ?
            ORDER BY word
        `, [searchQuery]);
        
        if (results.length === 0) return [];
        
        return results[0].values.map(row => row[0] as string);
    }

    async getWordCount(source: string = 'scan'): Promise<number> {
        this.ensureInitialized();
        
        const stmt = this.db.prepare('SELECT COUNT(*) as count FROM words');
        const row = stmt.get();
        stmt.free();
        
        return row ? (row[0] as number) : 0;
    }

    async getScanSourceId(): Promise<number | null> {
        this.ensureInitialized();
        
        const stmt = this.db.prepare('SELECT id FROM sources WHERE name = ?');
        const result = stmt.get(['scan']);
        stmt.free();
        
        return (result && result.length > 0) ? result[0] as number : null;
    }

    async getWordListSourceIds(): Promise<number[]> {
        this.ensureInitialized();
        
        const results = this.db.exec(`
            SELECT id FROM sources 
            WHERE type = 'word_list' AND file_exists = 1
        `);
        
        if (results.length === 0) return [];
        
        return results[0].values.map(row => row[0] as number);
    }
} 