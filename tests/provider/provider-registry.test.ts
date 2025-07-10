import { ProviderRegistry } from '../../src/provider/provider_registry';
import { SuggestionProvider, SuggestionContext, Suggestion } from '../../src/provider/provider';
import { CompletrSettings } from '../../src/settings';

// Mock provider for testing
class MockProvider implements SuggestionProvider {
  name: string;
  blocksAllOtherProviders?: boolean;

  constructor(name: string, blocksAllOtherProviders?: boolean) {
    this.name = name;
    this.blocksAllOtherProviders = blocksAllOtherProviders;
  }

  getSuggestions(context: SuggestionContext, settings: CompletrSettings): Suggestion[] {
    return [new Suggestion(this.name, this.name)];
  }
}

describe('ProviderRegistry', () => {
  let registry: ProviderRegistry;
  let provider1: MockProvider;
  let provider2: MockProvider;
  let provider3: MockProvider;

  beforeEach(() => {
    // Reset the singleton instance before each test
    (ProviderRegistry as any).instance = null;
    registry = ProviderRegistry.getInstance();
    
    provider1 = new MockProvider('provider1');
    provider2 = new MockProvider('provider2');
    provider3 = new MockProvider('provider3', true);
  });

  afterEach(() => {
    // Clean up after each test
    registry.clear();
  });

  describe('singleton behavior', () => {
    it('should return the same instance', () => {
      const instance1 = ProviderRegistry.getInstance();
      const instance2 = ProviderRegistry.getInstance();
      
      expect(instance1).toBe(instance2);
    });

    it('should maintain state across getInstance calls', () => {
      const instance1 = ProviderRegistry.getInstance();
      instance1.register(provider1);
      
      const instance2 = ProviderRegistry.getInstance();
      
      expect(instance2.count()).toBe(1);
      expect(instance2.isRegistered(provider1)).toBe(true);
    });
  });

  describe('register', () => {
    it('should register a provider', () => {
      registry.register(provider1);
      
      expect(registry.count()).toBe(1);
      expect(registry.isRegistered(provider1)).toBe(true);
    });

    it('should register multiple providers', () => {
      registry.register(provider1);
      registry.register(provider2);
      
      expect(registry.count()).toBe(2);
      expect(registry.isRegistered(provider1)).toBe(true);
      expect(registry.isRegistered(provider2)).toBe(true);
    });

    it('should register providers in order when no priority specified', () => {
      registry.register(provider1);
      registry.register(provider2);
      registry.register(provider3);
      
      const providers = registry.getProviders();
      expect(providers).toEqual([provider1, provider2, provider3]);
    });

    it('should register provider with priority at correct position', () => {
      registry.register(provider1);
      registry.register(provider2);
      registry.register(provider3, 1); // Insert at position 1
      
      const providers = registry.getProviders();
      expect(providers).toEqual([provider1, provider3, provider2]);
    });

    it('should register provider with priority 0 at beginning', () => {
      registry.register(provider1);
      registry.register(provider2);
      registry.register(provider3, 0); // Insert at beginning
      
      const providers = registry.getProviders();
      expect(providers).toEqual([provider3, provider1, provider2]);
    });

    it('should handle priority beyond array length', () => {
      registry.register(provider1);
      registry.register(provider2, 10); // Beyond array length
      
      const providers = registry.getProviders();
      expect(providers).toEqual([provider1, provider2]);
    });

    it('should allow registering same provider multiple times', () => {
      registry.register(provider1);
      registry.register(provider1);
      
      expect(registry.count()).toBe(2);
      const providers = registry.getProviders();
      expect(providers).toEqual([provider1, provider1]);
    });

    it('should handle negative priority', () => {
      registry.register(provider1);
      registry.register(provider2, -1); // Negative priority
      
      const providers = registry.getProviders();
      expect(providers).toEqual([provider2, provider1]);
    });
  });

  describe('unregister', () => {
    beforeEach(() => {
      registry.register(provider1);
      registry.register(provider2);
      registry.register(provider3);
    });

    it('should unregister a provider', () => {
      registry.unregister(provider2);
      
      expect(registry.count()).toBe(2);
      expect(registry.isRegistered(provider2)).toBe(false);
      expect(registry.isRegistered(provider1)).toBe(true);
      expect(registry.isRegistered(provider3)).toBe(true);
    });

    it('should maintain order when unregistering', () => {
      registry.unregister(provider2);
      
      const providers = registry.getProviders();
      expect(providers).toEqual([provider1, provider3]);
    });

    it('should handle unregistering non-existent provider', () => {
      const nonExistentProvider = new MockProvider('nonexistent');
      
      expect(() => registry.unregister(nonExistentProvider)).not.toThrow();
      expect(registry.count()).toBe(3);
    });

    it('should unregister first occurrence when provider registered multiple times', () => {
      registry.register(provider1); // Register again
      expect(registry.count()).toBe(4);
      
      registry.unregister(provider1);
      
      expect(registry.count()).toBe(3);
      expect(registry.isRegistered(provider1)).toBe(true); // Still registered once
    });

    it('should handle unregistering from empty registry', () => {
      registry.clear();
      
      expect(() => registry.unregister(provider1)).not.toThrow();
      expect(registry.count()).toBe(0);
    });
  });

  describe('getProviders', () => {
    it('should return empty array when no providers registered', () => {
      const providers = registry.getProviders();
      
      expect(providers).toEqual([]);
      expect(providers.length).toBe(0);
    });

    it('should return all registered providers', () => {
      registry.register(provider1);
      registry.register(provider2);
      
      const providers = registry.getProviders();
      
      expect(providers).toEqual([provider1, provider2]);
    });

    it('should return a copy of the providers array', () => {
      registry.register(provider1);
      registry.register(provider2);
      
      const providers = registry.getProviders();
      providers.push(provider3); // Modify returned array
      
      expect(registry.count()).toBe(2); // Original should be unchanged
      expect(registry.getProviders()).toEqual([provider1, provider2]);
    });

    it('should return providers in registration order', () => {
      registry.register(provider3);
      registry.register(provider1);
      registry.register(provider2);
      
      const providers = registry.getProviders();
      expect(providers).toEqual([provider3, provider1, provider2]);
    });

    it('should reflect changes after registration/unregistration', () => {
      registry.register(provider1);
      expect(registry.getProviders()).toEqual([provider1]);
      
      registry.register(provider2);
      expect(registry.getProviders()).toEqual([provider1, provider2]);
      
      registry.unregister(provider1);
      expect(registry.getProviders()).toEqual([provider2]);
    });
  });

  describe('clear', () => {
    it('should clear all providers', () => {
      registry.register(provider1);
      registry.register(provider2);
      registry.register(provider3);
      
      registry.clear();
      
      expect(registry.count()).toBe(0);
      expect(registry.getProviders()).toEqual([]);
    });

    it('should handle clearing empty registry', () => {
      expect(() => registry.clear()).not.toThrow();
      expect(registry.count()).toBe(0);
    });

    it('should allow registration after clearing', () => {
      registry.register(provider1);
      registry.clear();
      registry.register(provider2);
      
      expect(registry.count()).toBe(1);
      expect(registry.isRegistered(provider2)).toBe(true);
      expect(registry.isRegistered(provider1)).toBe(false);
    });
  });

  describe('count', () => {
    it('should return 0 for empty registry', () => {
      expect(registry.count()).toBe(0);
    });

    it('should return correct count for registered providers', () => {
      expect(registry.count()).toBe(0);
      
      registry.register(provider1);
      expect(registry.count()).toBe(1);
      
      registry.register(provider2);
      expect(registry.count()).toBe(2);
      
      registry.register(provider3);
      expect(registry.count()).toBe(3);
    });

    it('should update count when providers are unregistered', () => {
      registry.register(provider1);
      registry.register(provider2);
      expect(registry.count()).toBe(2);
      
      registry.unregister(provider1);
      expect(registry.count()).toBe(1);
      
      registry.clear();
      expect(registry.count()).toBe(0);
    });

    it('should count duplicate registrations', () => {
      registry.register(provider1);
      registry.register(provider1);
      
      expect(registry.count()).toBe(2);
    });
  });

  describe('isRegistered', () => {
    beforeEach(() => {
      registry.register(provider1);
      registry.register(provider2);
    });

    it('should return true for registered providers', () => {
      expect(registry.isRegistered(provider1)).toBe(true);
      expect(registry.isRegistered(provider2)).toBe(true);
    });

    it('should return false for non-registered providers', () => {
      expect(registry.isRegistered(provider3)).toBe(false);
    });

    it('should return false after unregistering', () => {
      registry.unregister(provider1);
      expect(registry.isRegistered(provider1)).toBe(false);
    });

    it('should return false after clearing', () => {
      registry.clear();
      expect(registry.isRegistered(provider1)).toBe(false);
      expect(registry.isRegistered(provider2)).toBe(false);
    });

    it('should handle null/undefined providers', () => {
      expect(registry.isRegistered(null as any)).toBe(false);
      expect(registry.isRegistered(undefined as any)).toBe(false);
    });
  });

  describe('integration tests', () => {
    it('should handle complex registration scenarios', () => {
      // Register providers in different ways
      registry.register(provider1);
      registry.register(provider2, 0); // Insert at beginning
      registry.register(provider3); // Append at end
      
      expect(registry.getProviders()).toEqual([provider2, provider1, provider3]);
      
      // Unregister middle provider
      registry.unregister(provider1);
      expect(registry.getProviders()).toEqual([provider2, provider3]);
      
      // Register with priority in middle
      registry.register(provider1, 1);
      expect(registry.getProviders()).toEqual([provider2, provider1, provider3]);
    });

    it('should work with providers having different properties', () => {
      const blockingProvider = new MockProvider('blocking', true);
      const normalProvider = new MockProvider('normal');
      
      registry.register(normalProvider);
      registry.register(blockingProvider);
      
      const providers = registry.getProviders();
      expect(providers.length).toBe(2);
      expect(providers[0].blocksAllOtherProviders).toBeUndefined();
      expect(providers[1].blocksAllOtherProviders).toBe(true);
    });

    it('should maintain singleton behavior through complex operations', () => {
      const instance1 = ProviderRegistry.getInstance();
      instance1.register(provider1);
      
      const instance2 = ProviderRegistry.getInstance();
      instance2.register(provider2);
      
      expect(instance1.count()).toBe(2);
      expect(instance2.count()).toBe(2);
      expect(instance1).toBe(instance2);
    });
  });
}); 