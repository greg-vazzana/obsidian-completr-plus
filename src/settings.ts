import { Vault } from "obsidian";

export const enum WordInsertionMode {
    MATCH_CASE_REPLACE = "Match-Case & Replace",
    IGNORE_CASE_REPLACE = "Ignore-Case & Replace",
    IGNORE_CASE_APPEND = "Ignore-Case & Append"
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
}

export const DEFAULT_SETTINGS: CompletrSettings = {
    characterRegex: "a-zA-ZöäüÖÄÜß",
    maxLookBackDistance: 50,
    autoFocus: true,
    autoTrigger: true,
    minWordLength: 2,
    minWordTriggerLength: 3,
    maxSuggestions: 20,
    wordInsertionMode: WordInsertionMode.IGNORE_CASE_REPLACE,
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
}

export function intoCompletrPath(vault: Vault, ...path: string[]): string {
    return vault.configDir + "/plugins/obsidian-completr-plus/" + path.join("/");
}
