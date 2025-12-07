/**
 * Fetch ISO 639-3 Language Codes from Official Sources
 * 
 * This script fetches all ISO 639-3 language codes from SIL International
 * (the official registration authority) and generates language entries
 * for the universal-languages.ts file.
 * 
 * Sources:
 * - ISO 639-3 Code Table: https://iso639-3.sil.org/code_tables/639/data
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

// RTL language codes (comprehensive list)
const RTL_LANGUAGES = new Set([
  'ar', 'he', 'fa', 'ur', 'yi', 'sd', 'ug', 'ku', 'ps', 'prs', 'azb', 'mzn',
  'ckb', 'lrc', 'glk', 'bqi', 'syc', 'arc', 'aii', 'crh', 'bal', 'hac', 'kmr',
  'lki', 'mzn', 'pnb', 'prs', 'snd', 'uz_AF', 'ks', 'ks_Deva', 'ks_Arab'
]);

// Script mappings for common languages
const SCRIPT_MAPPINGS = {
  'ar': 'Arab', 'he': 'Hebr', 'fa': 'Arab', 'ur': 'Arab', 'yi': 'Hebr',
  'sd': 'Arab', 'ug': 'Arab', 'ku': 'Arab', 'ps': 'Arab', 'prs': 'Arab',
  'azb': 'Arab', 'mzn': 'Arab', 'ckb': 'Arab', 'lrc': 'Arab', 'glk': 'Arab',
  'bqi': 'Arab', 'syc': 'Syrc', 'arc': 'Syrc', 'aii': 'Syrc', 'crh': 'Latn',
  'ru': 'Cyrl', 'uk': 'Cyrl', 'be': 'Cyrl', 'bg': 'Cyrl', 'mk': 'Cyrl',
  'sr': 'Cyrl', 'kk': 'Cyrl', 'ky': 'Cyrl', 'tt': 'Cyrl', 'mn': 'Cyrl',
  'el': 'Grek', 'hy': 'Armn', 'ka': 'Geor', 'bo': 'Tibt', 'dz': 'Tibt',
  'hi': 'Deva', 'mr': 'Deva', 'ne': 'Deva', 'mai': 'Deva', 'bho': 'Deva',
  'mag': 'Deva', 'hne': 'Deva', 'new': 'Deva', 'kok': 'Deva', 'doi': 'Deva',
  'bn': 'Beng', 'as': 'Beng', 'pa': 'Guru', 'gu': 'Gujr', 'or': 'Orya',
  'ta': 'Taml', 'te': 'Telu', 'kn': 'Knda', 'ml': 'Mlym', 'si': 'Sinh',
  'th': 'Thai', 'lo': 'Laoo', 'my': 'Mymr', 'km': 'Khmr', 'zh': 'Hans',
  'ja': 'Jpan', 'ko': 'Hang', 'am': 'Ethi', 'ti': 'Ethi', 'sat': 'Olck',
  'mni': 'Mtei', 'bug': 'Bugi'
};

// Language family mappings
const FAMILY_MAPPINGS = {
  'en': 'Germanic', 'de': 'Germanic', 'nl': 'Germanic', 'af': 'Germanic',
  'sv': 'Germanic', 'da': 'Germanic', 'no': 'Germanic', 'is': 'Germanic',
  'fo': 'Germanic', 'yi': 'Germanic', 'lb': 'Germanic', 'li': 'Germanic',
  'fy': 'Germanic',
  'es': 'Romance', 'fr': 'Romance', 'it': 'Romance', 'pt': 'Romance',
  'ro': 'Romance', 'ca': 'Romance', 'gl': 'Romance', 'oc': 'Romance', 'co': 'Romance',
  'ru': 'Slavic', 'uk': 'Slavic', 'be': 'Slavic', 'bg': 'Slavic', 'mk': 'Slavic',
  'sr': 'Slavic', 'hr': 'Slavic', 'bs': 'Slavic', 'sl': 'Slavic', 'cs': 'Slavic',
  'sk': 'Slavic', 'pl': 'Slavic', 'hsb': 'Slavic', 'dsb': 'Slavic',
  'el': 'Hellenic', 'hu': 'Uralic', 'fi': 'Uralic', 'et': 'Uralic',
  'lv': 'Baltic', 'lt': 'Baltic', 'ga': 'Celtic', 'cy': 'Celtic', 'gd': 'Celtic',
  'br': 'Celtic', 'gv': 'Celtic', 'kw': 'Celtic', 'sq': 'Albanian', 'mt': 'Semitic',
  'hi': 'Indo-Aryan', 'bn': 'Indo-Aryan', 'pa': 'Indo-Aryan', 'gu': 'Indo-Aryan',
  'mr': 'Indo-Aryan', 'ne': 'Indo-Aryan', 'ur': 'Indo-Aryan', 'sd': 'Indo-Aryan',
  'or': 'Indo-Aryan', 'as': 'Indo-Aryan', 'si': 'Indo-Aryan', 'mai': 'Indo-Aryan',
  'bho': 'Indo-Aryan', 'mag': 'Indo-Aryan', 'hne': 'Indo-Aryan', 'new': 'Indo-Aryan',
  'kok': 'Indo-Aryan', 'doi': 'Indo-Aryan', 'ks': 'Indo-Aryan',
  'ta': 'Dravidian', 'te': 'Dravidian', 'kn': 'Dravidian', 'ml': 'Dravidian',
  'zh': 'Sino-Tibetan', 'my': 'Sino-Tibetan', 'bo': 'Sino-Tibetan', 'dz': 'Sino-Tibetan',
  'new': 'Sino-Tibetan', 'mni': 'Sino-Tibetan',
  'vi': 'Austroasiatic', 'km': 'Austroasiatic', 'sat': 'Austroasiatic',
  'th': 'Tai-Kadai', 'lo': 'Tai-Kadai',
  'id': 'Austronesian', 'ms': 'Austronesian', 'tl': 'Austronesian', 'jv': 'Austronesian',
  'su': 'Austronesian', 'ceb': 'Austronesian', 'haw': 'Austronesian', 'mg': 'Austronesian',
  'mi': 'Austronesian', 'sm': 'Austronesian', 'to': 'Austronesian', 'ty': 'Austronesian',
  'fj': 'Austronesian', 'ban': 'Austronesian', 'bug': 'Austronesian', 'min': 'Austronesian',
  'ace': 'Austronesian', 'bjn': 'Austronesian', 'mad': 'Austronesian', 'bbc': 'Austronesian',
  'btx': 'Austronesian', 'bts': 'Austronesian', 'pam': 'Austronesian', 'pag': 'Austronesian',
  'war': 'Austronesian', 'ilo': 'Austronesian', 'bcl': 'Austronesian',
  'ja': 'Japonic', 'ko': 'Koreanic',
  'tr': 'Turkic', 'az': 'Turkic', 'kk': 'Turkic', 'ky': 'Turkic', 'uz': 'Turkic',
  'ug': 'Turkic', 'tt': 'Turkic', 'crh': 'Turkic', 'azb': 'Turkic',
  'mn': 'Mongolic',
  'ar': 'Semitic', 'he': 'Semitic', 'am': 'Semitic', 'ti': 'Semitic', 'syc': 'Semitic',
  'arc': 'Semitic', 'aii': 'Semitic',
  'fa': 'Iranian', 'ps': 'Iranian', 'ku': 'Iranian', 'bal': 'Iranian', 'prs': 'Iranian',
  'mzn': 'Iranian', 'glk': 'Iranian', 'bqi': 'Iranian', 'lrc': 'Iranian', 'ckb': 'Iranian',
  'sw': 'Niger-Congo', 'zu': 'Niger-Congo', 'xh': 'Niger-Congo', 'yo': 'Niger-Congo',
  'ig': 'Niger-Congo', 'rw': 'Niger-Congo', 'rn': 'Niger-Congo', 'ny': 'Niger-Congo',
  'sn': 'Niger-Congo', 'st': 'Niger-Congo', 'tn': 'Niger-Congo', 've': 'Niger-Congo',
  'ts': 'Niger-Congo', 'ss': 'Niger-Congo', 'nso': 'Niger-Congo', 'lg': 'Niger-Congo',
  'ak': 'Niger-Congo', 'wo': 'Niger-Congo', 'ff': 'Niger-Congo', 'bm': 'Niger-Congo',
  'dyu': 'Niger-Congo', 'fon': 'Niger-Congo', 'ewe': 'Niger-Congo', 'tw': 'Niger-Congo',
  'kik': 'Niger-Congo', 'kam': 'Niger-Congo', 'luy': 'Niger-Congo', 'mer': 'Niger-Congo',
  'ha': 'Afro-Asiatic', 'so': 'Cushitic', 'om': 'Cushitic', 'kln': 'Nilo-Saharan',
  'luo': 'Nilo-Saharan', 'ka': 'Kartvelian', 'hy': 'Indo-European', 'eu': 'Isolate',
  'hmn': 'Hmong-Mien', 'cr': 'Algonquian', 'iu': 'Eskimo-Aleut', 'oj': 'Algonquian',
  'bi': 'Creole', 'se': 'Uralic', 'smj': 'Uralic', 'sma': 'Uralic'
};

/**
 * Download ISO 639-3 code table from SIL International
 */
