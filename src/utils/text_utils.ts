/**
 * Text processing utilities for the Completr plugin
 */
export class TextUtils {
    private static readonly DIACRITICS_REGEX = /[\u0300-\u036f]/g;

    /**
     * Conditionally convert string to lowercase
     * @param str - The string to process
     * @param lowerCase - Whether to convert to lowercase
     * @returns The processed string
     */
    static maybeLowerCase(str: string, lowerCase: boolean): string {
        return lowerCase ? str.toLowerCase() : str;
    }

    /**
     * Remove diacritics from string (e.g., "café" → "cafe")
     * @param str - The string to process
     * @returns The string with diacritics removed
     */
    static removeDiacritics(str: string): string {
        return str.normalize("NFD").replace(TextUtils.DIACRITICS_REGEX, "");
    }

    /**
     * Get substring until delimiter
     * @param str - The string to process
     * @param delimiter - The delimiter to stop at
     * @returns The substring before the delimiter
     */
    static substringUntil(str: string, delimiter: string): string {
        const index = str.indexOf(delimiter);
        if (index === -1) {
            return str;
        }
        return str.substring(0, index);
    }

    /**
     * Check if string matches another string at a specific position
     * @param str - The string to check
     * @param toMatch - The string to match
     * @param from - The starting position
     * @returns True if strings match at the position
     */
    static substringMatches(str: string, toMatch: string, from: number): boolean {
        const bound = from + toMatch.length;
        for (let i = from; i < bound; i++) {
            if (str.charAt(i) !== toMatch.charAt(i - from)) {
                return false;
            }
        }
        return true;
    }

    /**
     * Filter an iterable into an array using predicate and map functions
     * @param array - The target array to populate
     * @param iterable - The source iterable
     * @param predicate - Function to filter items
     * @param map - Function to transform items
     */
    static filterMapIntoArray<T, U>(
        array: Array<T>, 
        iterable: Iterable<U>, 
        predicate: (val: U) => boolean, 
        map: (val: U) => T
    ): void {
        for (let val of iterable) {
            if (!predicate(val)) {
                continue;
            }
            array.push(map(val));
        }
    }

    /**
     * Find index of first element matching predicate
     * @param arr - The array to search
     * @param predicate - Function to test elements
     * @param fromIndex - Starting index (default: 0)
     * @returns Index of first matching element, or -1 if not found
     */
    static indexOf<T>(arr: T[], predicate: (element: T) => boolean, fromIndex: number = 0): number {
        for (let i = fromIndex; i < arr.length; i++) {
            if (predicate(arr[i])) {
                return i;
            }
        }
        return -1;
    }
} 