/**
 * i18n API Endpoint
 * Supports 7,019 languages via open-source translation providers
 * Privacy-first: Uses self-hosted LibreTranslate and open-source NLLB
 * Falls back to manual translations for key languages
 */

import { HybridTranslationService } from './translation-service';
import { createTranslationCache, TranslationCache } from './translation-cache';
import { getAllUniversalLanguageCodes } from './universal-languages';

interface Env {
  // LibreTranslate (self-hosted, private)
  LIBRETRANSLATE_URL?: string;
  LIBRETRANSLATE_API_KEY?: string;
  
  // Hugging Face (optional, for NLLB - has free tier)
  HUGGINGFACE_API_KEY?: string;
  
  // Legacy DeepL support (deprecated, will be removed)
  DEEPL_API_KEY?: string;
  
  // Cloudflare Workers KV (optional, for translation caching)
  TRANSLATION_CACHE?: KVNamespace;
}

// Manual translations for key languages (highest quality)
// These take priority over API translations
const MANUAL_TRANSLATIONS: Record<string, any> = {
  en: {
    common: {
      loading: "Loading...",
      error: "Error",
      success: "Success",
      cancel: "Cancel",
      submit: "Submit",
      close: "Close",
      back: "Back",
      next: "Next",
      save: "Save",
      delete: "Delete",
      edit: "Edit",
      view: "View",
      search: "Search",
      filter: "Filter",
      sort: "Sort",
      language: "Language"
    },
    main: {
      title: "Rehumanize Our World.",
      subtitle: "Warmthly is a global movement to make empathy a measurable part of our systems.",
      donate: "Support the Mission",
      donateButton: "🤍 Support the Mission"
    },
    mint: {
      title: "Mint",
      description: "We track your every cent and our every decision right before you. It is our commitment to you that we will forever track and provide utmost transparency for our every action and your every donation."
    },
    post: {
      title: "Post",
      subtitle: "A living timeline of our organization's story—from founding moments to future plans. Every decision, milestone, and community interaction is recorded here for complete transparency."
    },
    vote: {
      title: "The Dissolution Vote",
      description: "Our commitment is to our mission and values: Transparency, Honesty, Humility, and Empathy. If we fail to uphold them, we believe we should cease to exist. This page is our community-held kill switch."
    },
    report: {
      title: "Report an Issue",
      description: "If you have concerns, questions, or need to report something related to Warmthly, please use the form below. We take all reports seriously and will review them promptly."
    },
    yourData: {
      title: "Your Data",
      description: "Radical Transparency: This is everything we store about you. If you see something we didn't mention, report it."
    }
  }
};

// Translation service instance (initialized per request)
// Uses open-source providers: LibreTranslate (primary) + NLLB (fallback)

const CHUNK_SIZE = 50;

/**
 * Flatten nested translation object
 */
function flattenTranslations(obj: any, prefix = ''): Record<string, string> {
  const flattened: Record<string, string> = {};
  for (const key in obj) {
    const newKey = prefix ? `${prefix}.${key}` : key;
    if (typeof obj[key] === 'object' && obj[key] !== null && !Array.isArray(obj[key])) {
      Object.assign(flattened, flattenTranslations(obj[key], newKey));
    } else {
      flattened[newKey] = String(obj[key]);
    }
  }
  return flattened;
}

/**
 * Unflatten translation object
 */
function unflattenTranslations(obj: Record<string, string>): any {
  const result: any = {};
  for (const key in obj) {
    const keys = key.split('.');
    let current = result;
    for (let i = 0; i < keys.length - 1; i++) {
      if (!(keys[i] in current)) {
        current[keys[i]] = {};
      }
      current = current[keys[i]];
    }
    current[keys[keys.length - 1]] = obj[key];
  }
  return result;
}

/**
 * Get translation service configuration from environment
 */
