/**
 * Open-Source Translation Service
 * Privacy-first hybrid translation using multiple open-source providers
 * 
 * Provider Priority Chain:
 * 1. LibreTranslate (self-hosted, private) - 50+ languages, high quality
 * 2. NLLB via Hugging Face Inference API (Meta's open-source model) - 200+ languages
 * 3. OPUS-MT via Hugging Face (specialized language pairs) - 100+ language pairs
 * 4. M2M-100 via Hugging Face (direct translation, no English pivot) - 100+ languages
 * 
 * All providers are open-source and privacy-respecting
 */

interface TranslationProvider {
  name: string;
  translate(text: string, targetLang: string, sourceLang: string, config: TranslationConfig): Promise<string>;
  isAvailable(config: TranslationConfig): boolean;
  getSupportedLanguages(config: TranslationConfig): string[];
}

interface TranslationConfig {
  libreTranslateUrl?: string;
  libreTranslateApiKey?: string;
  huggingFaceApiKey?: string;
  requestTimeout?: number;
}

// Language code mappings for different providers
const LIBRETRANSLATE_LANGUAGES: Record<string, string> = {
  'en': 'en', 'es': 'es', 'fr': 'fr', 'de': 'de', 'it': 'it', 'pt': 'pt',
  'ru': 'ru', 'ja': 'ja', 'zh': 'zh', 'pl': 'pl', 'nl': 'nl', 'sv': 'sv',
  'da': 'da', 'no': 'no', 'fi': 'fi', 'el': 'el', 'cs': 'cs', 'hu': 'hu',
  'ro': 'ro', 'sk': 'sk', 'sl': 'sl', 'bg': 'bg', 'hr': 'hr', 'et': 'et',
  'lv': 'lv', 'lt': 'lt', 'uk': 'uk', 'tr': 'tr', 'id': 'id', 'ko': 'ko',
  'ar': 'ar', 'he': 'he', 'fa': 'fa', 'hi': 'hi', 'th': 'th', 'vi': 'vi',
  'ms': 'ms', 'sw': 'sw', 'af': 'af', 'ga': 'ga', 'cy': 'cy', 'is': 'is',
  'mt': 'mt', 'mk': 'mk', 'sr': 'sr', 'bs': 'bs', 'sq': 'sq', 'be': 'be',
  'ka': 'ka', 'hy': 'hy', 'az': 'az', 'kk': 'kk', 'ky': 'ky', 'uz': 'uz',
  'mn': 'mn', 'bn': 'bn', 'ta': 'ta', 'te': 'te', 'mr': 'mr', 'gu': 'gu',
  'kn': 'kn', 'ml': 'ml', 'pa': 'pa', 'ne': 'ne', 'si': 'si', 'my': 'my',
  'km': 'km', 'lo': 'lo', 'tl': 'tl', 'jv': 'jv', 'su': 'su', 'zu': 'zu',
  'xh': 'xh', 'am': 'am', 'ha': 'ha', 'yo': 'yo', 'ig': 'ig', 'ur': 'ur',
  'yi': 'yi', 'sd': 'sd', 'ug': 'ug', 'ku': 'ku', 'or': 'or', 'as': 'as',
  'ceb': 'ceb'
};

// NLLB supports 200+ languages via Hugging Face
// Language codes are ISO 639-1/639-3 compatible
const NLLB_LANGUAGES = new Set([
  'en', 'es', 'fr', 'de', 'it', 'pt', 'ru', 'ja', 'zh', 'pl', 'nl', 'sv',
  'da', 'no', 'fi', 'el', 'cs', 'hu', 'ro', 'sk', 'sl', 'bg', 'hr', 'et',
  'lv', 'lt', 'uk', 'tr', 'id', 'ko', 'ar', 'he', 'fa', 'hi', 'bn', 'ta',
  'te', 'mr', 'gu', 'kn', 'ml', 'pa', 'th', 'vi', 'ms', 'sw', 'af', 'zu',
  'xh', 'am', 'ha', 'yo', 'ig', 'ur', 'yi', 'sd', 'ug', 'ku', 'or', 'as',
  'ne', 'si', 'my', 'km', 'lo', 'tl', 'jv', 'su', 'ceb', 'ga', 'cy', 'gd',
  'is', 'mt', 'mk', 'sr', 'bs', 'sq', 'be', 'ka', 'hy', 'az', 'kk', 'ky',
  'uz', 'mn'
  // NLLB supports 200+ languages - this is a subset
  // In production, expand to full NLLB language list
]);

/**
 * LibreTranslate Provider (Primary - Self-hosted, Private)
 * Open-source, self-hostable translation API
 */
class LibreTranslateProvider implements TranslationProvider {
  name = 'LibreTranslate';

