/**
 * Security Monitoring and Alerting System
 * Tracks security events and triggers alerts on suspicious patterns
 */

const logger = require('./logger');
const { getRedisClient } = require('./redis-client');

/**
 * Log a security event
 * 
 * @param {object} event - Security event to log
 */
async function logSecurityEvent(event) {
  try {
    // Log to console (structured logging)
    logger.error(`[SecurityEvent] ${event.type}`, {
      severity: event.severity,
      identifier: event.identifier,
      endpoint: event.endpoint,
      details: event.details,
      metadata: event.metadata,
      timestamp: new Date(event.timestamp).toISOString(),
    });

    // Store in Redis for pattern detection (if available)
    const client = await getRedisClient();
    if (client) {
      const key = `security:events:${event.identifier}:${event.type}`;
      const now = Date.now();

      // Add event to sorted set (score = timestamp)
      await client.zAdd(key, {
        score: now,
        value: JSON.stringify(event),
      });

      // Set expiration (keep events for 24 hours)
      await client.pexpire(key, 24 * 60 * 60 * 1000);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('[security-monitor] Error logging security event:', errorMessage);
    // Don't throw - logging failures shouldn't break the application
  }
}

/**
 * Helper function to log authentication failures
 */
function authenticationFailure(identifier, endpoint) {
  return logSecurityEvent({
    type: 'authentication_failure',
    severity: 'medium',
    timestamp: Date.now(),
    identifier,
    endpoint,
  });
}

module.exports = {
  SecurityLogger: {
    authenticationFailure,
  },
};

