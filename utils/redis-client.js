/**
 * Redis Client Utility
 * Provides singleton Redis client with connection management
 * Handles reconnection, timeouts, and error recovery
 * 
 * Connection Pooling: The Redis client uses a singleton pattern with connection reuse.
 * The `redis` package (v4.6.0+) handles connection pooling internally.
 * Multiple requests share the same connection, which is automatically managed.
 */

const { createClient } = require('redis');
const logger = require('./logger');

/**
 * Maximum reconnection retries
 */
const MAX_RECONNECT_RETRIES = 3;

/**
 * Maximum reconnection delay in milliseconds
 */
const MAX_RECONNECT_DELAY = 3000;

/**
 * Connection timeout in milliseconds
 */
const CONNECTION_TIMEOUT = 5000;

/**
 * Redis client instance (singleton pattern for connection pooling)
 * The redis package handles connection pooling internally - this singleton
 * ensures all requests share the same connection, which is more efficient
 * than creating multiple clients.
 */
let redisClient = null;

/**
 * Connection promise (prevents multiple simultaneous connections)
 */
let connectionPromise = null;

/**
 * Get or create Redis client
 * Returns existing client if connected, otherwise creates new connection
 * 
 * Connection Pooling: This function implements a singleton pattern to ensure
 * all requests share the same Redis connection. The underlying `redis` package
 * (v4.6.0+) handles connection pooling internally, managing multiple operations
 * efficiently on a single connection.
 * 
 * @returns {Promise<RedisClientType>} Promise resolving to Redis client
 * @throws {Error} If REDIS_URL is not configured or connection fails
 */
async function getRedisClient() {
  // Return existing client if connected (connection pooling via singleton)
  if (redisClient?.isOpen) {
    return redisClient;
  }

  // Return existing connection promise if connecting
  if (connectionPromise) {
    return connectionPromise;
  }

  // If REDIS_URL is not configured, return null (fail-open for optional Redis)
  if (!process.env.REDIS_URL) {
    logger.warn('[redis-client] REDIS_URL is not configured - Redis features will be disabled');
    logger.warn('[redis-client] WARNING: Rate limiting and caching will be degraded without Redis');
    return null;
  }

  // Create new connection
  connectionPromise = (async () => {
    try {
      // Create Redis client
      // The redis package handles connection pooling internally
      redisClient = createClient({
        url: process.env.REDIS_URL,
        socket: {
          connectTimeout: CONNECTION_TIMEOUT,
          reconnectStrategy: (retries) => {
            if (retries > MAX_RECONNECT_RETRIES) {
              logger.error('[redis-client] Redis reconnection failed after 3 attempts');
              connectionPromise = null;
              return new Error('Redis reconnection failed');
            }
            // Exponential backoff with max delay
            return Math.min(retries * 100, MAX_RECONNECT_DELAY);
          },
        },
      });

      // Error handler
      redisClient.on('error', (err) => {
        logger.error('[redis-client] Redis Client Error:', err);
        if (!redisClient?.isOpen) {
          connectionPromise = null;
        }
      });

      // Connection event handlers
      redisClient.on('connect', () => {
        logger.log('[redis-client] Redis connected');
      });

      redisClient.on('ready', () => {
        logger.log('[redis-client] Redis ready');
      });

      // Connect with timeout
      if (!redisClient.isOpen) {
        await Promise.race([
          redisClient.connect(),
          new Promise((_, reject) =>
            setTimeout(() => {
              reject(new Error('Connection timeout'));
            }, CONNECTION_TIMEOUT)
          ),
        ]);
      }

      // Clear connection promise on success
      connectionPromise = null;
      return redisClient;
    } catch (connectError) {
      // Cleanup on error
      connectionPromise = null;
      redisClient = null;

      // Log error details
      if (connectError instanceof Error) {
        logger.error('[redis-client] Redis connection failed:', {
          message: connectError.message,
          stack: connectError.stack,
          name: connectError.name,
        });
        throw connectError;
      }

      // Unknown error type
      const error = new Error('Redis connection failed');
      logger.error('[redis-client] Redis connection failed:', error);
      throw error;
    }
  })();

  return connectionPromise;
}

module.exports = {
  getRedisClient,
};
