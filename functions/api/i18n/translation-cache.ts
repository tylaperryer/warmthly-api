/**
 * Translation Caching System
 * API-level caching for translations to improve performance
 * 
 * Supports:
 * - Cloudflare Workers KV (if available)
 * - In-memory cache (fallback)
 * - Version-based cache invalidation
 * - Batch cache operations
 */

/**
 * Cache entry structure
 */
interface CacheEntry {
  /** Translated text */
  text: string;
  /** Timestamp when cached */
  timestamp: number;
  /** Cache version (for invalidation) */
  version: string;
  /** Provider that generated this translation */
  provider?: string;
  /** Quality score if available */
  qualityScore?: number;
}

/**
 * Cache configuration
 */
interface CacheConfig {
  /** Cache TTL in seconds (default: 30 days) */
  ttl?: number;
  /** Cache version (for invalidation) */
  version?: string;
  /** Whether caching is enabled */
  enabled?: boolean;
}

/**
 * Default cache configuration
 */
const DEFAULT_CONFIG: Required<CacheConfig> = {
  ttl: 30 * 24 * 60 * 60, // 30 days in seconds
  version: '1.0.0',
  enabled: true,
};

/**
 * In-memory cache (fallback when KV is not available)
 * Uses Map for fast lookups
 */
class InMemoryCache {
  private cache: Map<string, CacheEntry> = new Map();
  private maxSize: number = 10000; // Maximum entries

  async get(key: string): Promise<CacheEntry | null> {
    const entry = this.cache.get(key);
    if (!entry) {
      return null;
    }

    // Check if entry is expired
    const now = Date.now();
    const age = (now - entry.timestamp) / 1000; // Age in seconds
    
    if (age > DEFAULT_CONFIG.ttl) {
      this.cache.delete(key);
      return null;
    }

    return entry;
  }

  async set(key: string, value: CacheEntry): Promise<void> {
    // Evict oldest entries if cache is full
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        this.cache.delete(firstKey);
      }
    }

    this.cache.set(key, value);
  }

  async delete(key: string): Promise<void> {
    this.cache.delete(key);
  }

  async clear(): Promise<void> {
    this.cache.clear();
  }

  async has(key: string): Promise<boolean> {
    const entry = await this.get(key);
    return entry !== null;
  }
}

/**
 * Cloudflare Workers KV cache adapter
 */
class KVCache {
  private kv: KVNamespace | null;

  constructor(kv: KVNamespace | null) {
    this.kv = kv;
  }

  async get(key: string): Promise<CacheEntry | null> {
    if (!this.kv) {
      return null;
    }

    try {
      const value = await this.kv.get(key);
      if (!value) {
        return null;
      }

      const entry: CacheEntry = JSON.parse(value);
      
      // Check if entry is expired
      const now = Date.now();
      const age = (now - entry.timestamp) / 1000; // Age in seconds
      
      if (age > DEFAULT_CONFIG.ttl) {
        await this.delete(key);
        return null;
      }

      return entry;
    } catch (error) {
      console.error('KV cache get error:', error);
      return null;
    }
  }

  async set(key: string, value: CacheEntry): Promise<void> {
    if (!this.kv) {
      return;
    }

    try {
      // Store with metadata for expiration
      await this.kv.put(key, JSON.stringify(value), {
        expirationTtl: DEFAULT_CONFIG.ttl,
      });
    } catch (error) {
      console.error('KV cache set error:', error);
    }
  }

  async delete(key: string): Promise<void> {
    if (!this.kv) {
      return;
    }

    try {
      await this.kv.delete(key);
    } catch (error) {
      console.error('KV cache delete error:', error);
    }
  }

  async has(key: string): Promise<boolean> {
    const entry = await this.get(key);
    return entry !== null;
  }
}

/**
 * Translation Cache Manager
 * Handles caching with fallback to in-memory cache
 */
export class TranslationCache {
  private kvCache: KVCache;
  private memoryCache: InMemoryCache;
  private config: Required<CacheConfig>;
  private cacheEnabled: boolean;

  constructor(kv: KVNamespace | null = null, config: CacheConfig = {}) {
    this.kvCache = new KVCache(kv);
    this.memoryCache = new InMemoryCache();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.cacheEnabled = this.config.enabled;
  }

  /**
   * Generate cache key from translation parameters
   * Format: translation:{sourceLang}:{targetLang}:{hash}
   */
  private generateCacheKey(
    sourceText: string,
    sourceLang: string,
    targetLang: string
  ): string {
    // Create hash of source text (simple hash for now)
    // In production, use crypto.subtle.digest for better hashing
    const hash = this.simpleHash(sourceText);
    return `translation:${sourceLang}:${targetLang}:${hash}`;
  }

