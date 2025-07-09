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