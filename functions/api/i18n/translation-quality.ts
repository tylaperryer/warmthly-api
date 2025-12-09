/**
 * Translation Quality Scoring System
 * Evaluates translation quality using multiple metrics
 * 
 * Metrics:
 * - Length ratio (should be reasonable)
 * - Character encoding validation
 * - Script consistency (detect wrong script)
 * - Language detection (verify output is target language)
 * - Confidence scoring
 */

import { getUniversalLanguageInfo } from './universal-languages';

/**
 * Quality score result
 */
export interface QualityScore {
  /** Overall quality score (0-1, where 1 is perfect) */
  score: number;
  /** Breakdown of individual metric scores */
  metrics: {
    lengthRatio: number;
    encoding: number;
    scriptConsistency: number;
    languageMatch: number;
    confidence: number;
  };
  /** Whether the translation passes quality threshold */
  passes: boolean;
  /** Issues found in the translation */
  issues: string[];
}

/**
 * Translation quality evaluation parameters
 */
export interface QualityEvaluationParams {
  /** Source text */
  sourceText: string;
  /** Translated text */
  translatedText: string;
  /** Source language code */
  sourceLang: string;
  /** Target language code */
  targetLang: string;
  /** Quality threshold (0-1, default 0.5) */
  threshold?: number;
}

/**
 * Calculate length ratio score
 * Translations should have reasonable length compared to source
 * Typical ratio: 0.5 - 2.0 (varies by language pair)
 */
function calculateLengthRatioScore(
  sourceText: string,
  translatedText: string,
  sourceLang: string,
  targetLang: string
): number {
  const sourceLength = sourceText.length;
  const translatedLength = translatedText.length;
  
  if (sourceLength === 0) {
    return translatedLength === 0 ? 1.0 : 0.0;
  }
  
  const ratio = translatedLength / sourceLength;
  
  // Expected ratios vary by language pair
  // For example: English -> Chinese: ~0.5-0.8, English -> German: ~1.0-1.3
  // Use a reasonable range: 0.3 - 3.0
  const minRatio = 0.3;
  const maxRatio = 3.0;
  
  if (ratio < minRatio || ratio > maxRatio) {
    // Score decreases as ratio moves away from reasonable range
    if (ratio < minRatio) {
      return Math.max(0, ratio / minRatio);
    } else {
      return Math.max(0, 1 - (ratio - maxRatio) / maxRatio);
    }
  }
  
  // Ideal ratio is around 1.0, but varies by language
  // Score highest when ratio is in reasonable range
  return 1.0;
}

/**
 * Validate character encoding
 * Check if translation contains valid UTF-8 characters
 */
function calculateEncodingScore(translatedText: string): number {
  if (!translatedText || translatedText.length === 0) {
    return 0.0;
  }
  
  try {
    // Check if text can be properly encoded/decoded
    const encoded = new TextEncoder().encode(translatedText);
    const decoded = new TextDecoder('utf-8', { fatal: true }).decode(encoded);
    
    // Check for common encoding issues
    // Look for replacement characters () which indicate encoding problems
    if (decoded.includes('\uFFFD')) {
      return 0.5;
    }
    
    return 1.0;
  } catch (error) {
    // Encoding error
    return 0.0;
  }
}

/**
 * Check script consistency
 * Verify that translation uses expected script for target language
 */
