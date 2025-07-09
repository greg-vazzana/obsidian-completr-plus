import { Editor, EditorPosition } from "obsidian";
import { WordPatterns } from "../word_patterns";

/**
 * Validation and type checking utilities for the Completr plugin
 */
export class ValidationUtils {
    /**
     * Check if editor position is in front matter block
     * @param editor - The editor instance
     * @param pos - The position to check
     * @returns True if position is in front matter block
     */
    static isInFrontMatterBlock(editor: Editor, pos: EditorPosition): boolean {
        if (pos.line === 0) {
            return false;
        }

        const bounds = ValidationUtils.getFrontMatterBounds(editor);
        if (!bounds) {
            return false;
        }

        return pos.line > bounds.startLine && pos.line < bounds.endLine;
    }

    /**
     * Get the bounds of the front matter block
     * @param editor - The editor instance
     * @returns The start and end line of front matter, or null if not found
     */
    static getFrontMatterBounds(editor: Editor): { startLine: number, endLine: number } | null {
        let startLine = -1;
        // Find start within first 5 lines
        for (let i = 0; i < Math.min(5, editor.lastLine()); i++) {
            if (editor.getLine(i) !== "---") {
                continue;
            }
            startLine = i;
            break;
        }

        if (startLine === -1) {
            return null;
        }

        let endLine = -1;
        // Find end within next 50 lines
        for (let i = startLine + 1; i <= Math.min(50, editor.lastLine()); i++) {
            if (editor.getLine(i) !== "---") {
                continue;
            }
            endLine = i;
            break;
        }

        if (endLine === -1) {
            return null;
        }

        return { startLine, endLine };
    }

    /**
     * Check if a string is null, undefined, or empty
     * @param str - The string to check
     * @returns True if string is null, undefined, or empty
     */
    static isNullOrEmpty(str: string | null | undefined): boolean {
        return str == null || str === "";
    }

    /**
     * Check if a string is null, undefined, empty, or whitespace only
     * @param str - The string to check
     * @returns True if string is null, undefined, empty, or whitespace only
     */
    static isNullOrWhitespace(str: string | null | undefined): boolean {
        return str == null || str.trim() === "";
    }

    /**
     * Check if a character is a word character
     * @param char - The character to check
     * @returns True if character is a word character
     */
    static isWordCharacter(char: string): boolean {
        return WordPatterns.isWordCharacter(char);
    }

    /**
     * Validate that a number is within a given range
     * @param value - The value to check
     * @param min - The minimum value (inclusive)
     * @param max - The maximum value (inclusive)
     * @returns True if value is within range
     */
    static isInRange(value: number, min: number, max: number): boolean {
        return value >= min && value <= max;
    }

    /**
     * Check if an array is null, undefined, or empty
     * @param arr - The array to check
     * @returns True if array is null, undefined, or empty
     */
    static isArrayNullOrEmpty<T>(arr: T[] | null | undefined): boolean {
        return arr == null || arr.length === 0;
    }

    /**
     * Check if an object has a property
     * @param obj - The object to check
     * @param prop - The property name
     * @returns True if object has the property
     */
    static hasProperty<T>(obj: T, prop: string): boolean {
        return obj != null && Object.prototype.hasOwnProperty.call(obj, prop);
    }

    /**
     * Safe property access with default value
     * @param obj - The object to access
     * @param prop - The property name
     * @param defaultValue - The default value if property doesn't exist
     * @returns The property value or default value
     */
    static safeGet<T, K extends keyof T>(obj: T | null | undefined, prop: K, defaultValue: T[K]): T[K] {
        return obj?.[prop] ?? defaultValue;
    }
} 