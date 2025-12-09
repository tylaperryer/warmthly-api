/**
 * Cryptographic Utilities
 * Shared cryptographic functions for security operations
 */

const crypto = require('crypto');

/**
 * Constant-time string comparison
 * Prevents timing attacks by comparing strings in constant time
 * 
 * @param {string|null|undefined} a - First string
 * @param {string|null|undefined} b - Second string
 * @returns {boolean} True if strings are equal, false otherwise
 */
function constantTimeCompare(a, b) {
  if (!a || !b) {
    return false;
  }

  if (a.length !== b.length) {
    return false;
  }

  try {
    return crypto.timingSafeEqual(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'));
  } catch (error) {
    // If timingSafeEqual fails, return false
    return false;
  }
}

/**
 * Generate a cryptographically secure random string
 * 
 * @param {number} length - Length in bytes (default: 32)
 * @returns {string} Hex-encoded random string
 */
function generateRandomString(length = 32) {
  return crypto.randomBytes(length).toString('hex');
}

/**
 * Generate a cryptographically secure random base64 string
 * 
 * @param {number} length - Length in bytes (default: 32)
 * @returns {string} Base64-encoded random string
 */
function generateRandomBase64(length = 32) {
  return crypto.randomBytes(length).toString('base64');
}

module.exports = {
  constantTimeCompare,
  generateRandomString,
  generateRandomBase64,
};