function getTranslationConfig(env: Env) {
  return {
    libreTranslateUrl: env.LIBRETRANSLATE_URL,
    libreTranslateApiKey: env.LIBRETRANSLATE_API_KEY,
    huggingFaceApiKey: env.HUGGINGFACE_API_KEY,
    requestTimeout: 10000, // 10 seconds default
  };
}

/**
 * Get translations for a language
 * Priority: Manual translations > Cache > Open-source translation API > English fallback
 */
async function getTranslations(
  language: string,
  env: Env,
  cache?: TranslationCache
): Promise<Record<string, string>> {
  // 1. Check manual translations first (highest quality, never cached)
  if (MANUAL_TRANSLATIONS[language]) {
    return flattenTranslations(MANUAL_TRANSLATIONS[language]);
  }

  // 2. Use open-source translation service if available
  if (language !== 'en') {
    const config = getTranslationConfig(env);
    const translationService = new HybridTranslationService(config);

    // Check if any provider is available
    const hasProvider = config.libreTranslateUrl || config.huggingFaceApiKey;
    
    if (hasProvider) {
      try {
        const englishTranslations = flattenTranslations(MANUAL_TRANSLATIONS.en);
        const translated: Record<string, string> = {};
        const keys = Object.keys(englishTranslations);
        const batchSize = 10; // Batch size for translation requests

        // Check cache for each translation key
        const uncachedKeys: string[] = [];
        const cachedTranslations: Record<string, string> = {};

        // Import metrics tracking
        const { trackTranslationComplete } = await import('./translation-metrics');

        if (cache) {
          // Check cache for all keys
          for (const key of keys) {
            const sourceText = englishTranslations[key];
            const cached = await cache.get(sourceText, 'en', language);
            
            if (cached) {
              cachedTranslations[key] = cached;
              // Track cache hit
              trackTranslationComplete(
                Date.now(),
                'Cache',
                'en',
                language,
                true,
                { fromCache: true, textLength: sourceText.length }
              );
            } else {
              uncachedKeys.push(key);
              // Track cache miss
              trackTranslationComplete(
                Date.now(),
                'Cache',
                'en',
                language,
                false,
                { fromCache: false, textLength: sourceText.length }
              );
            }
          }
        } else {
          // No cache, translate all
          uncachedKeys.push(...keys);
        }

        // Translate uncached keys in batches
        for (let i = 0; i < uncachedKeys.length; i += batchSize) {
          const batch = uncachedKeys.slice(i, i + batchSize);
          const texts = batch.map(key => englishTranslations[key]);

          try {
            // Use batch translation if available
            const translations = await translationService.translateBatch(
              texts,
              language,
              'en',
              config
            );

            batch.forEach((key, index) => {
              const translatedText = translations[index] || englishTranslations[key];
              translated[key] = translatedText;

              // Cache the translation
              if (cache && translatedText !== englishTranslations[key]) {
                cache.set(
                  englishTranslations[key],
                  'en',
                  language,
                  translatedText,
                  {
                    provider: 'HybridTranslationService',
                  }
                ).catch(error => {
                  console.error(`Failed to cache translation for ${key}:`, error);
                });
              }
            });
          } catch (error) {
            // Fallback to English for this batch on error
            console.error(`Translation batch failed for ${language}:`, error);
            batch.forEach(key => {
              translated[key] = englishTranslations[key];
            });
          }
        }

        // Merge cached and newly translated
        return { ...cachedTranslations, ...translated };
      } catch (error) {
        console.error(`Open-source translation failed for ${language}:`, error);
        // Fall through to English fallback
      }
    }
  }

  // 3. Fallback to English
  return flattenTranslations(MANUAL_TRANSLATIONS.en);
}

/**
 * Get available languages
 * Returns 7,019 language codes supported via open-source translation providers
 */