function calculateScriptConsistencyScore(
  translatedText: string,
  targetLang: string
): number {
  const langInfo = getUniversalLanguageInfo(targetLang);
  if (!langInfo || !langInfo.script) {
    // Can't verify without script info
    return 0.8; // Neutral score
  }
  
  const expectedScript = langInfo.script;
  
  // Script detection ranges (Unicode blocks)
  const scriptRanges: Record<string, [number, number][]> = {
    'Latn': [[0x0000, 0x007F], [0x0080, 0x00FF], [0x0100, 0x017F], [0x0180, 0x024F], [0x1E00, 0x1EFF]],
    'Cyrl': [[0x0400, 0x04FF], [0x0500, 0x052F]],
    'Arab': [[0x0600, 0x06FF], [0x0750, 0x077F], [0x08A0, 0x08FF], [0xFB50, 0xFDFF], [0xFE70, 0xFEFF]],
    'Deva': [[0x0900, 0x097F]],
    'Beng': [[0x0980, 0x09FF]],
    'Guru': [[0x0A00, 0x0A7F]],
    'Gujr': [[0x0A80, 0x0AFF]],
    'Orya': [[0x0B00, 0x0B7F]],
    'Taml': [[0x0B80, 0x0BFF]],
    'Telu': [[0x0C00, 0x0C7F]],
    'Knda': [[0x0C80, 0x0CFF]],
    'Mlym': [[0x0D00, 0x0D7F]],
    'Sinh': [[0x0D80, 0x0DFF]],
    'Thai': [[0x0E00, 0x0E7F]],
    'Laoo': [[0x0E80, 0x0EFF]],
    'Mymr': [[0x1000, 0x109F]],
    'Khmr': [[0x1780, 0x17FF]],
    'Hans': [[0x4E00, 0x9FFF], [0x3400, 0x4DBF]],
    'Hant': [[0x4E00, 0x9FFF], [0x3400, 0x4DBF]],
    'Jpan': [[0x3040, 0x309F], [0x30A0, 0x30FF], [0x4E00, 0x9FFF]],
    'Hang': [[0xAC00, 0xD7AF], [0x1100, 0x11FF]],
    'Grek': [[0x0370, 0x03FF]],
    'Hebr': [[0x0590, 0x05FF]],
    'Armn': [[0x0530, 0x058F]],
    'Geor': [[0x10A0, 0x10FF]],
    'Ethi': [[0x1200, 0x137F]],
    'Tibt': [[0x0F00, 0x0FFF]],
    'Syrc': [[0x0700, 0x074F]],
    'Bugi': [[0x1A00, 0x1A1F]],
    'Olck': [[0x1C50, 0x1C7F]],
    'Mtei': [[0xAAE0, 0xAAFF]],
  };
  
  const ranges = scriptRanges[expectedScript];
  if (!ranges) {
    // Unknown script, can't verify
    return 0.8;
  }
  
  // Count characters in expected script ranges
  let scriptCharCount = 0;
  let totalCharCount = 0;
  
  for (const char of translatedText) {
    const codePoint = char.codePointAt(0);
    if (codePoint === undefined) continue;
    
    totalCharCount++;
    
    // Check if character is in expected script ranges
    for (const [start, end] of ranges) {
      if (codePoint >= start && codePoint <= end) {
        scriptCharCount++;
        break;
      }
    }
  }
  
  if (totalCharCount === 0) {
    return 0.0;
  }
  
  // Score based on percentage of characters in expected script
  const scriptRatio = scriptCharCount / totalCharCount;
  
  // Allow some non-script characters (punctuation, numbers, etc.)
  // Score highest when >80% of characters are in expected script
  if (scriptRatio >= 0.8) {
    return 1.0;
  } else if (scriptRatio >= 0.5) {
    return 0.7;
  } else if (scriptRatio >= 0.3) {
    return 0.4;
  } else {
    return 0.1;
  }
}

/**
 * Language detection score
 * Verify that translation appears to be in target language
 * This is a simplified heuristic - full language detection would require a library
 */
