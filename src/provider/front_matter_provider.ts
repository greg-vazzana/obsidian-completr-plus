import { Suggestion, SuggestionContext, SuggestionProvider } from "./provider";
import { CompletrSettings } from "../settings";
import { CachedMetadata, Editor, getAllTags, MetadataCache, TFile } from "obsidian";
import { EditorUtils } from "../utils/editor_utils";
import { TextUtils } from "../utils/text_utils";
import { ValidationUtils } from "../utils/validation_utils";

const BASE_SUGGESTION = new Suggestion(
    "front-matter",
    "---\n~\n---",
    { line: 0, ch: 0 }
);

const PUBLISH_SUGGESTION = new Suggestion(
    "publish: #",
    "publish: ~"
);

function findTagCompletionType(keyInfo: YAMLKeyInfo, editor: Editor, currentLineIndex: number, currentLine: string, ignoreCase: boolean): "inline" | "multiline" | "none" {
    const key = TextUtils.maybeLowerCase(keyInfo.key, ignoreCase);
    const isList = keyInfo.isList;

    //Easy case
    if (currentLine.startsWith(key + ": "))
        return "inline";
    //Check for YAML multi-line list
    if (!currentLine.trimStart().startsWith("- ") || !isList)
        return "none";

    let foundListStart = false;
    for (let i = currentLineIndex - 1; i >= 1; i--) {
        let line = editor.getLine(i).trim();
        //Found YAML key
        if (line.endsWith(":")) {
            //Check if we found the correct key
            foundListStart = line.startsWith(key + ":");
            break;
        }
    }

    return foundListStart ? "multiline" : "none";
}

class YAMLKeyInfo {
    key: string;
    isList: boolean;
    completions: Set<string>;

    constructor(key: string) {
        this.key = key;
        this.completions = new Set<string>();
    }

    addCompletion(value: string) {
        this.completions.add(value);
    }
}

class YAMLKeyCache {
    private readonly keyMap: Map<string, YAMLKeyInfo> = new Map<string, YAMLKeyInfo>();

    addEntry(key: string, value: string) {
        let info = this.keyMap.get(key);
        if (!info)
            this.keyMap.set(key, (info = new YAMLKeyInfo(key)));

        info.addCompletion(value);
    }

    addEntries(key: string, values: string[]) {
        let info = this.keyMap.get(key);
        if (!info)
            this.keyMap.set(key, (info = new YAMLKeyInfo(key)));

        for (let value of values) {
            if (!value)
                continue;

            info.addCompletion(value);
        }

        info.isList = true;
    }

    getCompletions(): IterableIterator<YAMLKeyInfo> {
        return this.keyMap.values();
    }
}

class FrontMatterSuggestionProvider implements SuggestionProvider {
    blocksAllOtherProviders: boolean = true;

    private fileSuggestionCache: Map<string, YAMLKeyCache> = new Map<string, YAMLKeyCache>();

