import { Vault } from "obsidian";
import { FileUtils } from "./utils/file_utils";

export const enum WordInsertionMode {
    REPLACE = "Replace word",  // Replace entire word with suggestion (preserving case)
    APPEND = "Complete word"   // Append remaining letters to existing word
}

export const enum CalloutProviderSource {
    COMPLETR = "Completr",
    CALLOUT_MANAGER = "Callout Manager",
}

export interface CompletrSettings {
    characterRegex: string,
    maxLookBackDistance: number,
    autoFocus: boolean,
    autoTrigger: boolean,
    minWordLength: number,
    minWordTriggerLength: number,
    maxSuggestions: number,
    wordInsertionMode: WordInsertionMode,
    ignoreDiacriticsWhenFiltering: boolean,
    insertSpaceAfterComplete: boolean,
    insertPeriodAfterSpaces: boolean,
    latexProviderEnabled: boolean,
    latexTriggerInCodeBlocks: boolean,
    latexMinWordTriggerLength: number,
    latexIgnoreCase: boolean,
    scanEnabled: boolean,
    liveWordTracking: boolean,
    wordListProviderEnabled: boolean,
    frontMatterProviderEnabled: boolean,
    frontMatterTagAppendSuffix: boolean,
    frontMatterIgnoreCase: boolean,
    calloutProviderEnabled: boolean,
    calloutProviderSource: CalloutProviderSource,
    autoCapitalizeLines: boolean,
    autoCapitalizeSentences: boolean,
    preserveMixedCaseWords: boolean,
    debugCapitalization: boolean,
    enableFuzzyMatching: boolean,
}

export const DEFAULT_SETTINGS: CompletrSettings = {
    characterRegex: "a-zA-ZöäüÖÄÜß",
    maxLookBackDistance: 50,
    autoFocus: true,
    autoTrigger: true,
    minWordLength: 2,
    minWordTriggerLength: 2,
    maxSuggestions: 20,
    wordInsertionMode: WordInsertionMode.REPLACE,
    ignoreDiacriticsWhenFiltering: false,
    insertSpaceAfterComplete: false,
    insertPeriodAfterSpaces: false,
    latexProviderEnabled: true,
    latexTriggerInCodeBlocks: true,
    latexMinWordTriggerLength: 2,
    latexIgnoreCase: false,
    scanEnabled: true,
    liveWordTracking: true,
    wordListProviderEnabled: true,
    frontMatterProviderEnabled: true,
    frontMatterTagAppendSuffix: true,
    frontMatterIgnoreCase: true,
    calloutProviderEnabled: true,
    calloutProviderSource: CalloutProviderSource.COMPLETR,
    autoCapitalizeLines: true,
    autoCapitalizeSentences: true,
    preserveMixedCaseWords: true,
    debugCapitalization: false,
    enableFuzzyMatching: true,
}


