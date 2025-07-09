import { Vault } from "obsidian";

/**
 * File and path utilities for the Completr plugin
 */
export class FileUtils {
    /**
     * Create a path within the plugin's data directory
     * @param vault - The Obsidian vault instance
     * @param path - Path segments to join
     * @returns The full path within the plugin directory
     */
    static intoCompletrPath(vault: Vault, ...path: string[]): string {
        return vault.configDir + "/plugins/obsidian-completr-plus/" + path.join("/");
    }

    /**
     * Check if a file exists
     * @param vault - The Obsidian vault instance
     * @param path - The file path to check
     * @returns Promise resolving to true if file exists
     */
    static async exists(vault: Vault, path: string): Promise<boolean> {
        return await vault.adapter.exists(path);
    }

    /**
     * Read file contents
     * @param vault - The Obsidian vault instance
     * @param path - The file path to read
     * @returns Promise resolving to file contents
     */
    static async readFile(vault: Vault, path: string): Promise<string> {
        return await vault.adapter.read(path);
    }

    /**
     * Write file contents
     * @param vault - The Obsidian vault instance
     * @param path - The file path to write
     * @param contents - The contents to write
     * @returns Promise resolving when write is complete
     */
    static async writeFile(vault: Vault, path: string, contents: string): Promise<void> {
        await vault.adapter.write(path, contents);
    }

    /**
     * Create directory if it doesn't exist
     * @param vault - The Obsidian vault instance
     * @param path - The directory path to create
     * @returns Promise resolving when directory is created
     */
    static async ensureDirectory(vault: Vault, path: string): Promise<void> {
        if (!(await vault.adapter.exists(path))) {
            await vault.adapter.mkdir(path);
        }
    }

    /**
     * List files in directory
     * @param vault - The Obsidian vault instance
     * @param path - The directory path to list
     * @returns Promise resolving to listed files
     */
    static async listFiles(vault: Vault, path: string): Promise<{files: string[], folders: string[]}> {
        return await vault.adapter.list(path);
    }

    /**
     * Join path segments
     * @param segments - Path segments to join
     * @returns The joined path
     */
    static joinPath(...segments: string[]): string {
        return segments.join('/');
    }
} 