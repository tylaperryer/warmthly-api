/**
 * TOTP (Time-based One-Time Password) Implementation
 * RFC 6238 compliant TOTP generation and verification
 * World-class MFA for admin authentication
 */

const crypto = require('crypto');
const { getRedisClient } = require('./redis-client');
const logger = require('./logger');

/**
 * TOTP configuration
 */
const TOTP_PERIOD = 30; // 30-second time windows
const TOTP_DIGITS = 6; // 6-digit codes
const TOTP_ALGORITHM = 'sha1';
const TOTP_WINDOW = 1; // Accept codes within ±1 time window (30 seconds)

/**
 * Constant-time string comparison
 * Prevents timing attacks
 */
function constantTimeCompare(a, b) {
  if (a.length !== b.length) {
    return false;
  }
  
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  
  return result === 0;
}

/**
 * Base32 encoding (RFC 4648)
 */
function base32Encode(buffer) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let result = '';
  
  for (let i = 0; i < buffer.length; i += 5) {
    let bits = 0;
    let bitCount = 0;
    
    for (let j = 0; j < 5 && i + j < buffer.length; j++) {
      bits = (bits << 8) | buffer[i + j];
      bitCount += 8;
    }
    
    while (bitCount >= 5) {
      result += alphabet[(bits >>> (bitCount - 5)) & 0x1f];
      bitCount -= 5;
    }
    
    if (bitCount > 0) {
      result += alphabet[(bits << (5 - bitCount)) & 0x1f];
    }
  }
  
  return result;
}

/**
 * Base32 decoding (RFC 4648)
 */
function base32Decode(encoded) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const map = {};
  
  for (let i = 0; i < alphabet.length; i++) {
    map[alphabet[i]] = i;
  }
  
  encoded = encoded.toUpperCase().replace(/=+$/, '');
  const buffer = [];
  let bits = 0;
  let bitCount = 0;
  
  for (const char of encoded) {
    if (!(char in map)) {
      throw new Error(`Invalid base32 character: ${char}`);
    }
    
    bits = (bits << 5) | map[char];
    bitCount += 5;
    
    if (bitCount >= 8) {
      buffer.push((bits >>> (bitCount - 8)) & 0xff);
      bitCount -= 8;
    }
  }
  
  return Buffer.from(buffer);
}

/**
 * Generate TOTP code from secret
 * 
 * @param {string} secret - Base32-encoded secret
 * @param {number} time - Unix timestamp (default: current time)
 * @returns {string} 6-digit TOTP code
 */
function generateTOTP(secret, time) {
  const timestamp = Math.floor((time ?? Date.now()) / 1000 / TOTP_PERIOD);
  
  // Decode base32 secret
  const secretBytes = base32Decode(secret);
  
  // Create HMAC-SHA1 hash
  const hmac = crypto.createHmac(TOTP_ALGORITHM, secretBytes);
  const timestampBuffer = Buffer.allocUnsafe(8);
  timestampBuffer.writeBigUInt64BE(BigInt(timestamp), 0);
  hmac.update(timestampBuffer);
  const hash = hmac.digest();
  
  // Dynamic truncation (RFC 4226)
  const offset = hash[hash.length - 1] & 0x0f;
  const binary = ((hash[offset] & 0x7f) << 24) |
                 ((hash[offset + 1] & 0xff) << 16) |
                 ((hash[offset + 2] & 0xff) << 8) |
                 (hash[offset + 3] & 0xff);
  
  const otp = binary % Math.pow(10, TOTP_DIGITS);
  
  // Pad with leading zeros
  return otp.toString().padStart(TOTP_DIGITS, '0');
}

/**
 * Verify TOTP code
 * Accepts codes within the specified time window
 * 
 * @param {string} secret - Base32-encoded secret
 * @param {string} code - TOTP code to verify
 * @param {number} time - Unix timestamp (default: current time)
 * @returns {boolean} True if code is valid
 */
function verifyTOTP(secret, code, time) {
  const currentTime = time ?? Date.now();
  
  // Check current time window and adjacent windows
  for (let i = -TOTP_WINDOW; i <= TOTP_WINDOW; i++) {
    const windowTime = currentTime + (i * TOTP_PERIOD * 1000);
    const expectedCode = generateTOTP(secret, windowTime);
    
    // Constant-time comparison
    if (constantTimeCompare(code, expectedCode)) {
      return true;
    }
  }
  
  return false;
}

/**
 * Retrieve and decrypt TOTP secret for admin user
 * 
 * @returns {Promise<string|null>} Decrypted TOTP secret or null if not configured
 */
async function getTOTPSecret() {
  try {
    const client = await getRedisClient();
    if (!client) {
      return null;
    }
    
    const encryptedDataStr = await client.get('admin:totp:secret');
    
    if (!encryptedDataStr) {
      return null;
    }
    
    const encryptedData = JSON.parse(encryptedDataStr);
    const encryptionKey = process.env.JWT_SECRET;
    
    if (!encryptionKey) {
      throw new Error('JWT_SECRET not configured');
    }
    
    // Decrypt
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      crypto.createHash('sha256').update(encryptionKey).digest().slice(0, 32),
      Buffer.from(encryptedData.iv, 'hex')
    );
    
    decipher.setAuthTag(Buffer.from(encryptedData.authTag, 'hex'));
    
    let decrypted = decipher.update(encryptedData.encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (error) {
    logger.error('[totp] Failed to retrieve TOTP secret:', error);
    return null;
  }
}

/**
 * Check if MFA is enabled for admin
 * 
 * @returns {Promise<boolean>} True if TOTP secret is configured
 */
async function isMFAEnabled() {
  const secret = await getTOTPSecret();
  return secret !== null;
}

module.exports = {
  generateTOTP,
  verifyTOTP,
  getTOTPSecret,
  isMFAEnabled,
};

