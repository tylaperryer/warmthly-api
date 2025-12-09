/**
 * Logger Utility
 * Provides type-safe logging with environment-aware output
 * Only logs errors in production, all logs in development
 */

/**
 * Check if running in development environment
 */
const isDevelopment = process.env.NODE_ENV === 'development';

/**
 * Logger implementation
 * Environment-aware logging utility
 */
const logger = {
  /**
   * Log message (development only)
   * @param {...any} args - Arguments to log
   */
  log: (...args) => {
    if (isDevelopment) {
      console.log(...args);
    }
  },

  /**
   * Log warning (development only)
   * @param {...any} args - Arguments to log
   */
  warn: (...args) => {
    if (isDevelopment) {
      console.warn(...args);
    }
  },

  /**
   * Log error (always logged)
   * @param {...any} args - Arguments to log
   */
  error: (...args) => {
    console.error(...args);
  },

  /**
   * Log info (development only)
   * @param {...any} args - Arguments to log
   */
  info: (...args) => {
    if (isDevelopment) {
      console.info(...args);
    }
  },

  /**
   * Log debug (development only)
   * @param {...any} args - Arguments to log
   */
  debug: (...args) => {
    if (isDevelopment) {
      console.debug(...args);
    }
  },
};

module.exports = logger;

