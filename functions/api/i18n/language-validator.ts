/**
 * Language Code Validation
 * Validates and normalizes ISO 639-1, ISO 639-2, and ISO 639-3 language codes
 * 
 * Features:
 * - Validates ISO 639-1 (2-letter), ISO 639-2 (3-letter), and ISO 639-3 codes
 * - Normalizes language codes (handles variants and legacy codes)
 * - Maps legacy codes to current ISO standards
 * - Rejects invalid codes gracefully
 */

import {
  UNIVERSAL_LANGUAGES,
  getUniversalLanguageInfo,
  getISO6391Code,
} from './universal-languages';

/**
 * Language code validation result
 */
export interface ValidationResult {
  /** Whether the code is valid */
  valid: boolean;
  /** Normalized language code */
  normalizedCode?: string;
  /** ISO 639-1 code (if available) */
  iso6391?: string;
  /** ISO 639-3 code */
  iso6393?: string;
  /** Error message if invalid */
  error?: string;
  /** Language metadata if valid */
  languageInfo?: {
    name: string;
    nativeName: string;
    locale: string;
    rtl: boolean;
  };
}

/**
 * Legacy code mappings (deprecated codes to current standards)
 * Maps old/legacy codes to current ISO 639 codes
 */
const LEGACY_CODE_MAPPINGS: Record<string, string> = {
  // ISO 639-2/B to ISO 639-1 mappings (bibliographic codes)
  'alb': 'sq', // Albanian (bibliographic) -> Albanian
  'arm': 'hy', // Armenian (bibliographic) -> Armenian
  'baq': 'eu', // Basque (bibliographic) -> Basque
  'bur': 'my', // Burmese (bibliographic) -> Burmese
  'chi': 'zh', // Chinese (bibliographic) -> Chinese
  'cze': 'cs', // Czech (bibliographic) -> Czech
  'dut': 'nl', // Dutch (bibliographic) -> Dutch
  'fre': 'fr', // French (bibliographic) -> French
  'geo': 'ka', // Georgian (bibliographic) -> Georgian
  'ger': 'de', // German (bibliographic) -> German
  'gre': 'el', // Greek (bibliographic) -> Greek
  'ice': 'is', // Icelandic (bibliographic) -> Icelandic
  'mac': 'mk', // Macedonian (bibliographic) -> Macedonian
  'mao': 'mi', // Maori (bibliographic) -> Maori
  'may': 'ms', // Malay (bibliographic) -> Malay
  'per': 'fa', // Persian (bibliographic) -> Persian
  'rum': 'ro', // Romanian (bibliographic) -> Romanian
  'slo': 'sk', // Slovak (bibliographic) -> Slovak
  'tib': 'bo', // Tibetan (bibliographic) -> Tibetan
  'wel': 'cy', // Welsh (bibliographic) -> Welsh
  
  // Common variants and aliases
  'iw': 'he', // Hebrew (old code)
  'ji': 'yi', // Yiddish (old code)
  'in': 'id', // Indonesian (old code)
  'jw': 'jv', // Javanese (old code)
  'mo': 'ro', // Moldovan -> Romanian
  'nb': 'no', // Norwegian Bokmål -> Norwegian
  'nn': 'no', // Norwegian Nynorsk -> Norwegian
  'sh': 'sr', // Serbo-Croatian -> Serbian
  'zh-cn': 'zh', // Chinese Simplified -> Chinese
  'zh-tw': 'zh', // Chinese Traditional -> Chinese
  'zh-hans': 'zh', // Chinese Simplified -> Chinese
  'zh-hant': 'zh', // Chinese Traditional -> Chinese
};

/**
 * Normalize language code
 * Handles case, variants, and legacy codes
 */
export function normalizeLanguageCode(code: string): string {
  if (!code || typeof code !== 'string') {
    return '';
  }
  
  // Convert to lowercase
  let normalized = code.toLowerCase().trim();
  
  // Remove locale suffixes (e.g., 'en-US' -> 'en', 'fr_FR' -> 'fr')
  normalized = normalized.split(/[-_]/)[0];
  
  // Check legacy mappings
  if (normalized in LEGACY_CODE_MAPPINGS) {
    normalized = LEGACY_CODE_MAPPINGS[normalized];
  }
  
  return normalized;
}