  isAvailable(config: TranslationConfig): boolean {
    return !!config.libreTranslateUrl;
  }

  getSupportedLanguages(config: TranslationConfig): string[] {
    return Object.keys(LIBRETRANSLATE_LANGUAGES);
  }

  async translate(
    text: string,
    targetLang: string,
    sourceLang: string,
    config: TranslationConfig
  ): Promise<string> {
    if (!config.libreTranslateUrl) {
      throw new Error('LibreTranslate URL not configured');
    }

    const targetCode = LIBRETRANSLATE_LANGUAGES[targetLang] || targetLang;
    const sourceCode = LIBRETRANSLATE_LANGUAGES[sourceLang] || sourceLang;

    const url = `${config.libreTranslateUrl}/translate`;
    const timeout = config.requestTimeout || 10000;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const body: Record<string, string> = {
        q: text,
        source: sourceCode,
        target: targetCode,
        format: 'text'
      };

      if (config.libreTranslateApiKey) {
        body.api_key = config.libreTranslateApiKey;
      }

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`LibreTranslate API error: ${response.status}`);
      }

      const data = await response.json();
      return data.translatedText || text;
    } catch (error: any) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        throw new Error('Translation request timeout');
      }
      throw error;
    }
  }
}

/**
 * NLLB (No Language Left Behind) via Hugging Face Inference API
 * Meta's open-source model supporting 200+ languages
 */
class NLLBProvider implements TranslationProvider {
  name = 'NLLB (Hugging Face)';

  isAvailable(config: TranslationConfig): boolean {
    // Hugging Face Inference API has a free tier
    // Can work without API key for some models, but better with key
    return true; // Always available (free tier)
  }

  getSupportedLanguages(config: TranslationConfig): string[] {
    return Array.from(NLLB_LANGUAGES);
  }

  async translate(
    text: string,
    targetLang: string,
    sourceLang: string,
    config: TranslationConfig
  ): Promise<string> {
    // NLLB model ID on Hugging Face
    // Using facebook/nllb-200-3.3B for good balance of quality and speed
    const modelId = 'facebook/nllb-200-3.3B';
    
    // Map ISO 639-1 to NLLB language codes (NLLB uses ISO 639-3)
    const nllbCode = this.mapToNLLBCode(targetLang);
    const sourceNllbCode = this.mapToNLLBCode(sourceLang);

    const url = `https://api-inference.huggingface.co/models/${modelId}`;
    const timeout = config.requestTimeout || 15000; // NLLB can be slower

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      if (config.huggingFaceApiKey) {
        headers['Authorization'] = `Bearer ${config.huggingFaceApiKey}`;
      }

      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          inputs: text,
          parameters: {
            src_lang: sourceNllbCode,
            tgt_lang: nllbCode,
          },
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        // Hugging Face may return 503 if model is loading
        if (response.status === 503) {
          throw new Error('Translation model is loading, please retry');
        }
        throw new Error(`NLLB API error: ${response.status}`);
      }

      const data = await response.json();
      
      // Hugging Face returns array format
      if (Array.isArray(data) && data.length > 0) {
        return data[0].translation_text || text;
      }
      
      if (data.generated_text) {
        return data.generated_text;
      }

      return text;
    } catch (error: any) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        throw new Error('Translation request timeout');
      }
      throw error;
    }
  }

  /**
   * Map ISO 639-1 codes to NLLB language codes (ISO 639-3)
   * NLLB uses 3-letter codes for many languages
   */
  private mapToNLLBCode(lang: string): string {
    // Common mappings - expand as needed
    const mappings: Record<string, string> = {
      'en': 'eng_Latn',
      'es': 'spa_Latn',
      'fr': 'fra_Latn',
      'de': 'deu_Latn',
      'it': 'ita_Latn',
      'pt': 'por_Latn',
      'ru': 'rus_Cyrl',
      'ja': 'jpn_Jpan',
      'zh': 'zho_Hans',
      'ar': 'arb_Arab',
      'hi': 'hin_Deva',
      'ko': 'kor_Hang',
      'th': 'tha_Thai',
      'vi': 'vie_Latn',
      'tr': 'tur_Latn',
      'pl': 'pol_Latn',
      'nl': 'nld_Latn',
      'sv': 'swe_Latn',
      'da': 'dan_Latn',
      'no': 'nob_Latn',
      'fi': 'fin_Latn',
      'el': 'ell_Grek',
      'cs': 'ces_Latn',
      'hu': 'hun_Latn',
      'ro': 'ron_Latn',
      'he': 'heb_Hebr',
      'fa': 'pes_Arab',
      'ur': 'urd_Arab',
      'bn': 'ben_Beng',
      'ta': 'tam_Taml',
      'te': 'tel_Telu',
      'mr': 'mar_Deva',
      'gu': 'guj_Gujr',
      'kn': 'kan_Knda',
      'ml': 'mal_Mlym',
      'pa': 'pan_Guru',
      'ne': 'nep_Deva',
      'si': 'sin_Sinh',
      'my': 'mya_Mymr',
      'km': 'khm_Khmr',
      'lo': 'lao_Laoo',
      'ms': 'zsm_Latn',
      'sw': 'swh_Latn',
      'af': 'afr_Latn',
      'zu': 'zul_Latn',
      'xh': 'xho_Latn',
      'am': 'amh_Ethi',
      'ha': 'hau_Latn',
      'yo': 'yor_Latn',
      'ig': 'ibo_Latn',
    };

    return mappings[lang] || `${lang}_Latn`; // Default fallback
  }
}

