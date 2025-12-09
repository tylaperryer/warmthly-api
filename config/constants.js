/**
 * Application Constants
 * Centralized configuration constants to avoid magic numbers
 * 
 * @module config/constants
 * @description
 * This module contains all application-wide constants used throughout the API.
 * Constants are organized by category for easy maintenance.
 * 
 * When to modify:
 * - Adjust limits based on business requirements
 * - Update timeouts based on external API performance
 * - Change cache TTLs based on data freshness requirements
 * 
 * Impact of changes:
 * - Cache TTL changes affect data freshness and Redis memory usage
 * - Timeout changes affect API reliability and user experience
 * - Limit changes affect security and resource usage
 */

/**
 * Cache configuration
 * 
 * @constant {Object} CACHE_CONFIG
 * @description
 * Controls how long data is cached in Redis.
 * 
 * Purpose:
 * - Reduce load on external APIs (Airtable, exchange rates)
 * - Improve response times for frequently accessed data
 * 
 * When to modify:
 * - If external data changes frequently, reduce TTL
 * - If memory usage is high, reduce TTL
 * - If data freshness is critical, reduce TTL
 * 
 * Impact:
 * - Lower TTL = more API calls, fresher data, higher memory usage
 * - Higher TTL = fewer API calls, potentially stale data, lower memory usage
 */
const CACHE_CONFIG = {
  /** Cache TTL in milliseconds (30 seconds) */
  TTL_MS: 30 * 1000,
  /** Cache TTL in seconds (for Redis SETEX) */
  TTL_SECONDS: 30,
};

/**
 * API timeout configuration
 * 
 * @constant {Object} API_TIMEOUT
 * @description
 * Timeout values for external API calls to prevent hanging requests.
 * 
 * Purpose:
 * - Prevent requests from hanging indefinitely
 * - Ensure timely error responses
 * - Protect against slow external APIs
 * 
 * When to modify:
 * - If external APIs are consistently slow, increase timeout
 * - If timeouts are too frequent, increase timeout
 * - If user experience requires faster failures, decrease timeout
 * 
 * Impact:
 * - Lower timeout = faster failures, may cause legitimate requests to fail
 * - Higher timeout = more resilient, but slower failure detection
 */
const API_TIMEOUT = {
  /** 
   * Default API timeout in milliseconds (10 seconds)
   * Used for most external API calls
   */
  DEFAULT_MS: 10000,
  /** 
   * Airtable API timeout in milliseconds
   * Airtable can be slow with large datasets
   */
  AIRTABLE_MS: 10000,
  /** 
   * Exchange rate API timeout in milliseconds
   * Exchange rate APIs are typically fast
   */
  EXCHANGE_RATE_MS: 10000,
};

/**
 * Amount validation limits
 * 
 * @constant {Object} AMOUNT_LIMITS
 * @description
 * Validation limits for payment amounts and currency conversions.
 * 
 * Purpose:
 * - Prevent invalid payment amounts (negative, zero, too large)
 * - Prevent DoS attacks via extremely large amounts
 * - Ensure payment gateway compatibility
 * 
 * When to modify:
 * - If payment gateway limits change, update MAX_CENTS
 * - If business requirements change, update limits
 * - If currency conversion limits change, update MAX_CONVERSION
 * 
 * Impact:
 * - Lower limits = more secure, but may reject legitimate large donations
 * - Higher limits = more flexible, but higher risk of abuse
 * - Changes affect both client and server validation
 */
const AMOUNT_LIMITS = {
  /** 
   * Minimum amount in cents
   * Prevents zero or negative amounts
   */
  MIN_CENTS: 1,
  /** 
   * Maximum amount in cents (1 million = 10,000.00 in currency)
   * Prevents extremely large payments that could cause issues
   */
  MAX_CENTS: 100000000,
  /** 
   * Maximum amount for currency conversion (10 million = 100,000.00)
   * Higher limit for conversion to allow larger donations
   */
  MAX_CONVERSION: 1000000000,
};

/**
 * Request size limits
 * 
 * @constant {Object} REQUEST_LIMITS
 * @description
 * Maximum sizes for incoming requests to prevent DoS attacks.
 * 
 * Purpose:
 * - Prevent memory exhaustion from large requests
 * - Protect against DoS attacks
 * - Ensure reasonable request sizes
 * 
 * When to modify:
 * - If legitimate requests exceed limit, increase
 * - If memory usage is high, decrease
 * - If security requirements change, adjust
 * 
 * Impact:
 * - Lower limit = more secure, but may reject legitimate large requests
 * - Higher limit = more flexible, but higher memory usage risk
 */
const REQUEST_LIMITS = {
  /** 
   * Maximum JSON body size
   * Express.js format: '10mb' = 10 megabytes
   * Prevents extremely large request bodies
   */
  JSON_MAX_SIZE: '10mb',
};

/**
 * Data limits
 * 
 * @constant {Object} DATA_LIMITS
 * @description
 * Limits on data retrieval and storage to prevent resource exhaustion.
 * 
 * Purpose:
 * - Prevent excessive data retrieval
 * - Limit Redis memory usage
 * - Ensure reasonable response sizes
 * 
 * When to modify:
 * - If business needs require more data, increase limits
 * - If memory usage is high, decrease limits
 * - If performance degrades, decrease limits
 * 
 * Impact:
 * - Lower limits = less memory usage, faster responses, but may truncate data
 * - Higher limits = more data available, but higher memory usage and slower responses
 */
const DATA_LIMITS = {
  /** 
   * Maximum Airtable records to fetch
   * Prevents excessive API calls and large responses
   * Consider pagination for larger datasets
   */
  MAX_AIRTABLE_RECORDS: 1000,
  /** 
   * Maximum emails to retrieve
   * Limits admin email viewing to prevent large responses
   * Consider pagination for email management
   */
  MAX_EMAILS: 100,
  /** 
   * Maximum reports to store in Redis
   * Prevents Redis memory exhaustion
   * Consider archiving old reports
   */
  MAX_REPORTS: 1000,
};

module.exports = {
  CACHE_CONFIG,
  API_TIMEOUT,
  AMOUNT_LIMITS,
  REQUEST_LIMITS,
  DATA_LIMITS,
};