/**
 * Validate ISO 639-1 code (2-letter)
 */
function isValidISO6391(code: string): boolean {
  return /^[a-z]{2}$/.test(code);
}

/**
 * Validate ISO 639-2/639-3 code (3-letter)
 */
function isValidISO6392Or3(code: string): boolean {
  return /^[a-z]{3}$/.test(code);
}

/**
 * Validate language code format
 */
function isValidFormat(code: string): boolean {
  return isValidISO6391(code) || isValidISO6392Or3(code);
}

/**
 * Validate language code against universal language database
 * 
 * @param code - Language code to validate (ISO 639-1, 639-2, or 639-3)
 * @returns Validation result with normalized code and metadata
 */
export function validateLanguageCode(code: string): ValidationResult {
  // Normalize the code first
  const normalized = normalizeLanguageCode(code);
  
  if (!normalized) {
    return {
      valid: false,
      error: 'Language code is required',
    };
  }
  
  // Check format
  if (!isValidFormat(normalized)) {
    return {
      valid: false,
      normalizedCode: normalized,
      error: `Invalid language code format: ${code}. Must be 2 or 3 letters.`,
    };
  }
  
  // Check if code exists in universal language database
  const languageInfo = getUniversalLanguageInfo(normalized);
  
  if (!languageInfo) {
    // Try to find by ISO 639-3 code if normalized is ISO 639-1
    if (isValidISO6391(normalized)) {
      // Search for language with matching ISO 639-1
      const found = Object.values(UNIVERSAL_LANGUAGES).find(
        lang => lang.iso6391 === normalized
      );
      
      if (found) {
        return {
          valid: true,
          normalizedCode: found.code,
          iso6391: found.iso6391,
          iso6393: found.iso6393,
          languageInfo: {
            name: found.name,
            nativeName: found.nativeName,
            locale: found.locale,
            rtl: found.rtl,
          },
        };
      }
    }
    
    return {
      valid: false,
      normalizedCode: normalized,
      error: `Language code not found: ${code}. Code may not be supported.`,
    };
  }
  
  // Valid code found
  return {
    valid: true,
    normalizedCode: languageInfo.code,
    iso6391: languageInfo.iso6391 || (isValidISO6391(languageInfo.code) ? languageInfo.code : undefined),
    iso6393: languageInfo.iso6393 || (isValidISO6392Or3(languageInfo.code) ? languageInfo.code : undefined),
    languageInfo: {
      name: languageInfo.name,
      nativeName: languageInfo.nativeName,
      locale: languageInfo.locale,
      rtl: languageInfo.rtl,
    },
  };
}

/**
 * Validate multiple language codes
 */
export function validateLanguageCodes(codes: string[]): ValidationResult[] {
  return codes.map(code => validateLanguageCode(code));
}

/**
 * Get ISO 639-1 code from any ISO code
 * Attempts to normalize and find the ISO 639-1 equivalent
 */
export function getISO6391FromAny(code: string): string | undefined {
  const validation = validateLanguageCode(code);
  if (validation.valid && validation.iso6391) {
    return validation.iso6391;
  }
  return undefined;
}

/**
 * Get ISO 639-3 code from any ISO code
 */
export function getISO6393FromAny(code: string): string | undefined {
  const validation = validateLanguageCode(code);
  if (validation.valid && validation.iso6393) {
    return validation.iso6393;
  }
  return undefined;
}

/**
 * Check if a language code is supported
 */
export function isLanguageCodeSupported(code: string): boolean {
  return validateLanguageCode(code).valid;
}

/**
 * Get all valid language codes (normalized)
 */
export function getAllValidLanguageCodes(): string[] {
  return Object.keys(UNIVERSAL_LANGUAGES).sort();
}

/**
 * Filter valid language codes from an array
 */
export function filterValidLanguageCodes(codes: string[]): string[] {
  return codes
    .map(code => validateLanguageCode(code))
    .filter(result => result.valid)
    .map(result => result.normalizedCode!)
    .filter((code, index, array) => array.indexOf(code) === index); // Remove duplicates
}