/**
 * OPUS-MT Provider
 * Specialized translation models for specific language pairs
 * Uses Hugging Face Inference API
 */
class OPUSMTProvider implements TranslationProvider {
  name = 'OPUS-MT (Hugging Face)';

  // OPUS-MT models are specialized for specific language pairs
  // Common models available on Hugging Face
  private readonly OPUS_MODELS: Record<string, string> = {
    // English to/from major languages
    'en-de': 'Helsinki-NLP/opus-mt-en-de',
    'de-en': 'Helsinki-NLP/opus-mt-de-en',
    'en-fr': 'Helsinki-NLP/opus-mt-en-fr',
    'fr-en': 'Helsinki-NLP/opus-mt-fr-en',
    'en-es': 'Helsinki-NLP/opus-mt-en-es',
    'es-en': 'Helsinki-NLP/opus-mt-es-en',
    'en-it': 'Helsinki-NLP/opus-mt-en-it',
    'it-en': 'Helsinki-NLP/opus-mt-it-en',
    'en-pt': 'Helsinki-NLP/opus-mt-en-pt',
    'pt-en': 'Helsinki-NLP/opus-mt-pt-en',
    'en-ru': 'Helsinki-NLP/opus-mt-en-ru',
    'ru-en': 'Helsinki-NLP/opus-mt-ru-en',
    'en-zh': 'Helsinki-NLP/opus-mt-en-zh',
    'zh-en': 'Helsinki-NLP/opus-mt-zh-en',
    'en-ja': 'Helsinki-NLP/opus-mt-en-jap',
    'ja-en': 'Helsinki-NLP/opus-mt-jap-en',
    'en-ar': 'Helsinki-NLP/opus-mt-en-ar',
    'ar-en': 'Helsinki-NLP/opus-mt-ar-en',
    'en-hi': 'Helsinki-NLP/opus-mt-en-hi',
    'hi-en': 'Helsinki-NLP/opus-mt-hi-en',
    'en-nl': 'Helsinki-NLP/opus-mt-en-nl',
    'nl-en': 'Helsinki-NLP/opus-mt-nl-en',
    'en-sv': 'Helsinki-NLP/opus-mt-en-sv',
    'sv-en': 'Helsinki-NLP/opus-mt-sv-en',
    'en-fi': 'Helsinki-NLP/opus-mt-en-fi',
    'fi-en': 'Helsinki-NLP/opus-mt-fi-en',
    'en-pl': 'Helsinki-NLP/opus-mt-en-pl',
    'pl-en': 'Helsinki-NLP/opus-mt-pl-en',
    'en-tr': 'Helsinki-NLP/opus-mt-en-tr',
    'tr-en': 'Helsinki-NLP/opus-mt-tr-en',
    'en-vi': 'Helsinki-NLP/opus-mt-en-vi',
    'vi-en': 'Helsinki-NLP/opus-mt-vi-en',
    'en-th': 'Helsinki-NLP/opus-mt-en-th',
    'th-en': 'Helsinki-NLP/opus-mt-th-en',
    'en-ko': 'Helsinki-NLP/opus-mt-en-ko',
    'ko-en': 'Helsinki-NLP/opus-mt-ko-en',
    'en-he': 'Helsinki-NLP/opus-mt-en-he',
    'he-en': 'Helsinki-NLP/opus-mt-he-en',
    'en-cs': 'Helsinki-NLP/opus-mt-en-cs',
    'cs-en': 'Helsinki-NLP/opus-mt-cs-en',
    'en-hu': 'Helsinki-NLP/opus-mt-en-hu',
    'hu-en': 'Helsinki-NLP/opus-mt-hu-en',
    'en-ro': 'Helsinki-NLP/opus-mt-en-ro',
    'ro-en': 'Helsinki-NLP/opus-mt-ro-en',
    'en-bg': 'Helsinki-NLP/opus-mt-en-bg',
    'bg-en': 'Helsinki-NLP/opus-mt-bg-en',
    'en-uk': 'Helsinki-NLP/opus-mt-en-uk',
    'uk-en': 'Helsinki-NLP/opus-mt-uk-en',
    'en-sk': 'Helsinki-NLP/opus-mt-en-sk',
    'sk-en': 'Helsinki-NLP/opus-mt-sk-en',
    'en-sl': 'Helsinki-NLP/opus-mt-en-sl',
    'sl-en': 'Helsinki-NLP/opus-mt-sl-en',
    'en-hr': 'Helsinki-NLP/opus-mt-en-hr',
    'hr-en': 'Helsinki-NLP/opus-mt-hr-en',
    'en-et': 'Helsinki-NLP/opus-mt-en-et',
    'et-en': 'Helsinki-NLP/opus-mt-et-en',
    'en-lv': 'Helsinki-NLP/opus-mt-en-lv',
    'lv-en': 'Helsinki-NLP/opus-mt-lv-en',
    'en-lt': 'Helsinki-NLP/opus-mt-en-lt',
    'lt-en': 'Helsinki-NLP/opus-mt-lt-en',
    'en-mt': 'Helsinki-NLP/opus-mt-en-mt',
    'mt-en': 'Helsinki-NLP/opus-mt-mt-en',
    'en-ga': 'Helsinki-NLP/opus-mt-en-ga',
    'ga-en': 'Helsinki-NLP/opus-mt-ga-en',
    'en-cy': 'Helsinki-NLP/opus-mt-en-cy',
    'cy-en': 'Helsinki-NLP/opus-mt-cy-en',
    'en-is': 'Helsinki-NLP/opus-mt-en-is',
    'is-en': 'Helsinki-NLP/opus-mt-is-en',
    'en-mk': 'Helsinki-NLP/opus-mt-en-mk',
    'mk-en': 'Helsinki-NLP/opus-mt-mk-en',
    'en-sr': 'Helsinki-NLP/opus-mt-en-sr',
    'sr-en': 'Helsinki-NLP/opus-mt-sr-en',
    'en-bs': 'Helsinki-NLP/opus-mt-en-bs',
    'bs-en': 'Helsinki-NLP/opus-mt-bs-en',
    'en-sq': 'Helsinki-NLP/opus-mt-en-sq',
    'sq-en': 'Helsinki-NLP/opus-mt-sq-en',
    'en-be': 'Helsinki-NLP/opus-mt-en-be',
    'be-en': 'Helsinki-NLP/opus-mt-be-en',
    'en-ka': 'Helsinki-NLP/opus-mt-en-ka',
    'ka-en': 'Helsinki-NLP/opus-mt-ka-en',
    'en-hy': 'Helsinki-NLP/opus-mt-en-hy',
    'hy-en': 'Helsinki-NLP/opus-mt-hy-en',
    'en-az': 'Helsinki-NLP/opus-mt-en-az',
    'az-en': 'Helsinki-NLP/opus-mt-az-en',
    'en-kk': 'Helsinki-NLP/opus-mt-en-kk',
    'kk-en': 'Helsinki-NLP/opus-mt-kk-en',
    'en-ky': 'Helsinki-NLP/opus-mt-en-ky',
    'ky-en': 'Helsinki-NLP/opus-mt-ky-en',
    'en-uz': 'Helsinki-NLP/opus-mt-en-uz',
    'uz-en': 'Helsinki-NLP/opus-mt-uz-en',
    'en-mn': 'Helsinki-NLP/opus-mt-en-mn',
    'mn-en': 'Helsinki-NLP/opus-mt-mn-en',
    'en-bn': 'Helsinki-NLP/opus-mt-en-bn',
    'bn-en': 'Helsinki-NLP/opus-mt-bn-en',
    'en-ta': 'Helsinki-NLP/opus-mt-en-ta',
    'ta-en': 'Helsinki-NLP/opus-mt-ta-en',
    'en-te': 'Helsinki-NLP/opus-mt-en-te',
    'te-en': 'Helsinki-NLP/opus-mt-te-en',
    'en-mr': 'Helsinki-NLP/opus-mt-en-mr',
    'mr-en': 'Helsinki-NLP/opus-mt-mr-en',
    'en-gu': 'Helsinki-NLP/opus-mt-en-gu',
    'gu-en': 'Helsinki-NLP/opus-mt-gu-en',
    'en-kn': 'Helsinki-NLP/opus-mt-en-kn',
    'kn-en': 'Helsinki-NLP/opus-mt-kn-en',
    'en-ml': 'Helsinki-NLP/opus-mt-en-ml',
    'ml-en': 'Helsinki-NLP/opus-mt-ml-en',
    'en-pa': 'Helsinki-NLP/opus-mt-en-pa',
    'pa-en': 'Helsinki-NLP/opus-mt-pa-en',
    'en-ne': 'Helsinki-NLP/opus-mt-en-ne',
    'ne-en': 'Helsinki-NLP/opus-mt-ne-en',
    'en-si': 'Helsinki-NLP/opus-mt-en-si',
    'si-en': 'Helsinki-NLP/opus-mt-si-en',
    'en-my': 'Helsinki-NLP/opus-mt-en-my',
    'my-en': 'Helsinki-NLP/opus-mt-my-en',
    'en-km': 'Helsinki-NLP/opus-mt-en-km',
    'km-en': 'Helsinki-NLP/opus-mt-km-en',
    'en-lo': 'Helsinki-NLP/opus-mt-en-lo',
    'lo-en': 'Helsinki-NLP/opus-mt-lo-en',
    'en-ms': 'Helsinki-NLP/opus-mt-en-ms',
    'ms-en': 'Helsinki-NLP/opus-mt-ms-en',
    'en-sw': 'Helsinki-NLP/opus-mt-en-sw',
    'sw-en': 'Helsinki-NLP/opus-mt-sw-en',
    'en-af': 'Helsinki-NLP/opus-mt-en-af',
    'af-en': 'Helsinki-NLP/opus-mt-af-en',
    'en-zu': 'Helsinki-NLP/opus-mt-en-zu',
    'zu-en': 'Helsinki-NLP/opus-mt-zu-en',
    'en-xh': 'Helsinki-NLP/opus-mt-en-xh',
    'xh-en': 'Helsinki-NLP/opus-mt-xh-en',
    'en-am': 'Helsinki-NLP/opus-mt-en-am',
    'am-en': 'Helsinki-NLP/opus-mt-am-en',
    'en-ha': 'Helsinki-NLP/opus-mt-en-ha',
    'ha-en': 'Helsinki-NLP/opus-mt-ha-en',
    'en-yo': 'Helsinki-NLP/opus-mt-en-yo',
    'yo-en': 'Helsinki-NLP/opus-mt-yo-en',
    'en-ig': 'Helsinki-NLP/opus-mt-en-ig',
    'ig-en': 'Helsinki-NLP/opus-mt-ig-en',
    'en-ur': 'Helsinki-NLP/opus-mt-en-ur',
    'ur-en': 'Helsinki-NLP/opus-mt-ur-en',
    'en-yi': 'Helsinki-NLP/opus-mt-en-yi',
    'yi-en': 'Helsinki-NLP/opus-mt-yi-en',
    'en-sd': 'Helsinki-NLP/opus-mt-en-sd',
    'sd-en': 'Helsinki-NLP/opus-mt-sd-en',
    'en-ug': 'Helsinki-NLP/opus-mt-en-ug',
    'ug-en': 'Helsinki-NLP/opus-mt-ug-en',
    'en-ku': 'Helsinki-NLP/opus-mt-en-ku',
    'ku-en': 'Helsinki-NLP/opus-mt-ku-en',
    'en-or': 'Helsinki-NLP/opus-mt-en-or',
    'or-en': 'Helsinki-NLP/opus-mt-or-en',
    'en-as': 'Helsinki-NLP/opus-mt-en-as',
    'as-en': 'Helsinki-NLP/opus-mt-as-en',
  };