    getSuggestions(context: SuggestionContext, settings: CompletrSettings): Suggestion[] {
        if (!settings.frontMatterProviderEnabled)
            return [];

        const firstLine = context.editor.getLine(0);
        const isInFrontMatter = ValidationUtils.isInFrontMatterBlock(context.editor, context.start);
        const ignoreCase = settings.frontMatterIgnoreCase;

        if (!isInFrontMatter && context.start.line === 0 && (firstLine === "" || "front-matter".startsWith(TextUtils.maybeLowerCase(firstLine, ignoreCase)))) {
            return [BASE_SUGGESTION];
        } else if (!isInFrontMatter) {
            return [];
        }

        const query = TextUtils.maybeLowerCase(context.query, ignoreCase);

        //Match snippets
        if (context.start.ch === 0) {
            const suggestions: Suggestion[] = this.getPossibleCompletions().flatMap(i => {
                if (!i.isList) {
                    return [new Suggestion(
                        i.key + ": #",
                        i.key + ": ~"
                    )];
                }

                return [
                    new Suggestion(
                        i.key + ": [#]",
                        i.key + ": [~]"
                    ),
                    new Suggestion(
                        i.key + ": \\...",
                        i.key + ":\n- ~"
                    )
                ];
            })
            suggestions.push(PUBLISH_SUGGESTION);
            return suggestions.filter((snippet) => {
                const displayName = snippet.getDisplayNameLowerCase(ignoreCase);
                const key = displayName.substring(0, displayName.indexOf(":"));
                return key.startsWith(query);
            });
        }

        //YAML key specific completions
        const currentLine = TextUtils.maybeLowerCase(context.editor.getLine(context.start.line), ignoreCase);
        if (currentLine.startsWith("publish:")) //Publish key
            return FrontMatterSuggestionProvider.getPublishSuggestions(query);

        //Custom keys
        const { key, type } = this.getPossibleCompletions()
            .map(possibleKey => ({
                key: possibleKey,
                type: findTagCompletionType(possibleKey, context.editor, context.start.line, currentLine, ignoreCase)
            }))
            .filter(({ type }) => type !== "none")
            .shift() ?? {};
        if (!key)
            return [];

        //We need a custom query to force include `/`, `-`, `_` for tags.
        const customQuery = TextUtils.maybeLowerCase(EditorUtils.matchWordBackwards(
            context.editor,
            context.end,
            (char) => new RegExp("[" + settings.characterRegex + "/\\-_]", "u").test(char),
            settings.maxLookBackDistance
        ).query, ignoreCase);

        // Compute the replacement suffix
        let replacementSuffix = "";
        if (settings.frontMatterTagAppendSuffix && key.isList) {
            if (type === "inline") {
                replacementSuffix = ", ";
            } else {
                // Keep indentation of current line
                const line = context.editor.getLine(context.start.line);
                const indentation = line.match(/^\s*/)?.[0] ?? "";

                replacementSuffix = `\n${indentation}- `;
            }
        }

        return [...key.completions].filter(tag => TextUtils.maybeLowerCase(tag, ignoreCase).startsWith(customQuery)).map(tag => {
            return (new Suggestion(
                tag,
                tag + replacementSuffix,
                { ...context.end, ch: context.end.ch - customQuery.length }
            ));
        }).sort((a, b) => a.displayName.length - b.displayName.length);
    }

    loadYAMLKeyCompletions(cache: MetadataCache, files: TFile[]) {
        for (let file of files) {
            this.addKeyCompletionsFromFile(file, cache.getFileCache(file));
        }
    }

    readonly onCacheChange = (file: TFile, data: string, cache: CachedMetadata) => {
        this.addKeyCompletionsFromFile(file, cache);
    }

    private addKeyCompletionsFromFile(file: TFile, cache: CachedMetadata) {
        if (!file || !cache || !cache.frontmatter) {
            return;
        }

        const keyCache = new YAMLKeyCache();
        this.fileSuggestionCache.set(file.path, keyCache);

        for (let key of Object.keys(cache.frontmatter)) {
            if (key === "position" || key === "publish" || key === "tags")
                continue;

            let prop = cache.frontmatter[key];
            if (!prop)
                continue;

            if (Array.isArray(prop)) {
                keyCache.addEntries(key, prop);
            } else {
                keyCache.addEntry(key, prop);
            }
        }

        //Handle tags using the specialized obsidian parser
        const tags = getAllTags(cache);
        if (tags && tags.length > 0)
            keyCache.addEntries("tags", tags.map(t => t.substring(1)));
    }

    private getPossibleCompletions(): YAMLKeyInfo[] {
        const allKeys = new Map<string, YAMLKeyInfo>();
        for (let cache of this.fileSuggestionCache.values()) {
            for (let keyInfo of cache.getCompletions()) {
                let combinedKeyInfo = allKeys.get(keyInfo.key);
                if (!combinedKeyInfo)
                    allKeys.set(keyInfo.key, (combinedKeyInfo = new YAMLKeyInfo(keyInfo.key)));

                keyInfo.completions.forEach(c => combinedKeyInfo.addCompletion(c));
                combinedKeyInfo.isList = combinedKeyInfo.isList || keyInfo.isList;
            }
        }

        return [...allKeys.values()];
    }

    private static getPublishSuggestions(query: string) {
        const possibilities = [Suggestion.fromString("true"), Suggestion.fromString("false")];
        const partialMatches = possibilities.filter(val => val.displayName.startsWith(query) && val.displayName !== query);
        if (partialMatches.length > 0)
            return partialMatches;
        else if (query === "true" || query === "false")
            return query === "true" ? possibilities.reverse() : possibilities;
        return [];
    }
}

export const FrontMatter = new FrontMatterSuggestionProvider();
