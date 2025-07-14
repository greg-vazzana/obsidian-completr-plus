import { Suggestion } from "./provider";
import { Vault } from "obsidian";
import { FileUtils } from "../utils/file_utils";
import { CONFIG_FILES, PATTERNS } from "../constants";

export const SuggestionIgnorelist = new class {
    private ignorelist: Set<string> = new Set<string>();

    add(suggestion: Suggestion) {
        this.addFromText(suggestion.displayName);
    }

    addFromText(text: string) {
        this.ignorelist.add(text);
    }

    removeFromText(text: string) {
        this.ignorelist.delete(text);
    }

    has(suggestion: Suggestion): boolean {
        return this.hasText(suggestion.displayName);
    }

    hasText(text: string): boolean {
        return this.ignorelist.has(text);
    }

    filter(suggestions: Suggestion[]): Suggestion[] {
        if (this.ignorelist.size < 1)
            return suggestions;

        return suggestions.filter(s => !this.ignorelist.has(s.displayName));
    }

    filterText(suggestions: string[]): string[] {
        if (this.ignorelist.size < 1)
            return suggestions;

        return suggestions.filter(s => !this.ignorelist.has(s));
    }

    async saveData(vault: Vault) {
        await vault.adapter.write(FileUtils.intoCompletrPath(vault, CONFIG_FILES.IGNORELIST), [...this.ignorelist].join("\n"));
    }

    async loadData(vault: Vault) {
        const path = FileUtils.intoCompletrPath(vault, CONFIG_FILES.IGNORELIST);
        if (!(await vault.adapter.exists(path)))
            return

        const contents = (await vault.adapter.read(path)).split(PATTERNS.NEW_LINE);
        for (let word of contents) {
            if (!word)
                continue;

            this.addFromText(word);
        }
    }
};