  /**
   * Simple hash function (for cache keys)
   * In production, consider using crypto.subtle.digest
   */
  private simpleHash(text: string): string {
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      const char = text.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
  }

  /**
   * Get cached translation
   */
  async get(
    sourceText: string,
    sourceLang: string,
    targetLang: string
  ): Promise<string | null> {
    if (!this.cacheEnabled) {
      return null;
    }

    const key = this.generateCacheKey(sourceText, sourceLang, targetLang);

    // Try KV cache first
    let entry = await this.kvCache.get(key);
    
    // Fallback to memory cache
    if (!entry) {
      entry = await this.memoryCache.get(key);
    }

    if (!entry) {
      return null;
    }

    // Check version compatibility
    if (entry.version !== this.config.version) {
      // Version mismatch, invalidate cache
      await this.delete(sourceText, sourceLang, targetLang);
      return null;
    }

    return entry.text;
  }

  /**
   * Store translation in cache
   */
  async set(
    sourceText: string,
    sourceLang: string,
    targetLang: string,
    translatedText: string,
    metadata?: {
      provider?: string;
      qualityScore?: number;
    }
  ): Promise<void> {
    if (!this.cacheEnabled) {
      return;
    }

    const key = this.generateCacheKey(sourceText, sourceLang, targetLang);
    
    const entry: CacheEntry = {
      text: translatedText,
      timestamp: Date.now(),
      version: this.config.version,
      provider: metadata?.provider,
      qualityScore: metadata?.qualityScore,
    };

    // Store in both caches (KV for persistence, memory for speed)
    await Promise.all([
      this.kvCache.set(key, entry),
      this.memoryCache.set(key, entry),
    ]);
  }

  /**
   * Delete cached translation
   */
  async delete(
    sourceText: string,
    sourceLang: string,
    targetLang: string
  ): Promise<void> {
    const key = this.generateCacheKey(sourceText, sourceLang, targetLang);
    
    await Promise.all([
      this.kvCache.delete(key),
      this.memoryCache.delete(key),
    ]);
  }

  /**
   * Check if translation is cached
   */
  async has(
    sourceText: string,
    sourceLang: string,
    targetLang: string
  ): Promise<boolean> {
    if (!this.cacheEnabled) {
      return false;
    }

    const key = this.generateCacheKey(sourceText, sourceLang, targetLang);
    
    // Check KV first, then memory
    const kvHas = await this.kvCache.has(key);
    if (kvHas) {
      return true;
    }
    
    return await this.memoryCache.has(key);
  }

  /**
   * Batch get translations
   */
  async getBatch(
    requests: Array<{
      sourceText: string;
      sourceLang: string;
      targetLang: string;
    }>
  ): Promise<Map<string, string>> {
    const results = new Map<string, string>();
    
    const promises = requests.map(async (req) => {
      const cached = await this.get(req.sourceText, req.sourceLang, req.targetLang);
      if (cached) {
        const key = this.generateCacheKey(req.sourceText, req.sourceLang, req.targetLang);
        results.set(key, cached);
      }
    });

    await Promise.all(promises);
    return results;
  }

  /**
   * Batch set translations
   */
  async setBatch(
    translations: Array<{
      sourceText: string;
      sourceLang: string;
      targetLang: string;
      translatedText: string;
      metadata?: {
        provider?: string;
        qualityScore?: number;
      };
    }>
  ): Promise<void> {
    const promises = translations.map(t =>
      this.set(
        t.sourceText,
        t.sourceLang,
        t.targetLang,
        t.translatedText,
        t.metadata
      )
    );

    await Promise.all(promises);
  }

  /**
   * Invalidate cache by language
   */
  async invalidateLanguage(targetLang: string): Promise<void> {
    // Note: This is a simplified implementation
    // Full invalidation would require listing all keys, which KV doesn't support efficiently
    // In production, consider using cache tags or version-based invalidation
    console.warn(`Cache invalidation for language ${targetLang} - clearing memory cache`);
    await this.memoryCache.clear();
  }

  /**
   * Invalidate all cache (version change)
   */
  async invalidateAll(): Promise<void> {
    await this.memoryCache.clear();
    // KV cache will expire naturally based on TTL
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<{
    memoryCacheSize: number;
    kvAvailable: boolean;
    enabled: boolean;
  }> {
    return {
      memoryCacheSize: (this.memoryCache as any).cache?.size || 0,
      kvAvailable: (this.kvCache as any).kv !== null,
      enabled: this.cacheEnabled,
    };
  }
}

/**
 * Create translation cache instance
 */
export function createTranslationCache(
  kv: KVNamespace | null = null,
  config: CacheConfig = {}
): TranslationCache {
  return new TranslationCache(kv, config);
}

