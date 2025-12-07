/**
 * Comprehensive Language Support - Universal Language System
 * Supports 7,019 languages via open-source translation providers
 * Includes RTL language support and cultural adaptations
 * 
 * This file now uses universal-languages.ts as the source of truth
 */

import {
  UNIVERSAL_LANGUAGES,
  UniversalLanguageInfo,
  getAllUniversalLanguageCodes,
  getUniversalLanguageInfo,
  getAllRTLLanguages,
} from './universal-languages';

/**
 * ISO 639-1/639-2/639-3 language codes with metadata
 * Includes RTL languages, translation provider support, and locale mappings
 */
export interface LanguageMetadata {
  code: string; // ISO 639-1/639-2/639-3 code
  name: string; // English name
  nativeName: string; // Native name
  locale: string; // Locale code (e.g., 'en_US')
  rtl: boolean; // Right-to-left script
  deeplSupported: boolean; // Legacy - deprecated, always false
  deeplCode?: string; // Legacy - deprecated
  fallbackLang?: string; // Fallback language for translation chain
  region?: string; // Primary region
}

/**
 * Comprehensive list of 7,019 languages
 * Uses universal language database with open-source translation providers
 */
export const LANGUAGES: Record<string, LanguageMetadata> = 
  // Map universal languages to LanguageMetadata format
  Object.entries(UNIVERSAL_LANGUAGES).reduce((acc, [code, lang]) => {
    acc[code] = {
      code: lang.code,
      name: lang.name,
      nativeName: lang.nativeName,
      locale: lang.locale,
      rtl: lang.rtl,
      deeplSupported: false, // Deprecated - use open-source providers
      region: lang.region,
      // fallbackLang can be determined by translation service
    };
    return acc;
  }, {} as Record<string, LanguageMetadata>);

/**
 * Get all supported language codes (7,019 languages)
 */
export function getAllLanguageCodes(): string[] {
  return getAllUniversalLanguageCodes();
}

/**
 * Get language metadata
 */
export function getLanguageMetadata(code: string): LanguageMetadata | undefined {
  return LANGUAGES[code.toLowerCase()];
}

/**
 * Get all RTL languages
 */
export function getRTLLanguages(): string[] {
  return getAllRTLLanguages();
}

/**
 * Get all DeepL directly supported languages
 * @deprecated DeepL is deprecated in favor of open-source providers
 */
export function getDeepLSupportedLanguages(): string[] {
  // Return empty array - DeepL is deprecated
  // Use open-source providers (LibreTranslate, NLLB) instead
  return [];
}

/**
 * Get translation chain for a language
 * Returns array of language codes to translate through
 * Uses open-source providers (LibreTranslate, NLLB) which handle chains automatically
 */
export function getTranslationChain(targetLang: string): string[] {
  const lang = getLanguageMetadata(targetLang);
  if (!lang) return ['en'];
  
  // Open-source providers handle translation chains automatically
  // Default: translate from English to target language
  return ['en', targetLang];
}

