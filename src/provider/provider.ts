import { EditorPosition, EditorSuggestContext } from "obsidian";
import { CompletrSettings } from "../settings";
import { TextUtils } from "../utils/text_utils";

export type MatchType = 'exact' | 'fuzzy';

export interface HighlightRange {
    start: number;
    end: number;
}

export class Suggestion {
    displayName: string;
    replacement: string;
    overrideStart?: EditorPosition;
    overrideEnd?: EditorPosition;
    icon?: string;
    color?: string;
    frequency?: number;
    matchType?: MatchType;
    highlightRanges?: HighlightRange[];
    originalQueryCase?: string; // Track original query case

    constructor(displayName: string, replacement: string, overrideStart?: EditorPosition, overrideEnd?: EditorPosition, opts?: {
        icon?: string,
        color?: string,
        frequency?: number,
        matchType?: MatchType,
        highlightRanges?: HighlightRange[],
        originalQueryCase?: string,
    }) {
        this.displayName = displayName;
        this.replacement = replacement;
        this.overrideStart = overrideStart;
        this.overrideEnd = overrideEnd;
        this.icon = opts?.icon;
        this.color = opts?.color;
        this.frequency = opts?.frequency;
        this.matchType = opts?.matchType;
        this.highlightRanges = opts?.highlightRanges;
        this.originalQueryCase = opts?.originalQueryCase;
    }

    static fromString(suggestion: string, overrideStart?: EditorPosition): Suggestion {
        return new Suggestion(suggestion, suggestion, overrideStart);
    }

    getDisplayNameLowerCase(lowerCase: boolean): string {
        return TextUtils.maybeLowerCase(this.displayName, lowerCase);
    }

    derive(options: Partial<typeof this>) {
        const derived = new Suggestion(
            options.displayName ?? this.displayName,
            options.replacement ?? this.replacement,
            options.overrideStart ?? this.overrideStart,
            options.overrideEnd ?? this.overrideEnd,
            {
                icon: options.icon ?? this.icon,
                color: options.color ?? this.color,
                frequency: options.frequency ?? this.frequency,
                matchType: options.matchType ?? this.matchType,
                highlightRanges: options.highlightRanges ?? this.highlightRanges,
                originalQueryCase: options.originalQueryCase ?? this.originalQueryCase,
            }
        );

        return derived;
    }

    /**
     * Gets the replacement text while preserving the case of the original query
     * @returns The replacement text with preserved case if originalQueryCase is set
     */
    getReplacementWithPreservedCase(): string {
        if (!this.originalQueryCase) {
            return this.replacement;
        }

        // If the original query was uppercase, make the replacement uppercase
        if (this.originalQueryCase === this.originalQueryCase.toUpperCase()) {
            return this.replacement.toUpperCase();
        }

        // If the original query started with uppercase, capitalize the replacement
        if (this.originalQueryCase[0] === this.originalQueryCase[0].toUpperCase()) {
            return this.replacement[0].toUpperCase() + this.replacement.slice(1);
        }

        // Otherwise, use lowercase
        return this.replacement.toLowerCase();
    }
}

export interface SuggestionContext extends EditorSuggestContext {
    separatorChar: string;
}

export interface SuggestionProvider {
    blocksAllOtherProviders?: boolean,

    getSuggestions(context: SuggestionContext, settings: CompletrSettings): Suggestion[],
}