  isAvailable(config: TranslationConfig): boolean {
    // OPUS-MT uses Hugging Face Inference API
    return true; // Always available (free tier)
  }

  getSupportedLanguages(config: TranslationConfig): string[] {
    // Return languages that have OPUS-MT models
    const languages = new Set<string>();
    for (const pair of Object.keys(this.OPUS_MODELS)) {
      const [source, target] = pair.split('-');
      languages.add(source);
      languages.add(target);
    }
    return Array.from(languages).sort();
  }

  /**
   * Get OPUS-MT model for language pair
   */
  private getModelForPair(sourceLang: string, targetLang: string): string | null {
    const pair = `${sourceLang}-${targetLang}`;
    return this.OPUS_MODELS[pair] || null;
  }

  /**
   * Check if language pair is supported
   */
  private isPairSupported(sourceLang: string, targetLang: string): boolean {
    return this.getModelForPair(sourceLang, targetLang) !== null;
  }

  async translate(
    text: string,
    targetLang: string,
    sourceLang: string,
    config: TranslationConfig
  ): Promise<string> {
    // Check if this language pair is supported
    if (!this.isPairSupported(sourceLang, targetLang)) {
      throw new Error(`OPUS-MT does not support ${sourceLang} -> ${targetLang}`);
    }

    const modelId = this.getModelForPair(sourceLang, targetLang);
    if (!modelId) {
      throw new Error(`OPUS-MT model not found for ${sourceLang} -> ${targetLang}`);
    }

    const url = `https://api-inference.huggingface.co/models/${modelId}`;
    const timeout = config.requestTimeout || 12000; // OPUS-MT can be slower

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      if (config.huggingFaceApiKey) {
        headers['Authorization'] = `Bearer ${config.huggingFaceApiKey}`;
      }

      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          inputs: text,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        if (response.status === 503) {
          throw new Error('OPUS-MT model is loading, please retry');
        }
        throw new Error(`OPUS-MT API error: ${response.status}`);
      }

