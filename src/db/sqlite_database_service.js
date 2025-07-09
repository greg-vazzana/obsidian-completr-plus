"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SQLiteDatabaseService = void 0;
const obsidian_1 = require("obsidian");
const crypto_1 = require("crypto");
const sql_js_1 = require("sql.js");
const sqlite_schema_1 = require("./sqlite_schema");
class SQLiteDatabaseService {
    constructor(vault) {
        this.db = null;
        this.SQL = null;
        this.saveTimer = null;
        this.isDirty = false;
        this.isInitialized = false;
        this.SAVE_INTERVAL = 5 * 60 * 1000; // 5 minutes in milliseconds
        this.vault = vault;
        this.dbFilePath = `${this.vault.configDir}/plugins/obsidian-completr-plus/completr.db`;
    }
    async initialize() {
        if (this.isInitialized) {
            return;
        }
        try {
            // Initialize sql.js
            this.SQL = await (0, sql_js_1.default)({
                locateFile: (file) => {
                    if (file === 'sql-wasm.wasm') {
                        return 'sql-wasm.wasm';
                    }
                    return file;
                }
            });
            // Try to load existing database file
            await this.loadDatabase();
            // Set up periodic save
            this.setupPeriodicSave();
            this.isInitialized = true;
        }
        catch (error) {
            console.error('Failed to initialize SQLite database:', error);
            throw error;
        }
    }
    async loadDatabase() {
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
            }
            else {
                // Create new database
                this.db = new this.SQL.Database();
                console.log('Created new SQLite database');
            }
            // Ensure schema is up to date
            this.db.exec(sqlite_schema_1.SQLITE_SCHEMA);
            // Initialize required sources
            await this.initializeSources();
            // Save the database to ensure schema is persisted
            await this.saveDatabase();
        }
        catch (error) {
            console.error('Failed to load database, creating new one:', error);
            // Create new database on corruption
            this.db = new this.SQL.Database();
            this.db.exec(sqlite_schema_1.SQLITE_SCHEMA);
            await this.initializeSources();
            await this.saveDatabase();
        }
    }
    async saveDatabase() {
        if (!this.db) {
            return;
        }
        try {
            const data = this.db.export();
            await this.vault.adapter.writeBinary(this.dbFilePath, data);
            this.isDirty = false;
            console.log('Database saved to:', this.dbFilePath);
        }
        catch (error) {
            console.error('Failed to save database:', error);
            // Don't throw - allow operation to continue
        }
    }
    setupPeriodicSave() {
        if (this.saveTimer) {
            clearInterval(this.saveTimer);
        }
        this.saveTimer = setInterval(async () => {
            if (this.isDirty) {
                await this.saveDatabase();
            }
        }, this.SAVE_INTERVAL);
    }
    markDirty() {
        this.isDirty = true;
    }
    async shutdown() {
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
    ensureInitialized() {
        if (!this.db) {
            throw new Error('Database not initialized');
        }
    }
    async initializeSources() {
        this.ensureInitialized();
        // Ensure scan source exists
        const stmt = this.db.prepare('SELECT id FROM sources WHERE name = ?');
        const result = stmt.get(['scan']);
        if (!result) {
            const insertStmt = this.db.prepare(`
                INSERT INTO sources (name, type, last_updated) 
                VALUES (?, ?, ?)
            `);
            insertStmt.run(['scan', 'scan', new Date().toISOString()]);
            this.markDirty();
        }
        stmt.free();
    }
    async calculateFileHash(contents) {
        return (0, crypto_1.createHash)('md5').update(contents).digest('hex');
    }
    async addOrUpdateWordListSource(filename, contents) {
        this.ensureInitialized();
        const hash = await this.calculateFileHash(contents);
        // Check if source exists
        const selectResult = this.db.exec('SELECT * FROM sources WHERE name = ?', [filename]);
        if (selectResult.length > 0 && selectResult[0].values.length > 0) {
            const row = selectResult[0].values[0];
            const existing = {
                id: row[0],
                name: row[1],
                type: row[2],
                last_updated: row[3],
                checksum: row[4],
                file_exists: Boolean(row[5])
            };
            if (existing.checksum !== hash) {
                // Delete all words from this source if hash changed
                await this.deleteWordsBySource(existing.id);
                // Update source
                this.db.exec(`
                    UPDATE sources 
                    SET checksum = ?, last_updated = ?, file_exists = 1 
                    WHERE id = ?
                `, [hash, new Date().toISOString(), existing.id]);
                this.markDirty();
                new obsidian_1.Notice(`Word list '${filename}' has changed and will be re-imported`);
            }
            return existing.id;
        }
        else {
            // Create new source
            this.db.exec(`
                INSERT INTO sources (name, type, checksum, last_updated, file_exists) 
                VALUES (?, ?, ?, ?, 1)
            `, [filename, 'word_list', hash, new Date().toISOString()]);
            const result = this.db.exec('SELECT last_insert_rowid() as id');
            const insertId = result[0].values[0][0];
            this.markDirty();
            return insertId;
        }
    }
    async markSourceFileStatus(filename, exists) {
        this.ensureInitialized();
        const selectStmt = this.db.prepare('SELECT * FROM sources WHERE name = ?');
        const existing = selectStmt.get([filename]);
        if (existing && existing.file_exists !== exists) {
            const updateStmt = this.db.prepare(`
                UPDATE sources 
                SET file_exists = ?, last_updated = ? 
                WHERE id = ?
            `);
            updateStmt.run([exists ? 1 : 0, new Date().toISOString(), existing.id]);
            this.markDirty();
            if (!exists) {
                new obsidian_1.Notice(`Word list '${filename}' no longer exists`);
            }
            updateStmt.free();
        }
        selectStmt.free();
    }
    async addWord(word, sourceId) {
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
    async addOrIncrementWord(word, sourceId, incrementBy = 1) {
        this.ensureInitialized();
        const selectStmt = this.db.prepare('SELECT id, frequency FROM words WHERE word = ?');
        const existing = selectStmt.get([word]);
        if (existing) {
            const updateStmt = this.db.prepare('UPDATE words SET frequency = frequency + ? WHERE id = ?');
            updateStmt.run([incrementBy, existing.id]);
            updateStmt.free();
        }
        else {
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
    async getWordsByFirstLetter(letter) {
        this.ensureInitialized();
        const stmt = this.db.prepare(`
            SELECT word FROM words 
            WHERE first_letter = ? 
            ORDER BY frequency DESC, word ASC
        `);
        const results = stmt.all([letter]);
        stmt.free();
        return results.map(row => row.word);
    }
    async getAllWordsGroupedByFirstLetter() {
        this.ensureInitialized();
        const stmt = this.db.prepare(`
            SELECT id, word, first_letter, source_id, frequency, created_at 
            FROM words 
            ORDER BY first_letter, frequency DESC, word ASC
        `);
        const results = stmt.all();
        stmt.free();
        const grouped = new Map();
        for (const word of results) {
            const firstLetter = word.first_letter;
            if (!grouped.has(firstLetter)) {
                grouped.set(firstLetter, []);
            }
            grouped.get(firstLetter).push(word);
        }
        return grouped;
    }
    async getAllWordsBySource(sourceId) {
        this.ensureInitialized();
        const stmt = this.db.prepare(`
            SELECT id, word, first_letter, source_id, frequency, created_at 
            FROM words 
            WHERE source_id = ?
            ORDER BY first_letter, frequency DESC, word ASC
        `);
        const results = stmt.all([sourceId]);
        stmt.free();
        const grouped = new Map();
        for (const word of results) {
            const firstLetter = word.first_letter;
            if (!grouped.has(firstLetter)) {
                grouped.set(firstLetter, []);
            }
            grouped.get(firstLetter).push(word);
        }
        return grouped;
    }
    async deleteWordsBySource(sourceId) {
        this.ensureInitialized();
        const stmt = this.db.prepare('DELETE FROM words WHERE source_id = ?');
        stmt.run([sourceId]);
        stmt.free();
        this.markDirty();
    }
    async deleteScanWords() {
        this.ensureInitialized();
        const sourceId = await this.getScanSourceId();
        if (sourceId) {
            await this.deleteWordsBySource(sourceId);
        }
    }
    async deleteAllWords() {
        this.ensureInitialized();
        const stmt = this.db.prepare('DELETE FROM words');
        stmt.run();
        stmt.free();
        this.markDirty();
    }
    async addLatexCommand(command, description) {
        this.ensureInitialized();
        const stmt = this.db.prepare(`
            INSERT OR IGNORE INTO latex_commands (command, first_letter, description, created_at) 
            VALUES (?, ?, ?, ?)
        `);
        stmt.run([command, command.charAt(0), description, new Date().toISOString()]);
        stmt.free();
        this.markDirty();
    }
    async getLatexCommandsByFirstLetter(letter, ignoreCase = true) {
        this.ensureInitialized();
        const searchLetter = ignoreCase ? letter.toLowerCase() : letter;
        const stmt = this.db.prepare(`
            SELECT id, command, first_letter, description, created_at 
            FROM latex_commands 
            WHERE first_letter = ?
        `);
        const results = stmt.all([searchLetter]);
        stmt.free();
        return results;
    }
    async createWordList(name, description) {
        this.ensureInitialized();
        const stmt = this.db.prepare(`
            INSERT INTO word_lists (name, description, enabled, created_at) 
            VALUES (?, ?, 1, ?)
        `);
        const result = stmt.run([name, description, new Date().toISOString()]);
        stmt.free();
        this.markDirty();
        return result.lastInsertRowid;
    }
    async getWordLists() {
        this.ensureInitialized();
        const stmt = this.db.prepare(`
            SELECT id, name, description, enabled, created_at 
            FROM word_lists 
            ORDER BY name
        `);
        const results = stmt.all();
        stmt.free();
        return results;
    }
    async addFrontMatterEntry(key, value, filePath) {
        this.ensureInitialized();
        // Check if entry exists
        const selectStmt = this.db.prepare(`
            SELECT id, frequency FROM frontmatter 
            WHERE key = ? AND value = ? AND file_path = ?
        `);
        const existing = selectStmt.get([key, value, filePath]);
        if (existing) {
            // Increment frequency
            const updateStmt = this.db.prepare('UPDATE frontmatter SET frequency = frequency + 1 WHERE id = ?');
            updateStmt.run([existing.id]);
            updateStmt.free();
        }
        else {
            // Create new entry
            const insertStmt = this.db.prepare(`
                INSERT INTO frontmatter (key, value, file_path, frequency, created_at) 
                VALUES (?, ?, ?, 1, ?)
            `);
            insertStmt.run([key, value, filePath, new Date().toISOString()]);
            insertStmt.free();
        }
        selectStmt.free();
        this.markDirty();
    }
    async getFrontMatterSuggestions(key, prefix = '') {
        this.ensureInitialized();
        const stmt = this.db.prepare(`
            SELECT value FROM frontmatter 
            WHERE key = ? AND value LIKE ?
            ORDER BY frequency DESC 
            LIMIT 10
        `);
        const results = stmt.all([key, `${prefix}%`]);
        stmt.free();
        return results.map(row => row.value);
    }
    async searchWords(query, ignoreCase = true) {
        this.ensureInitialized();
        const searchQuery = ignoreCase ? `%${query.toLowerCase()}%` : `%${query}%`;
        const stmt = this.db.prepare(`
            SELECT DISTINCT word FROM words 
            WHERE ${ignoreCase ? 'LOWER(word)' : 'word'} LIKE ?
            ORDER BY word
        `);
        const results = stmt.all([searchQuery]);
        stmt.free();
        return results.map(row => row.word);
    }
    async getWordCount(source = 'scan') {
        this.ensureInitialized();
        const stmt = this.db.prepare('SELECT COUNT(*) as count FROM words');
        const result = stmt.get();
        stmt.free();
        return result.count;
    }
    async getScanSourceId() {
        this.ensureInitialized();
        const stmt = this.db.prepare('SELECT id FROM sources WHERE name = ?');
        const result = stmt.get(['scan']);
        stmt.free();
        return result ? result.id : null;
    }
    async getWordListSourceIds() {
        this.ensureInitialized();
        const stmt = this.db.prepare(`
            SELECT id FROM sources 
            WHERE type = 'word_list' AND file_exists = 1
        `);
        const results = stmt.all();
        stmt.free();
        return results.map(row => row.id);
    }
}
exports.SQLiteDatabaseService = SQLiteDatabaseService;
