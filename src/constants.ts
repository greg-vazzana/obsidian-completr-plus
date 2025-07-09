/**
 * Internal application constants
 * 
 * This file contains only internal performance, timing, and technical constants
 * that are not user-configurable. User-configurable values should remain in 
 * settings.ts and be accessed via settings.*
 */

// =============================================================================
// PERFORMANCE & TIMING CONSTANTS
// =============================================================================

/** Delay for batching live word tracking database updates (1 second) */
export const LIVE_WORD_TRACKER_BATCH_DELAY_MS = 1000;

/** Debounce delay for NLP capitalization operations (100ms) */
export const NLP_CAPITALIZATION_DEBOUNCE_MS = 100;

/** Database save interval (5 minutes) */
export const DATABASE_SAVE_INTERVAL_MS = 5 * 60 * 1000;

// =============================================================================
// UI FEEDBACK CONSTANTS
// =============================================================================

/** Duration for success notices (4 seconds) */
export const SUCCESS_NOTICE_DURATION_MS = 4000;

/** Duration for error notices (3 seconds) */
export const ERROR_NOTICE_DURATION_MS = 3000;

// =============================================================================
// TECHNICAL LIMITS
// =============================================================================

/** Buffer size for file encoding detection */
export const FILE_ENCODING_DETECTION_BUFFER_SIZE = 1024;

/** Batch size for file processing operations */
export const FILE_PROCESSING_BATCH_SIZE = 50;

// =============================================================================
// DEBUG & DISPLAY CONSTANTS
// =============================================================================

/** Maximum length for debug sentence display */
export const DEBUG_SENTENCE_MAX_LENGTH = 50;

/** Maximum length for debug full text display */
export const DEBUG_FULL_TEXT_MAX_LENGTH = 200;

// =============================================================================
// APPLICATION LOGIC CONSTANTS
// =============================================================================

/** Multiplier for word frequency in suggestion rating calculation */
export const WORD_FREQUENCY_RATING_MULTIPLIER = 1000;

/** Maximum number of front matter suggestions to return */
export const MAX_FRONT_MATTER_SUGGESTIONS = 10;

// =============================================================================
// FILE PATH CONSTANTS
// =============================================================================

/** Plugin data directory path segment */
export const PLUGIN_DATA_PATH = "/plugins/obsidian-completr-plus/";

/** Configuration file names */
export const CONFIG_FILES = {
    LATEX_COMMANDS: "latex_commands.json",
    CALLOUT_SUGGESTIONS: "callout_suggestions.json",
    IGNORELIST: "ignored_suggestions.txt",
    DATABASE: "completr.db",
    WASM_FILE: "sql-wasm.wasm"
} as const;

/** Folder names within plugin directory */
export const FOLDERS = {
    WORD_LISTS: "wordLists"
} as const;

// =============================================================================
// REGEX PATTERNS
// =============================================================================

/** Common regex patterns used across the codebase */
export const PATTERNS = {
    NEW_LINE: /\r?\n/,
    BLOCKQUOTE_PREFIX: /^(?:[ \t]*>[ \t]*)+/,
    // @ts-ignore: ES2022 'd' flag required for indices property
    CALLOUT_HEADER: /^(\[!?([^\]]*)\])([+-]?)([ \t]*)(.*)$/d,      // ES2022 'd' flag for indices
    // @ts-ignore: ES2022 'd' flag required for indices property
    CALLOUT_HEADER_PARTIAL: /^(\[!?([^\]]*))$/d                   // ES2022 'd' flag for indices
} as const;

// =============================================================================
// DATABASE CONSTANTS
// =============================================================================

/** Database source type constants */
export const DATABASE_SOURCE_TYPES = {
    SCAN: "scan",
    WORD_LIST: "word_list"
} as const;

/** Database source names */
export const DATABASE_SOURCE_NAMES = {
    SCAN: "scan"
} as const;

// =============================================================================
// ERROR MESSAGE TEMPLATES
// =============================================================================

/** Reusable error message templates */
export const ERROR_MESSAGES = {
    INVALID_JSON_ARRAY: (file: string) => `Invalid suggestions file ${file}: JSON root must be array.`,
    NEWLINE_IN_DISPLAY_NAME: (name: string) => `Display name cannot contain a newline: ${name}`,
    PARSE_ERROR: (file: string, type: string) => `Completr ${type} parse error`,
    FILE_READ_ERROR: (file: string) => `Completr: Unable to read ${file}`,
    DATABASE_NOT_INITIALIZED: 'Database not initialized',
    PROVIDER_NOT_INITIALIZED: (provider: string) => `${provider} provider not properly initialized: db not set`,
    FAILED_TO_PARSE_WITH_FALLBACK: (file: string, fallback: string) => `Failed to parse ${file}. Using ${fallback}.`
} as const;

// =============================================================================
// VALIDATION CONSTANTS
// =============================================================================

/** Characters and patterns for validation */
export const VALIDATION = {
    NEWLINE_CHAR: "\n",
    BACKSLASH_CHAR: "\\",
    DOLLAR_CHAR: "$"
} as const; 