      const data = await response.json();
      
      // OPUS-MT returns translation_text in the response
      if (Array.isArray(data) && data.length > 0) {
        return data[0].translation_text || text;
      }
      
      if (data.generated_text) {
        return data.generated_text;
      }

      if (typeof data === 'string') {
        return data;
      }

      return text;
    } catch (error: any) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        throw new Error('OPUS-MT translation request timeout');
      }
      throw error;
    }
  }
}

/**
 * M2M-100 Provider
 * Facebook's Many-to-Many translation model
 * Supports 100+ languages with direct translation (no English pivot)
 */
class M2M100Provider implements TranslationProvider {
  name = 'M2M-100 (Hugging Face)';

  // M2M-100 supports 100+ languages
  // Using the 418M model (smaller, faster) or 1.2B (larger, better quality)
  private readonly MODEL_ID = 'facebook/m2m100_418M'; // Can use 'facebook/m2m100_1.2B' for better quality

  // M2M-100 language codes (ISO 639-1/639-3 compatible)
  private readonly M2M100_LANGUAGES = new Set([
    'en', 'es', 'fr', 'de', 'it', 'pt', 'ru', 'ja', 'zh', 'pl', 'nl', 'sv',
    'da', 'no', 'fi', 'el', 'cs', 'hu', 'ro', 'sk', 'sl', 'bg', 'hr', 'et',
    'lv', 'lt', 'uk', 'tr', 'id', 'ko', 'ar', 'he', 'fa', 'hi', 'bn', 'ta',
    'te', 'mr', 'gu', 'kn', 'ml', 'pa', 'th', 'vi', 'ms', 'sw', 'af', 'zu',
    'xh', 'am', 'ha', 'yo', 'ig', 'ur', 'yi', 'sd', 'ug', 'ku', 'or', 'as',
    'ne', 'si', 'my', 'km', 'lo', 'tl', 'jv', 'su', 'ceb', 'ga', 'cy', 'gd',
    'is', 'mt', 'mk', 'sr', 'bs', 'sq', 'be', 'ka', 'hy', 'az', 'kk', 'ky',
    'uz', 'mn', 'rw', 'rn', 'ny', 'sn', 'st', 'tn', 've', 'ts', 'ss', 'nso',
    'lg', 'ak', 'wo', 'ff', 'bm', 'dyu', 'fon', 'ewe', 'tw', 'kik', 'kam',
    'luy', 'mer', 'so', 'om', 'kln', 'luo', 'ti', 'bo', 'dz', 'new', 'mai',
    'bho', 'mag', 'hne', 'sat', 'kok', 'doi', 'mni', 'ks', 'ban', 'bug', 'min',
    'ace', 'bjn', 'mad', 'bbc', 'btx', 'bts', 'pam', 'pag', 'war', 'ilo', 'bcl',
  ]);