function getAvailableLanguages(env: Env): string[] {
  // Get all 7,019 languages from universal language database
  // All languages are supported via open-source translation providers
  // (direct translation or translation chains)
  return getAllUniversalLanguageCodes();
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const url = new URL(request.url);
  const pathParts = url.pathname.split('/').filter(Boolean);
  
  // Extract i18n path (remove 'api' and 'i18n' prefixes)
  const i18nIndex = pathParts.indexOf('i18n');
  const i18nPath = i18nIndex >= 0 ? pathParts.slice(i18nIndex + 1) : [];

  // Create translation cache (with KV if available)
  const cache = createTranslationCache(env.TRANSLATION_CACHE || null, {
    enabled: true,
    version: '1.0.0',
    ttl: 30 * 24 * 60 * 60, // 30 days
  });

  const allowedOrigins = [
    'https://www.warmthly.org',
    'https://mint.warmthly.org',
    'https://post.warmthly.org',
    'https://admin.warmthly.org',
  ];

  const origin = request.headers.get('Origin') || '';
  const isAllowedOrigin = allowedOrigins.some(allowed => origin.includes(allowed));

  const corsHeaders = {
    'Access-Control-Allow-Origin': isAllowedOrigin ? origin : allowedOrigins[0],
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  // Handle CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // GET /api/i18n/languages
  if (request.method === 'GET' && i18nPath.length === 1 && i18nPath[0] === 'languages') {
    return new Response(
      JSON.stringify({ languages: getAvailableLanguages(env) }),
      { headers: corsHeaders }
    );
  }

  // POST /api/i18n/:language/chunk
  if (request.method === 'POST' && i18nPath.length === 2 && i18nPath[1] === 'chunk') {
    const language = i18nPath[0];
    
    try {
      const body = await request.json() as { keys?: string[] };
      const requestedKeys = body.keys || [];

      // Get all translations
      const allTranslations = await getTranslations(language, env);

      // Filter to requested keys
      const chunk: Record<string, string> = {};
      for (const key of requestedKeys) {
        if (key in allTranslations) {
          chunk[key] = allTranslations[key];
        }
      }

      return new Response(
        JSON.stringify({
          translations: chunk,
          keys: requestedKeys,
          total: Object.keys(allTranslations).length,
        }),
        { headers: corsHeaders }
      );
    } catch (error) {
      console.error(`Error fetching chunk for ${language}:`, error);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch translation chunk' }),
        { status: 500, headers: corsHeaders }
      );
    }
  }

  // GET /api/i18n/:language
  if (request.method === 'GET' && i18nPath.length === 1) {
    const language = i18nPath[0];
    const urlParams = new URLSearchParams(url.search);
    const chunked = urlParams.get('chunked') === 'true';
    const keysOnly = urlParams.get('keys') === 'true';

    try {
      const allTranslations = await getTranslations(language, env, cache);
      const allKeys = Object.keys(allTranslations);

      // Return keys list if requested
      if (keysOnly) {
        return new Response(
          JSON.stringify({
            keys: allKeys,
            total: allKeys.length,
            chunkSize: CHUNK_SIZE,
          }),
          { headers: corsHeaders }
        );
      }

      // Return chunked format if requested
      if (chunked) {
        const chunks = [];
        for (let i = 0; i < allKeys.length; i += CHUNK_SIZE) {
          const chunkKeys = allKeys.slice(i, i + CHUNK_SIZE);
          const chunk: Record<string, string> = {};
          for (const key of chunkKeys) {
            chunk[key] = allTranslations[key];
          }
          chunks.push(chunk);
        }

        return new Response(
          JSON.stringify({
            chunks,
            total: allKeys.length,
            chunkSize: CHUNK_SIZE,
          }),
          { headers: corsHeaders }
        );
      }

      // Return full translations
      return new Response(
        JSON.stringify({
          translations: unflattenTranslations(allTranslations),
          version: '1.0.0',
        }),
        { headers: corsHeaders }
      );
    } catch (error) {
      console.error(`Error fetching translations for ${language}:`, error);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch translations' }),
        { status: 500, headers: corsHeaders }
      );
    }
  }

  // 404 for unknown routes
  return new Response(
    JSON.stringify({ error: 'Not found' }),
    { status: 404, headers: corsHeaders }
  );
};

