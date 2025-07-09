# SQLite Database Schema

## Overview

This directory contains the SQLite database implementation for Completr Plus. The schema is designed to match the existing TypeScript interfaces while providing better performance and cross-platform compatibility.

## Schema Files

- `sqlite_schema.sql` - Raw SQL schema file for reference
- `sqlite_schema.ts` - TypeScript exports for programmatic use
- `database.ts` - Original IndexedDB implementation (for reference)

## Database Tables

### 1. `sources`
Tracks scan and word list sources.

**Columns:**
- `id` - Primary key (auto-increment)
- `name` - Unique source name ("scan" or filename)
- `type` - Source type ("scan" or "word_list")
- `last_updated` - ISO timestamp of last update
- `checksum` - MD5 hash for word_list files
- `file_exists` - Boolean indicating if file exists

### 2. `words`
Stores individual words with frequency tracking.

**Columns:**
- `id` - Primary key (auto-increment)
- `word` - Unique word text
- `first_letter` - First letter (for indexed lookups)
- `source_id` - Foreign key to sources table
- `frequency` - Usage frequency counter
- `created_at` - Timestamp of creation

### 3. `latex_commands`
Stores LaTeX commands with descriptions.

**Columns:**
- `id` - Primary key (auto-increment)
- `command` - Unique LaTeX command
- `first_letter` - First letter (for indexed lookups)
- `description` - Optional command description
- `created_at` - Timestamp of creation

### 4. `frontmatter`
Stores YAML front matter key-value pairs with frequency.

**Columns:**
- `id` - Primary key (auto-increment)
- `key` - YAML key name
- `value` - YAML value
- `file_path` - Optional file path where found
- `frequency` - Usage frequency counter
- `created_at` - Timestamp of creation

### 5. `word_lists`
Metadata about word list files.

**Columns:**
- `id` - Primary key (auto-increment)
- `name` - Unique word list name
- `description` - Optional description
- `enabled` - Boolean indicating if enabled
- `created_at` - Timestamp of creation

## Performance Optimizations

### Indexes
- **First letter indexes**: Fast lookups for auto-completion
- **Frequency indexes**: Sorted by usage frequency
- **Foreign key indexes**: Efficient joins and cascades
- **Composite indexes**: Multi-column lookups (key+value, key+value+file)

### Design Decisions
- **UNIQUE constraints**: Prevent duplicate entries
- **CASCADE deletions**: Automatic cleanup when sources are deleted
- **CHECK constraints**: Enforce valid source types
- **Default values**: Sensible defaults for optional fields

## Improvements over IndexedDB

1. **Cross-platform compatibility**: Database file travels with vault
2. **Better performance**: Optimized SQL queries vs IndexedDB transactions
3. **Complete functionality**: Includes missing frontmatter and word_lists tables
4. **Better tooling**: Standard SQL tools for debugging and inspection
5. **ACID transactions**: Better data integrity guarantees

## Migration Notes

The SQLite schema includes the `frontmatter` and `word_lists` tables that were missing from the original IndexedDB implementation. This fixes broken functionality in the existing codebase.

## Testing

The schema has been validated with sql.js to ensure:
- All tables create successfully
- All indexes are created properly
- Basic insert/select operations work
- Foreign key constraints are enforced
- Check constraints validate data 