  isAvailable(config: TranslationConfig): boolean {
    // M2M-100 uses Hugging Face Inference API
    return true; // Always available (free tier)
  }

  getSupportedLanguages(config: TranslationConfig): string[] {
    return Array.from(this.M2M100_LANGUAGES).sort();
  }

  /**
   * Map language code to M2M-100 format
   * M2M-100 uses ISO 639-1/639-3 codes directly
   */
  private mapToM2M100Code(lang: string): string {
    // M2M-100 accepts ISO 639-1 and ISO 639-3 codes
    // Return as-is if it's a valid code
    return lang;
  }

  async translate(
    text: string,
    targetLang: string,
    sourceLang: string,
    config: TranslationConfig
  ): Promise<string> {
    // Check if both languages are supported
    if (!this.M2M100_LANGUAGES.has(sourceLang) || !this.M2M100_LANGUAGES.has(targetLang)) {
      throw new Error(`M2M-100 does not support ${sourceLang} -> ${targetLang}`);
    }

    const url = `https://api-inference.huggingface.co/models/${this.MODEL_ID}`;
    const timeout = config.requestTimeout || 15000; // M2M-100 can be slower

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      if (config.huggingFaceApiKey) {
        headers['Authorization'] = `Bearer ${config.huggingFaceApiKey}`;
      }

      const sourceCode = this.mapToM2M100Code(sourceLang);
      const targetCode = this.mapToM2M100Code(targetLang);

      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          inputs: text,
          parameters: {
            src_lang: sourceCode,
            tgt_lang: targetCode,
          },
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        if (response.status === 503) {
          throw new Error('M2M-100 model is loading, please retry');
        }
        throw new Error(`M2M-100 API error: ${response.status}`);
      }