function downloadISO6393Table() {
  return new Promise((resolve, reject) => {
    // ISO 639-3 code table URL (TSV format)
    const url = 'https://iso639-3.sil.org/sites/iso639-3/files/downloads/iso-639-3.tab';
    
    console.log('Downloading ISO 639-3 code table from SIL International...');
    
    https.get(url, (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download: ${response.statusCode}`));
        return;
      }
      
      let data = '';
      response.on('data', (chunk) => {
        data += chunk;
      });
      
      response.on('end', () => {
        console.log(`Downloaded ${data.length} bytes`);
        resolve(data);
      });
    }).on('error', (error) => {
      reject(error);
    });
  });
}

/**
 * Parse TSV data into ISO 639-3 entries
 */
function parseISO6393Table(tsvData) {
  const lines = tsvData.split('\n').filter(line => line.trim());
  const headers = lines[0].split('\t');
  
  const entries = [];
  
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split('\t');
    if (values.length < headers.length) continue;
    
    const entry = {
      Id: values[0] || '',
      Part2B: values[1] || undefined,
      Part2T: values[2] || undefined,
      Part1: values[3] || undefined,
      Scope: values[4] || '',
      Type: values[5] || '',
      Ref_Name: values[6] || '',
      Comment: values[7] || undefined,
    };
    
    // Only include living languages (Type = 'L') and individual languages (Scope = 'I')
    if (entry.Type === 'L' && entry.Scope === 'I') {
      entries.push(entry);
    }
  }
  
  return entries;
}

/**
 * Generate native name (fallback to English name if not available)
 */
function getNativeName(code, englishName, iso6391) {
  // For now, return English name as fallback
  // In production, integrate with Unicode CLDR for native names
  return englishName;
}

/**
 * Generate locale code from language code
 */
function generateLocale(code, iso6391) {
  const langCode = iso6391 || code;
  return `${langCode}_${langCode.toUpperCase()}`;
}

/**
 * Determine script from language code
 */
function getScript(code, iso6391) {
  const key = iso6391 || code;
  return SCRIPT_MAPPINGS[key] || 'Latn'; // Default to Latin script
}

/**
 * Determine language family
 */
function getFamily(code, iso6391) {
  const key = iso6391 || code;
  return FAMILY_MAPPINGS[key];
}

/**
 * Check if language is RTL
 */
function isRTL(code, iso6391) {
  const key = iso6391 || code;
  return RTL_LANGUAGES.has(key) || RTL_LANGUAGES.has(code);
}

/**
 * Convert ISO 639-3 entries to LanguageEntry format
 */
function convertToLanguageEntries(iso6393Entries) {
  const entries = [];
  const seen = new Set();
  
  for (const entry of iso6393Entries) {
    // Use ISO 639-1 code if available, otherwise use ISO 639-3 code
    const code = entry.Part1 || entry.Id;
    
    // Skip duplicates (prefer ISO 639-1 over ISO 639-3)
    if (seen.has(code)) continue;
    seen.add(code);
    
    const languageEntry = {
      code: code,
      name: entry.Ref_Name,
      nativeName: getNativeName(code, entry.Ref_Name, entry.Part1),
      locale: generateLocale(code, entry.Part1),
      rtl: isRTL(code, entry.Part1),
      iso6391: entry.Part1,
      iso6392b: entry.Part2B,
      iso6392t: entry.Part2T,
      iso6393: entry.Id,
      script: getScript(code, entry.Part1),
      family: getFamily(code, entry.Part1),
    };
    
    entries.push(languageEntry);
  }
  
  return entries;
}

/**
 * Generate TypeScript code for language entries
 */
function generateTypeScriptCode(entries) {
  const lines = [];
  
  // Group by family for better organization
  const byFamily = new Map();
  const noFamily = [];
  
  for (const entry of entries) {
    if (entry.family) {
      if (!byFamily.has(entry.family)) {
        byFamily.set(entry.family, []);
      }
      byFamily.get(entry.family).push(entry);
    } else {
      noFamily.push(entry);
    }
  }
  
  // Sort families
  const sortedFamilies = Array.from(byFamily.keys()).sort();
  
  for (const family of sortedFamilies) {
    lines.push(`  // ${family}`);
    const familyEntries = byFamily.get(family);
    for (const entry of familyEntries.sort((a, b) => a.code.localeCompare(b.code))) {
      lines.push(generateEntryLine(entry));
    }
    lines.push('');
  }
  
  if (noFamily.length > 0) {
    lines.push('  // Other Languages');
    for (const entry of noFamily.sort((a, b) => a.code.localeCompare(b.code))) {
      lines.push(generateEntryLine(entry));
    }
  }
  
  return lines.join('\n');
}

/**
 * Generate a single language entry line
 */
function generateEntryLine(entry) {
  const parts = [];
  parts.push(`code: '${entry.code}'`);
  parts.push(`name: '${entry.name.replace(/'/g, "\\'")}'`);
  parts.push(`nativeName: '${entry.nativeName.replace(/'/g, "\\'")}'`);
  parts.push(`locale: '${entry.locale}'`);
  parts.push(`rtl: ${entry.rtl}`);
  
  if (entry.iso6391) parts.push(`iso6391: '${entry.iso6391}'`);
  if (entry.iso6392b) parts.push(`iso6392b: '${entry.iso6392b}'`);
  if (entry.iso6392t) parts.push(`iso6392t: '${entry.iso6392t}'`);
  if (entry.iso6393) parts.push(`iso6393: '${entry.iso6393}'`);
  if (entry.script) parts.push(`script: '${entry.script}'`);
  if (entry.family) parts.push(`family: '${entry.family}'`);
  if (entry.region) parts.push(`region: '${entry.region}'`);
  
  return `  ${entry.code}: { ${parts.join(', ')} },`;
}

/**
 * Main function
 */
async function main() {
  try {
    console.log('Starting ISO 639-3 language code fetch...\n');
    
    // Download ISO 639-3 table
    const tsvData = await downloadISO6393Table();
    
    // Parse entries
    console.log('Parsing ISO 639-3 entries...');
    const iso6393Entries = parseISO6393Table(tsvData);
    console.log(`Found ${iso6393Entries.length} living individual languages`);
    
    // Convert to language entries
    console.log('Converting to language entries...');
    const languageEntries = convertToLanguageEntries(iso6393Entries);
    console.log(`Generated ${languageEntries.length} unique language entries`);
    
    // Generate TypeScript code
    console.log('Generating TypeScript code...');
    const tsCode = generateTypeScriptCode(languageEntries);
    
    // Read existing universal-languages.ts
    const universalLanguagesPath = path.join(__dirname, '../functions/api/i18n/universal-languages.ts');
    const existingContent = fs.readFileSync(universalLanguagesPath, 'utf-8');
    
    // Find the UNIVERSAL_LANGUAGES object and replace its content
    const startMarker = 'export const UNIVERSAL_LANGUAGES: Record<string, UniversalLanguageInfo> = {';
    const endMarker = '};';
    
    const startIndex = existingContent.indexOf(startMarker);
    const endIndex = existingContent.indexOf(endMarker, startIndex + startMarker.length);
    
    if (startIndex === -1 || endIndex === -1) {
      throw new Error('Could not find UNIVERSAL_LANGUAGES object in file');
    }
    
    // Preserve header comments and replace content
    const before = existingContent.substring(0, startIndex + startMarker.length);
    const after = existingContent.substring(endIndex);
    
    const newContent = before + '\n' + tsCode + '\n' + after;
    
    // Write updated file
    console.log('Writing updated universal-languages.ts...');
    fs.writeFileSync(universalLanguagesPath, newContent, 'utf-8');
    
    console.log(`\n✅ Successfully updated universal-languages.ts with ${languageEntries.length} languages!`);
    console.log(`\nSummary:`);
    console.log(`  - Total languages: ${languageEntries.length}`);
    console.log(`  - RTL languages: ${languageEntries.filter(e => e.rtl).length}`);
    console.log(`  - Languages with ISO 639-1 codes: ${languageEntries.filter(e => e.iso6391).length}`);
    
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main().catch(console.error);
}

module.exports = { main };

