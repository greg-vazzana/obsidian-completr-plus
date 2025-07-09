// SQLite Schema for Completr Plus Database
// This schema matches the TypeScript interfaces and includes all required tables

export const SQLITE_SCHEMA = `
-- Sources table: tracks scan and word list sources
CREATE TABLE IF NOT EXISTS sources (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('scan', 'word_list')),
    last_updated TEXT NOT NULL,
    checksum TEXT,
    file_exists BOOLEAN DEFAULT 1
);

-- Words table: stores individual words with frequency tracking
CREATE TABLE IF NOT EXISTS words (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    word TEXT UNIQUE NOT NULL,
    first_letter TEXT NOT NULL,
    source_id INTEGER NOT NULL,
    frequency INTEGER DEFAULT 1,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (source_id) REFERENCES sources(id) ON DELETE CASCADE
);

-- LaTeX commands table: stores LaTeX commands with descriptions
CREATE TABLE IF NOT EXISTS latex_commands (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    command TEXT UNIQUE NOT NULL,
    first_letter TEXT NOT NULL,
    description TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Front matter table: stores YAML front matter key-value pairs with frequency
CREATE TABLE IF NOT EXISTS frontmatter (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    file_path TEXT,
    frequency INTEGER DEFAULT 1,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Word lists table: metadata about word list files
CREATE TABLE IF NOT EXISTS word_lists (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    description TEXT,
    enabled BOOLEAN DEFAULT 1,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance optimization
-- Sources indexes
CREATE INDEX IF NOT EXISTS idx_sources_name ON sources(name);
CREATE INDEX IF NOT EXISTS idx_sources_type ON sources(type);

-- Words indexes (matching IndexedDB indexes)
CREATE INDEX IF NOT EXISTS idx_words_word ON words(word);
CREATE INDEX IF NOT EXISTS idx_words_first_letter ON words(first_letter);
CREATE INDEX IF NOT EXISTS idx_words_source_id ON words(source_id);
CREATE INDEX IF NOT EXISTS idx_words_frequency ON words(frequency DESC);

-- LaTeX commands indexes
CREATE INDEX IF NOT EXISTS idx_latex_first_letter ON latex_commands(first_letter);
CREATE INDEX IF NOT EXISTS idx_latex_command ON latex_commands(command);

-- Front matter indexes
CREATE INDEX IF NOT EXISTS idx_frontmatter_key ON frontmatter(key);
CREATE INDEX IF NOT EXISTS idx_frontmatter_key_value ON frontmatter(key, value);
CREATE INDEX IF NOT EXISTS idx_frontmatter_key_value_file ON frontmatter(key, value, file_path);
CREATE INDEX IF NOT EXISTS idx_frontmatter_frequency ON frontmatter(frequency DESC);

-- Word lists indexes
CREATE INDEX IF NOT EXISTS idx_word_lists_name ON word_lists(name);
CREATE INDEX IF NOT EXISTS idx_word_lists_enabled ON word_lists(enabled);
`;

// Individual table creation statements for more granular control
export const TABLE_SCHEMAS = {
    sources: `
        CREATE TABLE IF NOT EXISTS sources (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE NOT NULL,
            type TEXT NOT NULL CHECK (type IN ('scan', 'word_list')),
            last_updated TEXT NOT NULL,
            checksum TEXT,
            file_exists BOOLEAN DEFAULT 1
        );
    `,
    words: `
        CREATE TABLE IF NOT EXISTS words (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            word TEXT UNIQUE NOT NULL,
            first_letter TEXT NOT NULL,
            source_id INTEGER NOT NULL,
            frequency INTEGER DEFAULT 1,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (source_id) REFERENCES sources(id) ON DELETE CASCADE
        );
    `,
    latex_commands: `
        CREATE TABLE IF NOT EXISTS latex_commands (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            command TEXT UNIQUE NOT NULL,
            first_letter TEXT NOT NULL,
            description TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        );
    `,
    frontmatter: `
        CREATE TABLE IF NOT EXISTS frontmatter (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            key TEXT NOT NULL,
            value TEXT NOT NULL,
            file_path TEXT,
            frequency INTEGER DEFAULT 1,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        );
    `,
    word_lists: `
        CREATE TABLE IF NOT EXISTS word_lists (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE NOT NULL,
            description TEXT,
            enabled BOOLEAN DEFAULT 1,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        );
    `
};

// Index creation statements
export const INDEX_SCHEMAS = {
    sources: [
        'CREATE INDEX IF NOT EXISTS idx_sources_name ON sources(name);',
        'CREATE INDEX IF NOT EXISTS idx_sources_type ON sources(type);'
    ],
    words: [
        'CREATE INDEX IF NOT EXISTS idx_words_word ON words(word);',
        'CREATE INDEX IF NOT EXISTS idx_words_first_letter ON words(first_letter);',
        'CREATE INDEX IF NOT EXISTS idx_words_source_id ON words(source_id);',
        'CREATE INDEX IF NOT EXISTS idx_words_frequency ON words(frequency DESC);'
    ],
    latex_commands: [
        'CREATE INDEX IF NOT EXISTS idx_latex_first_letter ON latex_commands(first_letter);',
        'CREATE INDEX IF NOT EXISTS idx_latex_command ON latex_commands(command);'
    ],
    frontmatter: [
        'CREATE INDEX IF NOT EXISTS idx_frontmatter_key ON frontmatter(key);',
        'CREATE INDEX IF NOT EXISTS idx_frontmatter_key_value ON frontmatter(key, value);',
        'CREATE INDEX IF NOT EXISTS idx_frontmatter_key_value_file ON frontmatter(key, value, file_path);',
        'CREATE INDEX IF NOT EXISTS idx_frontmatter_frequency ON frontmatter(frequency DESC);'
    ],
    word_lists: [
        'CREATE INDEX IF NOT EXISTS idx_word_lists_name ON word_lists(name);',
        'CREATE INDEX IF NOT EXISTS idx_word_lists_enabled ON word_lists(enabled);'
    ]
};

// Database version for schema migrations (if needed in the future)
export const SCHEMA_VERSION = 1; 