      const data = await response.json();
      
      // M2M-100 returns translation_text in the response
      if (Array.isArray(data) && data.length > 0) {
        return data[0].translation_text || text;
      }
      
      if (data.generated_text) {
        return data.generated_text;
      }

      if (typeof data === 'string') {
        return data;
      }

      return text;
    } catch (error: any) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        throw new Error('M2M-100 translation request timeout');
      }
      throw error;
    }
  }
}

/**
 * Provider-specific configuration
 */
interface ProviderConfig {
  timeout?: number;
  batchSize?: number;
  priority?: number; // Higher priority = tried first
}

/**
 * Hybrid Translation Service
 * Tries providers in parallel and selects best quality result
 * Provider order: LibreTranslate -> NLLB -> OPUS-MT -> M2M-100
 */
export class HybridTranslationService {
  private providers: TranslationProvider[];
  private providerConfigs: Map<string, ProviderConfig>;

  constructor(config: TranslationConfig) {
    this.providers = [
      new LibreTranslateProvider(),
      new NLLBProvider(),
      new OPUSMTProvider(),
      new M2M100Provider(),
    ];
    
    // Provider-specific optimizations
    this.providerConfigs = new Map([
      ['LibreTranslate', { timeout: 10000, batchSize: 50, priority: 4 }],
      ['NLLB (Hugging Face)', { timeout: 15000, batchSize: 10, priority: 3 }],
      ['OPUS-MT (Hugging Face)', { timeout: 12000, batchSize: 5, priority: 2 }],
      ['M2M-100 (Hugging Face)', { timeout: 15000, batchSize: 5, priority: 1 }],
    ]);
  }

  /**
   * Translate text using available providers in parallel
   * Scores each result and returns the highest quality translation
   */
  async translate(
    text: string,
    targetLang: string,
    sourceLang: string = 'en',
    config: TranslationConfig
  ): Promise<string> {
    // Input validation and sanitization
    if (!text || typeof text !== 'string') {
      throw new Error('Invalid text input');
    }

    if (!targetLang || typeof targetLang !== 'string') {
      throw new Error('Invalid target language');
    }

    // Sanitize text (remove potential XSS)
    const sanitizedText = this.sanitizeText(text);

    // Get available providers sorted by priority
    const availableProviders = this.providers
      .filter(p => p.isAvailable(config))
      .sort((a, b) => {
        const configA = this.providerConfigs.get(a.name) || { priority: 0 };
        const configB = this.providerConfigs.get(b.name) || { priority: 0 };
        return (configB.priority || 0) - (configA.priority || 0);
      });

    if (availableProviders.length === 0) {
      throw new Error('No translation providers available');
    }

    // Import quality scoring and metrics (dynamic import to avoid circular dependencies)
    const { evaluateTranslationQuality, selectBestTranslation } = await import('./translation-quality');
    const { trackTranslationStart, trackTranslationComplete } = await import('./translation-metrics');

    // Try all providers in parallel with individual timeouts
    const translationPromises = availableProviders.map(async (provider) => {
      const providerConfig = this.providerConfigs.get(provider.name) || {};
      const timeout = providerConfig.timeout || config.requestTimeout || 15000;
      const startTime = Date.now();

      try {
        // Create a timeout promise
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error(`Provider ${provider.name} timeout`)), timeout);
        });

        // Race between translation and timeout
        const result = await Promise.race([
          provider.translate(sanitizedText, targetLang, sourceLang, {
            ...config,
            requestTimeout: timeout,
          }),
          timeoutPromise,
        ]);

        // Validate result
        if (result && typeof result === 'string' && result.length > 0) {
          // Track successful translation
          trackTranslationComplete(startTime, provider.name, sourceLang, targetLang, true, {
            textLength: sanitizedText.length,
          });

          return {
            text: result,
            provider: provider.name,
            error: null,
          };
        }

        // Track failed translation (empty result)
        trackTranslationComplete(startTime, provider.name, sourceLang, targetLang, false, {
          error: 'Empty or invalid translation result',
          textLength: sanitizedText.length,
        });

