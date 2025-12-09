/**
 * Rate Limiting Middleware
 * Provides Redis-based rate limiting for API endpoints
 * Implements sliding window rate limiting algorithm
 */

const logger = require('./logger');
const { getRedisClient } = require('./redis-client');

/**
 * Default rate limit configuration
 */
const DEFAULT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const DEFAULT_MAX = 100; // 100 requests per window

/**
 * Get client identifier from request
 * Uses IP address from headers or connection
 * 
 * @param {object} req - Request object
 * @returns {string} Client identifier string
 */
function getClientIdentifier(req) {
  const forwardedFor = req.headers['x-forwarded-for'];
  if (forwardedFor) {
    // Get first IP from X-Forwarded-For header
    const firstIp = forwardedFor.split(',')[0]?.trim();
    if (firstIp) {
      return firstIp;
    }
  }

  const realIp = req.headers['x-real-ip'];
  if (realIp) {
    return realIp;
  }

  const remoteAddress = req.connection?.remoteAddress || req.ip;
  if (remoteAddress) {
    return remoteAddress;
  }

  return 'unknown';
}

/**
 * Check rate limit for a request
 * 
 * @param {object} req - Request object
 * @param {object} options - Rate limit options
 * @returns {Promise<object>} Rate limit result
 */
async function checkRateLimit(req, options = {}) {
  const windowMs = options.windowMs ?? DEFAULT_WINDOW_MS;
  const max = options.max ?? DEFAULT_MAX;
  const failureMode = options.failureMode ?? 'fail_open';

  const identifier = getClientIdentifier(req);
  const key = `ratelimit:${identifier}:${req.path || req.url}`;
  const now = Date.now();
  const resetTime = now + windowMs;

  try {
    const client = await getRedisClient();
    
    // If Redis is not available and fail-open, allow request
    if (!client && failureMode === 'fail_open') {
      logger.warn('[rate-limit] Redis unavailable, allowing request (fail-open mode)');
      return { allowed: true, remaining: max, resetTime: resetTime };
    }
    
    // If Redis is not available and fail-closed, reject request
    if (!client && failureMode === 'fail_closed') {
      logger.error('[rate-limit] Redis unavailable, rejecting request (fail-closed mode)');
      return {
        allowed: false,
        remaining: 0,
        resetTime: resetTime,
        retryAfter: Math.ceil(windowMs / 1000),
      };
    }

    // Use pipeline for atomic operations
    const pipeline = client.pipeline();
    pipeline.incr(key);
    pipeline.pttl(key);
    const results = await pipeline.exec();

    if (!results || results.length < 2) {
      throw new Error('Redis pipeline execution failed');
    }

    const count = results[0]?.[1];
    const ttl = results[1]?.[1];

    if (typeof count !== 'number' || typeof ttl !== 'number') {
      throw new Error('Invalid Redis response');
    }

    // Set expiration if this is the first request or key has no TTL
    if (count === 1) {
      await client.pexpire(key, windowMs);
    } else if (ttl === -1) {
      await client.pexpire(key, windowMs);
    }

    // Get actual TTL
    const actualTtl = await client.pttl(key);
    const actualResetTime = now + (actualTtl > 0 ? actualTtl : windowMs);

    if (count > max) {
      return {
        allowed: false,
        remaining: 0,
        resetTime: actualResetTime,
        retryAfter: Math.ceil((ttl > 0 ? ttl : windowMs) / 1000),
      };
    }

    return {
      allowed: true,
      remaining: max - count,
      resetTime: actualResetTime,
    };
  } catch (error) {
    // Handle Redis errors based on failure mode
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('[rate-limit] Redis error:', errorMessage);
    
    if (failureMode === 'fail_closed') {
      // Fail closed: Reject request
      logger.error('[rate-limit] Redis unavailable, rejecting request (fail-closed mode)');
      return {
        allowed: false,
        remaining: 0,
        resetTime: resetTime,
        retryAfter: Math.ceil(windowMs / 1000),
      };
    } else {
      // Fail open: Allow request (default behavior)
      // Log warning for security monitoring
      logger.warn('[rate-limit] Redis unavailable, allowing request (fail-open mode)');
      logger.warn('[rate-limit] WARNING: Rate limiting is degraded - security feature may be compromised');
      return { allowed: true, remaining: max, resetTime: resetTime };
    }
  }
}

/**
 * Wrap a request handler with rate limiting
 * 
 * @param {Function} handler - Request handler function
 * @param {object} options - Rate limit options
 * @returns {Function} Wrapped handler with rate limiting
 */
function withRateLimit(handler, options = {}) {
  return async (req, res, next) => {
    const result = await checkRateLimit(req, options);

    // Set rate limit headers
    res.setHeader('X-RateLimit-Limit', options.max ?? DEFAULT_MAX);
    res.setHeader('X-RateLimit-Remaining', result.remaining);
    res.setHeader('X-RateLimit-Reset', new Date(result.resetTime).toISOString());

    if (!result.allowed) {
      // Rate limit exceeded
      if (result.retryAfter !== undefined) {
        res.setHeader('Retry-After', result.retryAfter);
      }
      return res.status(429).json({
        error: { message: options.message ?? 'Too many requests, please try again later.' },
      });
    }

    // Request allowed, proceed with handler
    return handler(req, res, next);
  };
}

/**
 * Pre-configured rate limit options for login
 * Uses fail-closed mode for security (critical endpoint)
 */
const loginRateLimitOptions = {
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 login attempts
  message: 'Too many login attempts, please try again later.',
  failureMode: 'fail_closed', // Critical: reject if Redis fails
};

/**
 * Pre-configured rate limit options for email
 */
const emailRateLimitOptions = {
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // 10 email requests
  message: 'Too many email requests, please try again later.',
};

/**
 * Pre-configured rate limit options for general API
 */
const apiRateLimitOptions = {
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests
  message: 'Too many requests, please try again later.',
};

module.exports = {
  withRateLimit,
  checkRateLimit,
  getClientIdentifier,
  loginRateLimitOptions,
  emailRateLimitOptions,
  apiRateLimitOptions,
};

