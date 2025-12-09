/**
 * Language Code Validation
 * Validates ISO 639-1 (2-letter) and ISO 639-2/3 (3-letter) language codes
 */

/**
 * Valid language codes (ISO 639-1 and common ISO 639-2/3)
 * This is a subset - full validation would use the universal language database
 */
const VALID_LANGUAGE_CODES = [
  // ISO 639-1 (2-letter)
  'en', 'es', 'fr', 'de', 'it', 'pt', 'ru', 'ja', 'zh', 'ko', 'ar', 'hi', 'af', 'zu',
  'nl', 'pl', 'tr', 'sv', 'da', 'fi', 'no', 'cs', 'hu', 'ro', 'bg', 'hr', 'sk', 'sl',
  'el', 'he', 'th', 'vi', 'id', 'ms', 'tl', 'sw', 'am', 'bn', 'gu', 'kn', 'ml', 'mr',
  'ne', 'pa', 'si', 'ta', 'te', 'ur', 'fa', 'ps', 'az', 'ka', 'hy', 'kk', 'ky', 'mn',
  'uz', 'my', 'km', 'lo', 'ka', 'mk', 'sq', 'sr', 'bs', 'is', 'ga', 'cy', 'mt', 'eu',
  'ca', 'gl', 'lb', 'br', 'gd', 'yi', 'co', 'eo', 'ia', 'ie', 'io', 'jv', 'ku', 'la',
  'li', 'mi', 'oc', 'sc', 'su', 'wa', 'yi', 'zu',
  // ISO 639-2/3 (3-letter) - common ones
  'eng', 'spa', 'fra', 'deu', 'ita', 'por', 'rus', 'jpn', 'zho', 'kor', 'ara', 'hin',
  'afr', 'zul', 'nld', 'pol', 'tur', 'swe', 'dan', 'fin', 'nor', 'ces', 'hun', 'ron',
];

/**
 * Normalize language code
 * Handles case, variants, and locale suffixes
 * 
 * @param {string} code - Language code to normalize
 * @returns {string} Normalized language code
 */
function normalizeLanguageCode(code) {
  if (!code || typeof code !== 'string') {
    return '';
  }
  
  // Convert to lowercase
  let normalized = code.toLowerCase().trim();
  
  // Remove locale suffixes (e.g., 'en-US' -> 'en', 'fr_FR' -> 'fr')
  normalized = normalized.split(/[-_]/)[0];
  
  return normalized;
}

/**
 * Validate language code format
 * 
 * @param {string} code - Language code to validate
 * @returns {boolean} True if format is valid (2-3 letters)
 */
function isValidFormat(code) {
  if (!code || typeof code !== 'string') {
    return false;
  }
  
  // Must be 2 or 3 letters
  return /^[a-z]{2,3}$/.test(code);
}

/**
 * Validate language code
 * 
 * @param {string} code - Language code to validate
 * @returns {{ valid: boolean, normalizedCode?: string, error?: string }}
 */
function validateLanguageCode(code) {
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
  
  // Check if code is in valid list (basic validation)
  // In production, this could check against the full universal language database
  if (!VALID_LANGUAGE_CODES.includes(normalized)) {
    // Still allow it but log a warning (some codes may be valid but not in our list)
    // This allows flexibility while still validating format
    return {
      valid: true, // Allow unknown codes (they may be valid ISO codes we don't have in list)
      normalizedCode: normalized,
    };
  }
  
  return {
    valid: true,
    normalizedCode: normalized,
  };
}

module.exports = {
  validateLanguageCode,
  normalizeLanguageCode,
  isValidFormat,
};

