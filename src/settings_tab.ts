import { TextDecoder } from "util";

import { App, ButtonComponent, Modal, Notice, PluginSettingTab, Setting } from "obsidian";
import { isInstalled as isCalloutManagerInstalled } from "obsidian-callout-manager";
import { detect } from "jschardet";

import { FILE_PROCESSING_BATCH_SIZE, FILE_ENCODING_DETECTION_BUFFER_SIZE } from "./constants";
import CompletrPlugin from "./main";
import { Scanner } from "./provider/scanner_provider";
import { WordList } from "./provider/word_list_provider";
import { CalloutProviderSource, CompletrSettings, WordInsertionMode } from "./settings";

export default class CompletrSettingsTab extends PluginSettingTab {

    private plugin: CompletrPlugin;
    private isReloadingWords: boolean;

    constructor(app: App, plugin: CompletrPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): any {
        const { containerEl } = this;

        containerEl.empty();

        new Setting(containerEl)
            .setName("Word character regex")
            .setDesc("A regular expression which matches a character of a word. Used by during completion to find the word to the left of the cursor and used by the file scanner to find valid words.")
            .addText(text => text
                .setValue(this.plugin.settings.characterRegex)
                .onChange(async val => {
                    try {
                        //Check if regex is valid
                        new RegExp("[" + val + "]+").test("");
                        text.inputEl.removeClass("completr-settings-error");
                        this.plugin.settings.characterRegex = val;
                        await this.plugin.saveSettings();
                    } catch (e) {
                        text.inputEl.addClass("completr-settings-error");
                    }
                }));

        new Setting(containerEl)
            .setName("Auto focus")
            .setDesc("Whether the popup is automatically focused once it opens.")
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.autoFocus)
                .onChange(async val => {
                    this.plugin.settings.autoFocus = val;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName("Auto trigger")
            .setDesc("Whether the popup opens automatically when typing.")
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.autoTrigger)
                .onChange(async val => {
                    this.plugin.settings.autoTrigger = val;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName("Minimum word length")
            .setDesc("The minimum length a word has to be, to count as a valid suggestion. This value is used by the file" +
                " scanner and word list provider.")
            .addText(text => {
                text.inputEl.type = "number";
                text
                    .setValue(this.plugin.settings.minWordLength + "")
                    .onChange(async val => {
                        if (!val || val.length < 1)
                            return;

                        this.plugin.settings.minWordLength = parseInt(val);
                        await this.plugin.saveSettings();
                    });
            });

        new Setting(containerEl)
            .setName("Minimum word trigger length")
            .setDesc("The minimum length a word has to be, to trigger suggestions. The LaTeX provider has its own separate setting.")
            .addText(text => {
                text.inputEl.type = "number";
                text
                    .setValue(this.plugin.settings.minWordTriggerLength + "")
                    .onChange(async val => {
                        if (!val || val.length < 1)
                            return;

                        this.plugin.settings.minWordTriggerLength = parseInt(val);
                        await this.plugin.saveSettings();
                    });
            });

        new Setting(containerEl)
            .setName("Suggestion limit")
            .setDesc("Maximum number of suggestions to show (0 = unlimited). Higher values may impact performance with large word lists.")
            .addText(text => {
                text.inputEl.type = "number";
                text
                    .setValue(this.plugin.settings.maxSuggestions + "")
                    .onChange(async val => {
                        if (!val || val.length < 1) {
                            this.plugin.settings.maxSuggestions = 0;
                            await this.plugin.saveSettings();
                            return;
                        }

                        const numVal = parseInt(val);
                        if (numVal < 0) {
                            this.plugin.settings.maxSuggestions = 0;
                        } else {
                            this.plugin.settings.maxSuggestions = numVal;
                        }
                        await this.plugin.saveSettings();
                    });
            });

        new Setting(containerEl)
            .setName("Enable fuzzy matching")
            .setDesc("Enable fuzzy matching for word suggestions. When enabled, you can find words even with typos or partial matches (e.g., 'obsdn' can match 'obsidian'). When disabled, only exact prefix matches are shown.")
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.enableFuzzyMatching)
                .onChange(async val => {
                    this.plugin.settings.enableFuzzyMatching = val;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName("Word insertion mode")
            .setDesc("How suggestions are inserted. 'Replace word' replaces the entire word while preserving case (e.g., 'Cor' → 'Corporate'). " +
                "'Complete word' appends only the missing letters (e.g., 'Cor' → 'Corporate' by adding 'porate').")
            .addDropdown(dropdown => dropdown
                .addOption(WordInsertionMode.REPLACE, WordInsertionMode.REPLACE)
                .addOption(WordInsertionMode.APPEND, WordInsertionMode.APPEND)
                .setValue(this.plugin.settings.wordInsertionMode)
                .onChange(async val => {
                    this.plugin.settings.wordInsertionMode = val as WordInsertionMode;
                    await this.plugin.saveSettings();
                })
            );

        new Setting(containerEl)
            .setName("Ignore diacritics when filtering")
            .setDesc("When enabled, the query 'Hello' can suggest 'Hèllò', meaning diacritics will be ignored when filtering the suggestions. Only used by the file scanner and word list provider.")
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.ignoreDiacriticsWhenFiltering)
                .onChange(async val => {
                    this.plugin.settings.ignoreDiacriticsWhenFiltering = val;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName("Authoring")
            .setHeading();

        new Setting(containerEl)
            .setName("Live word tracking")
            .setDesc("When enabled, word frequencies are updated in real-time as you type. Words will be tracked and their frequency incremented immediately when you complete them by typing a space or punctuation.")
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.liveWordTracking)
                .onChange(async val => {
                    this.plugin.settings.liveWordTracking = val;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName("Add space after completed word")
            .setDesc("When enabled, a space will be added after a word has been completed.")
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.insertSpaceAfterComplete)
                .onChange(async val => {
                    this.plugin.settings.insertSpaceAfterComplete = val;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName("Insert period after double space")
            .setDesc("When enabled, a period is added after a completed word if a space is added after an automatic space, via the option above.")
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.insertPeriodAfterSpaces)
                .onChange(async val => {
                    this.plugin.settings.insertPeriodAfterSpaces = val;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName("Auto-capitalize lines")
            .setDesc("Automatically capitalize the first word of each line as you type. Respects markdown formatting and preserves mixed-case words like 'iPhone'.")
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.autoCapitalizeLines)
                .onChange(async val => {
                    this.plugin.settings.autoCapitalizeLines = val;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName("Auto-capitalize sentences")
            .setDesc("Use NLP to detect sentence boundaries and automatically capitalize the first word of each sentence. This works across line breaks and provides more intelligent capitalization.")
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.autoCapitalizeSentences)
                .onChange(async val => {
                    this.plugin.settings.autoCapitalizeSentences = val;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName("Preserve mixed-case words")
            .setDesc("Don't capitalize words that have mixed case (like 'iPhone', 'JavaScript', 'eBay'). When disabled, all words will be capitalized regardless of their original casing.")
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.preserveMixedCaseWords)
                .onChange(async val => {
                    this.plugin.settings.preserveMixedCaseWords = val;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName("Debug capitalization")
            .setDesc("Enable debug logging for NLP-based capitalization. Useful for troubleshooting but may impact performance. Check the developer console for logs.")
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.debugCapitalization)
                .onChange(async val => {
                    this.plugin.settings.debugCapitalization = val;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName("Latex provider")
            .setHeading();

        this.createEnabledSetting("latexProviderEnabled", "Whether or not the latex provider is enabled", containerEl);

        new Setting(containerEl)
            .setName("Trigger in code blocks")
            .setDesc("Whether the LaTeX provider should trigger after dollar signs which are enclosed in code blocks (for example ```$\\fr```).")
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.latexTriggerInCodeBlocks)
                .onChange(async val => {
                    this.plugin.settings.latexTriggerInCodeBlocks = val;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName("Ignore case")
            .setDesc("Whether the LaTeX provider should ignore the casing of the typed text. If so, the input 'MaThbb' could suggest 'mathbb'.")
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.latexIgnoreCase)
                .onChange(async val => {
                    this.plugin.settings.latexIgnoreCase = val;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName("Minimum word trigger length")
            .setDesc("The minimum length a query has to be, to trigger suggestions.")
            .addText(text => {
                text.inputEl.type = "number";
                text
                    .setValue(this.plugin.settings.latexMinWordTriggerLength + "")
                    .onChange(async val => {
                        if (!val || val.length < 1)
                            return;

                        this.plugin.settings.latexMinWordTriggerLength = parseInt(val);
                        await this.plugin.saveSettings();
                    });
            });

        new Setting(containerEl)
            .setName("Front matter provider")
            .addExtraButton(button => button
                .setIcon("link")
                .setTooltip("Obsidian Front-Matter wiki")
                .onClick(() => window.open("https://help.obsidian.md/Advanced+topics/YAML+front+matter")))
            .setHeading();

        this.createEnabledSetting("frontMatterProviderEnabled", "Whether the front matter provider is enabled", containerEl);

        new Setting(containerEl)
            .setName("Ignore case")
            .setDesc("Whether the Front matter provider should ignore the casing of the typed text. If so, the input 'MaThbb' could suggest 'mathbb'.")
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.frontMatterIgnoreCase)
                .onChange(async val => {
                    this.plugin.settings.frontMatterIgnoreCase = val;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName("Add suffix to tag completion")
            .setDesc("Whether each completed tag should be suffixed with a comma or a newline (when typing in a multi-line list). Allows faster insertion of multiple tags.")
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.frontMatterTagAppendSuffix)
                .onChange(async val => {
                    this.plugin.settings.frontMatterTagAppendSuffix = val;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName("Scanner")
            .setHeading()
            .addExtraButton(button => button
                .setIcon("search")
                .setTooltip("Immediately scan all .md files currently in your vault.")
                .onClick(() => {
                    new ConfirmationModal(this.plugin.app,
                        "Start scanning?",
                        "Depending on the size of your vault and computer, this may take a while.",
                        button => button
                            .setButtonText("Scan")
                            .setCta(),
                        async () => {
                            try {
                                const files = this.plugin.app.vault.getMarkdownFiles();
                                const notice = new Notice(`Scanning ${files.length} files...`, 0);
                                let scannedCount = 0;

                                // Process files in batches to show progress
                                const batchSize = FILE_PROCESSING_BATCH_SIZE;
                                for (let i = 0; i < files.length; i += batchSize) {
                                    const batch = files.slice(i, i + batchSize);
                                    await Scanner.scanFiles(this.plugin.settings, batch);
                                    scannedCount += batch.length;
                                    notice.setMessage(`Scanning files... ${scannedCount}/${files.length}`);
                                }

                                notice.hide();
                                new Notice(`Successfully scanned ${files.length} files!`);
                            } catch (error) {
                                console.error('Error scanning files:', error);
                                new Notice('Error scanning files. Check console for details.');
                            }
                        },
                    ).open();
                }))
            .addExtraButton(button => button
                .setIcon("trash")
                .setTooltip("Delete all known words.")
                .onClick(async () => {
                    new ConfirmationModal(this.plugin.app,
                        "Delete all known words?",
                        "This will delete all words that have been scanned. No suggestions from this provider will show up anymore until new files are scanned.",
                        button => button
                            .setButtonText("Delete")
                            .setWarning(),
                        async () => {
                            await Scanner.deleteAllWords();
                        },
                    ).open();
                }));

        this.createEnabledSetting("scanEnabled", "Whether or not the scanner is enabled", containerEl);

        new Setting(containerEl)
            .setName("Word list provider")
            .setHeading();

        this.createEnabledSetting("wordListProviderEnabled", "Whether or not the word list provider is enabled", containerEl);

        const fileInput = createEl("input", {
            attr: {
                type: "file",
            }
        });

        fileInput.onchange = async () => {
            const files = fileInput.files;
            if (files.length < 1)
                return;

            let changed = false;
            for (let i = 0; i < files.length; i++) {
                const file = files[i];

                try {
                    const buf = await file.arrayBuffer();
                    const encoding = detect(Buffer.from(buf.slice(0, FILE_ENCODING_DETECTION_BUFFER_SIZE))).encoding;
                    const text = new TextDecoder(encoding).decode(buf);
                    const success = await WordList.importWordList(this.app.vault, file.name, text, this.plugin.settings);
                    changed ||= success;

                    if (!success)
                        new Notice("Unable to import " + file.name + " because it already exists!");
                } catch (e) {
                    console.error(e);
                    new Notice("Error while importing " + file.name);
                }
            }

            // Only refresh if something was added
            if (!changed)
                return;

            await this.reloadWords();
            this.display();
        }

        new Setting(containerEl)
            .setName('Word list files')
            .setDesc('A list of files which contain words to be used as suggestions. Each word should be on its own line.')
            .addExtraButton(button => button
                .setIcon("switch")
                .setTooltip("Reload")
                .onClick(async () => {
                    await this.reloadWords();
                    //Refresh because loadFromFiles might have removed an invalid file
                    this.display();
                }))
            .addButton(button => {
                button.buttonEl.appendChild(fileInput);
                button
                    .setButtonText("+")
                    .setCta()
                    .onClick(() => fileInput.click());
            });

        const wordListDiv = containerEl.createDiv();
        WordList.getRelativeFilePaths(this.app.vault).then((names) => {
            for (const name of names) {
                new Setting(wordListDiv)
                    .setName(name)
                    .addExtraButton((button) => button
                        .setIcon("trash")
                        .setTooltip("Remove")
                        .onClick(async () => {
                            new ConfirmationModal(
                                this.app,
                                "Delete " + name + "?",
                                "The file will be removed and the words inside of it won't show up as suggestions anymore.",
                                button => button
                                    .setButtonText("Delete")
                                    .setWarning(),
                                async () => {
                                    await WordList.deleteWordList(this.app.vault, name);
                                    await this.reloadWords();
                                    this.display();
                                }).open();
                        })
                    ).settingEl.addClass("completr-settings-list-item");
            }
        });

        new Setting(containerEl)
            .setName("Callout provider")
            .setHeading();

        this.createEnabledSetting("calloutProviderEnabled", "Whether or not the callout provider is enabled", containerEl);
        new Setting(containerEl)
            .setName("Source")
            .setDesc("Where callout suggestions come from.")
            .addDropdown(component => {
                component.addOption("Completr", CalloutProviderSource.COMPLETR)
                    .setValue(CalloutProviderSource.COMPLETR) // Default option.
                    .onChange(async (value) => {
                        this.plugin.settings.calloutProviderSource = value as CalloutProviderSource;
                        await this.plugin.saveSettings();
                    });

                if (isCalloutManagerInstalled()) {
                    component.addOption("Callout Manager", CalloutProviderSource.CALLOUT_MANAGER);
                    if (this.plugin.settings.calloutProviderSource === CalloutProviderSource.CALLOUT_MANAGER) {
                        component.setValue(this.plugin.settings.calloutProviderSource);
                    }
                }
            })
    }

    private async reloadWords() {
        if (this.isReloadingWords)
            return;

        this.isReloadingWords = true;
        const count = await WordList.loadFromFiles(this.app.vault, this.plugin.settings);
        this.isReloadingWords = false;

        new Notice(`Loaded ${count} words`);
    }

    private createEnabledSetting(propertyName: keyof CompletrSettings, desc: string, container: HTMLElement) {
        new Setting(container)
            .setName("Enabled")
            .setDesc(desc)
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings[propertyName] as boolean)
                //@ts-ignore
                .onChange(async (val) => {
                    // @ts-ignore
                    this.plugin.settings[propertyName] = val;
                    await this.plugin.saveSettings();
                }));
    }
}

class ConfirmationModal extends Modal {

    constructor(app: App, title: string, body: string, buttonCallback: (button: ButtonComponent) => void, clickCallback: () => Promise<void>) {
        super(app);
        this.titleEl.setText(title);
        this.contentEl.setText(body);
        new Setting(this.modalEl)
            .addButton(button => {
                buttonCallback(button);
                button.onClick(async () => {
                    await clickCallback();
                    this.close();
                })
            })
            .addButton(button => button
                .setButtonText("Cancel")
                .onClick(() => this.close())).settingEl.addClass("completr-settings-no-border");
    }
}
