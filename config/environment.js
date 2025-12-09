/**
 * Environment Configuration
 * Centralized environment detection and configuration
 */

/**
 * Get the current environment mode
 * @returns {string} 'development' | 'production' | 'test'
 */
function getEnvironment() {
  return process.env.NODE_ENV || 'production';
}

/**
 * Check if running in development mode
 * @returns {boolean}
 */
function isDevelopment() {
  return getEnvironment() === 'development';
}

/**
 * Check if running in production mode
 * @returns {boolean}
 */
function isProduction() {
  return getEnvironment() === 'production';
}

/**
 * Check if running in test mode
 * @returns {boolean}
 */
function isTest() {
  return getEnvironment() === 'test';
}

/**
 * Get environment-specific configuration
 * @returns {object} Environment config
 */
function getEnvironmentConfig() {
  const env = getEnvironment();
  
  return {
    env,
    isDevelopment: isDevelopment(),
    isProduction: isProduction(),
    isTest: isTest(),
    // Development-only features
    showErrorDetails: isDevelopment(),
    verboseLogging: isDevelopment(),
    // Production features
    enableCaching: isProduction() || !isDevelopment(),
    enableRateLimiting: true, // Always enabled
  };
}

module.exports = {
  getEnvironment,
  isDevelopment,
  isProduction,
  isTest,
  getEnvironmentConfig,
};

