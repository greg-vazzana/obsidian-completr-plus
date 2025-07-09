import { SuggestionProvider } from "./provider";

/**
 * Registry for managing suggestion providers
 * Replaces the hardcoded provider array with a more flexible registration system
 */
export class ProviderRegistry {
    private providers: SuggestionProvider[] = [];
    private static instance: ProviderRegistry | null = null;

    private constructor() {}

    /**
     * Get the singleton instance of the registry
     */
    static getInstance(): ProviderRegistry {
        if (!ProviderRegistry.instance) {
            ProviderRegistry.instance = new ProviderRegistry();
        }
        return ProviderRegistry.instance;
    }

    /**
     * Register a provider with the registry
     * @param provider The provider to register
     * @param priority Optional priority (lower numbers = higher priority). If not specified, appends to end.
     */
    register(provider: SuggestionProvider, priority?: number): void {
        if (priority !== undefined) {
            this.providers.splice(priority, 0, provider);
        } else {
            this.providers.push(provider);
        }
    }

    /**
     * Unregister a provider from the registry
     * @param provider The provider to unregister
     */
    unregister(provider: SuggestionProvider): void {
        const index = this.providers.indexOf(provider);
        if (index !== -1) {
            this.providers.splice(index, 1);
        }
    }

    /**
     * Get all registered providers in registration order
     */
    getProviders(): SuggestionProvider[] {
        return [...this.providers]; // Return a copy to prevent external modification
    }

    /**
     * Clear all registered providers
     */
    clear(): void {
        this.providers = [];
    }

    /**
     * Get the number of registered providers
     */
    count(): number {
        return this.providers.length;
    }

    /**
     * Check if a provider is registered
     */
    isRegistered(provider: SuggestionProvider): boolean {
        return this.providers.includes(provider);
    }
}

/**
 * Global instance for easy access
 */
export const providerRegistry = ProviderRegistry.getInstance(); 