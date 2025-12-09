/**
 * Secrets Helper
 * Simple wrapper for environment variables
 * Secrets are injected via GitHub Secrets during deployment
 */

let secretsCache = {};

/**
 * Load all secrets from environment variables
 * Secrets are injected by GitHub Actions during container instance creation
 */
function loadSecrets() {
  if (Object.keys(secretsCache).length > 0) {
    return secretsCache;
  }

  // Simply read from environment variables
  // These are injected by GitHub Actions when creating the container instance
  secretsCache = {
    HUGGINGFACE_API_KEY: process.env.HUGGINGFACE_API_KEY,
    YOCO_SECRET_KEY: process.env.YOCO_SECRET_KEY,
    YOCO_PUBLIC_KEY: process.env.YOCO_PUBLIC_KEY,
    LIBRETRANSLATE_URL: process.env.LIBRETRANSLATE_URL,
    LIBRETRANSLATE_API_KEY: process.env.LIBRETRANSLATE_API_KEY,
    ADMIN_PASSWORD: process.env.ADMIN_PASSWORD,
    JWT_SECRET: process.env.JWT_SECRET,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    AIRTABLE_API_KEY: process.env.AIRTABLE_API_KEY,
    EXCHANGE_RATE_API_KEY: process.env.EXCHANGE_RATE_API_KEY,
    REDIS_URL: process.env.REDIS_URL,
    ADMIN_EMAIL: process.env.ADMIN_EMAIL
  };

  return secretsCache;
}

/**
 * Clear secrets cache (useful for testing)
 */
function clearCache() {
  secretsCache = {};
}

module.exports = { 
  loadSecrets, 
  clearCache
};

