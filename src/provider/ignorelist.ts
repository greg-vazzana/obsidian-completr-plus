import { Suggestion } from "./provider";
import { Vault } from "obsidian";
import { intoCompletrPath } from "../settings";

const IGNORELIST_PATH = "ignored_suggestions.txt";
const NEW_LINE_REGEX = /\r?\n/;

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
        await vault.adapter.write(intoCompletrPath(vault, IGNORELIST_PATH), [...this.ignorelist].join("\n"));
    }

    async loadData(vault: Vault) {
        const path = intoCompletrPath(vault, IGNORELIST_PATH);
        if (!(await vault.adapter.exists(path)))
            return

        const contents = (await vault.adapter.read(path)).split(NEW_LINE_REGEX);
        for (let word of contents) {
            if (!word)
                continue;

            this.addFromText(word);
        }
    }
};