function calculateLanguageMatchScore(
  translatedText: string,
  targetLang: string
): number {
  // This is a simplified check
  // Full language detection would require a proper library like franc.js or similar
  // For now, we use script consistency as a proxy
  
  // If script consistency is high, assume language match is good
  const scriptScore = calculateScriptConsistencyScore(translatedText, targetLang);
  
  // Additional checks for common language patterns
  const langInfo = getUniversalLanguageInfo(targetLang);
  if (!langInfo) {
    return 0.8; // Neutral if we can't verify
  }
  
  // For RTL languages, check direction
  if (langInfo.rtl) {
    // RTL languages should have RTL characters
    const rtlChars = /[\u0590-\u05FF\u0600-\u06FF\u0700-\u074F\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/.test(translatedText);
    if (!rtlChars && translatedText.length > 10) {
      return 0.3; // Low score if RTL language but no RTL characters
    }
  }
  
  // Base score on script consistency
  return scriptScore * 0.9; // Slightly lower than script score alone
}

/**
 * Calculate confidence score
 * Based on text characteristics and completeness
 */
function calculateConfidenceScore(
  sourceText: string,
  translatedText: string
): number {
  let score = 1.0;
  
  // Check if translation is empty
  if (!translatedText || translatedText.trim().length === 0) {
    return 0.0;
  }
  
  // Check if translation is identical to source (might indicate failure)
  if (translatedText === sourceText && sourceText.length > 5) {
    score *= 0.3; // Low confidence if identical
  }
  
  // Check for placeholder text or error messages
  const errorPatterns = [
    /^error/i,
    /^failed/i,
    /^translation failed/i,
    /^unable to translate/i,
    /^not supported/i,
  ];
  
  for (const pattern of errorPatterns) {
    if (pattern.test(translatedText)) {
      score *= 0.2;
      break;
    }
  }
  
  // Check for excessive repetition (might indicate issues)
  if (translatedText.length > 20) {
    const words = translatedText.split(/\s+/);
    const uniqueWords = new Set(words);
    const repetitionRatio = uniqueWords.size / words.length;
    
    if (repetitionRatio < 0.3) {
      score *= 0.5; // Low confidence if too much repetition
    }
  }
  
  return Math.max(0, Math.min(1, score));
}

/**
 * Evaluate translation quality
 * Returns a quality score with detailed metrics
 */
export function evaluateTranslationQuality(
  params: QualityEvaluationParams
): QualityScore {
  const {
    sourceText,
    translatedText,
    sourceLang,
    targetLang,
    threshold = 0.5,
  } = params;
  
  const issues: string[] = [];
  
  // Calculate individual metric scores
  const lengthRatio = calculateLengthRatioScore(
    sourceText,
    translatedText,
    sourceLang,
    targetLang
  );
  
  const encoding = calculateEncodingScore(translatedText);
  
  const scriptConsistency = calculateScriptConsistencyScore(
    translatedText,
    targetLang
  );
  
  const languageMatch = calculateLanguageMatchScore(
    translatedText,
    targetLang
  );
  
  const confidence = calculateConfidenceScore(sourceText, translatedText);
  
  // Weighted overall score
  // Weights can be adjusted based on importance
  const weights = {
    lengthRatio: 0.15,
    encoding: 0.20,
    scriptConsistency: 0.25,
    languageMatch: 0.25,
    confidence: 0.15,
  };
  
  const overallScore =
    lengthRatio * weights.lengthRatio +
    encoding * weights.encoding +
    scriptConsistency * weights.scriptConsistency +
    languageMatch * weights.languageMatch +
    confidence * weights.confidence;
  
  // Collect issues
  if (lengthRatio < 0.5) {
    issues.push('Length ratio is unusual');
  }
  if (encoding < 0.8) {
    issues.push('Character encoding issues detected');
  }
  if (scriptConsistency < 0.6) {
    issues.push('Script consistency is low');
  }
  if (languageMatch < 0.6) {
    issues.push('Language match is uncertain');
  }
  if (confidence < 0.6) {
    issues.push('Confidence is low');
  }
  
  return {
    score: overallScore,
    metrics: {
      lengthRatio,
      encoding,
      scriptConsistency,
      languageMatch,
      confidence,
    },
    passes: overallScore >= threshold,
    issues,
  };
}

/**
 * Compare multiple translations and return the best one
 */
export function selectBestTranslation(
  translations: Array<{
    text: string;
    provider: string;
  }>,
  params: Omit<QualityEvaluationParams, 'translatedText'>
): {
  text: string;
  provider: string;
  score: number;
} | null {
  if (translations.length === 0) {
    return null;
  }
  
  let bestTranslation: {
    text: string;
    provider: string;
    score: number;
  } | null = null;
  let bestScore = -1;
  
  for (const translation of translations) {
    const quality = evaluateTranslationQuality({
      ...params,
      translatedText: translation.text,
    });
    
    if (quality.score > bestScore) {
      bestScore = quality.score;
      bestTranslation = {
        text: translation.text,
        provider: translation.provider,
        score: quality.score,
      };
    }
  }
  
  return bestTranslation;
}

/**
 * Check if translation quality is acceptable
 */
export function isQualityAcceptable(
  params: QualityEvaluationParams
): boolean {
  const quality = evaluateTranslationQuality(params);
  return quality.passes;
}