        return {
          text: null,
          provider: provider.name,
          error: new Error('Empty or invalid translation result'),
        };
      } catch (error: any) {
        // Track failed translation
        trackTranslationComplete(startTime, provider.name, sourceLang, targetLang, false, {
          error: error.message || String(error),
          textLength: sanitizedText.length,
        });

        return {
          text: null,
          provider: provider.name,
          error: error,
        };
      }
    });

    // Wait for all providers (or first successful one)
    const results = await Promise.allSettled(translationPromises);
    
    // Collect successful translations
    const successfulTranslations: Array<{ text: string; provider: string }> = [];
    
    for (const result of results) {
      if (result.status === 'fulfilled' && result.value.text) {
        successfulTranslations.push({
          text: result.value.text,
          provider: result.value.provider,
        });
      }
    }

    // If no successful translations, try sequential fallback
    if (successfulTranslations.length === 0) {
      const errors: Error[] = [];
      
      for (const provider of availableProviders) {
        try {
          const result = await provider.translate(
            sanitizedText,
            targetLang,
            sourceLang,
            config
          );

          if (result && typeof result === 'string' && result.length > 0) {
            return result;
          }
        } catch (error: any) {
          errors.push(error);
          continue;
        }
      }

      throw new Error(
        `Translation failed: ${errors.map(e => e.message).join('; ')}`
      );
    }

    // Score all successful translations and select the best
    if (successfulTranslations.length === 1) {
      return successfulTranslations[0].text;
    }

    // Use quality scoring to select best translation
    const bestTranslation = selectBestTranslation(successfulTranslations, {
      sourceText: sanitizedText,
      sourceLang,
      targetLang,
      threshold: 0.5, // Minimum quality threshold
    });

    if (bestTranslation && bestTranslation.score >= 0.5) {
      return bestTranslation.text;
    }

    // If quality is low, return the first result but log warning
    // In production, you might want to retry with different provider
    if (bestTranslation) {
      console.warn(
        `Translation quality is low (${bestTranslation.score.toFixed(2)}), ` +
        `but returning result from ${bestTranslation.provider}`
      );
      return bestTranslation.text;
    }

    // Fallback to first successful translation
    return successfulTranslations[0].text;
  }

  /**
   * Translate multiple texts in batch
   * Optimized for performance with batching
   */
  async translateBatch(
    texts: string[],
    targetLang: string,
    sourceLang: string = 'en',
    config: TranslationConfig
  ): Promise<string[]> {
    // Validate inputs
    if (!Array.isArray(texts)) {
      throw new Error('Texts must be an array');
    }

    if (texts.length === 0) {
      return [];
    }

    // Sanitize all texts
    const sanitizedTexts = texts.map(text => this.sanitizeText(text));

    // Try to use batch translation if available (LibreTranslate supports this)
    const libreTranslate = this.providers.find(p => p.name === 'LibreTranslate');
    
    if (libreTranslate && libreTranslate.isAvailable(config)) {
      try {
        return await this.translateBatchLibreTranslate(
          sanitizedTexts,
          targetLang,
          sourceLang,
          config
        );
      } catch (error) {
        // Fall back to individual translations
      }
    }

    // Fallback: translate individually (with concurrency limit)
    const results: string[] = [];
    const batchSize = 5; // Limit concurrent requests

    for (let i = 0; i < sanitizedTexts.length; i += batchSize) {
      const batch = sanitizedTexts.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map(text => this.translate(text, targetLang, sourceLang, config))
      );
      results.push(...batchResults);
    }

    return results;
  }

  /**
   * Batch translation via LibreTranslate
   */
  private async translateBatchLibreTranslate(
    texts: string[],
    targetLang: string,
    sourceLang: string,
    config: TranslationConfig
  ): Promise<string[]> {
    if (!config.libreTranslateUrl) {
      throw new Error('LibreTranslate URL not configured');
    }

    const targetCode = LIBRETRANSLATE_LANGUAGES[targetLang] || targetLang;
    const sourceCode = LIBRETRANSLATE_LANGUAGES[sourceLang] || sourceLang;

    const url = `${config.libreTranslateUrl}/translate`;
    const timeout = config.requestTimeout || 10000;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const body: Record<string, any> = {
        q: texts,
        source: sourceCode,
        target: targetCode,
        format: 'text'
      };

      if (config.libreTranslateApiKey) {
        body.api_key = config.libreTranslateApiKey;
      }

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`LibreTranslate batch API error: ${response.status}`);
      }

      const data = await response.json();
      return data.translatedText || texts;
    } catch (error: any) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        throw new Error('Translation request timeout');
      }
      throw error;
    }
  }

  /**
   * Sanitize text input to prevent XSS
   */
  private sanitizeText(text: string): string {
    // Remove potential script tags and event handlers
    return text
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/on\w+\s*=\s*["'][^"']*["']/gi, '')
      .trim();
  }

  /**
   * Get all supported languages across all providers
   */
  getSupportedLanguages(config: TranslationConfig): string[] {
    const languages = new Set<string>();

    for (const provider of this.providers) {
      if (provider.isAvailable(config)) {
        provider.getSupportedLanguages(config).forEach(lang => languages.add(lang));
      }
    }

    return Array.from(languages).sort();
  }
}

