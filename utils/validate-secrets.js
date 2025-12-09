/**
 * Secrets Validation Utility
 * Validates required secrets on server startup
 * Prevents server from starting in broken state
 */

const { getSecrets, hasSecret } = require('./secrets-service');
const logger = require('./logger');

/**
 * Required secrets configuration
 * Maps to secrets-management.ts but for JavaScript backend
 */
const REQUIRED_SECRETS = [
  {
    name: 'JWT_SECRET',
    required: true,
    minLength: 32,
    description: 'JWT signing secret',
  },
  {
    name: 'YOCO_SECRET_KEY',
    required: true,
    minLength: 32,
    description: 'Yoco payment secret key',
  },
  {
    name: 'ADMIN_PASSWORD',
    required: true,
    minLength: 16,
    description: 'Admin login password',
  },
];

/**
 * Optional but recommended secrets
 */
const RECOMMENDED_SECRETS = [
  {
    name: 'RESEND_API_KEY',
    description: 'Resend email API key',
  },
  {
    name: 'AIRTABLE_API_KEY',
    description: 'Airtable API key',
  },
  {
    name: 'REDIS_URL',
    description: 'Redis connection URL',
  },
  {
    name: 'ADMIN_EMAIL',
    description: 'Admin email address',
  },
];

/**
 * Validate required secrets
 * @returns {{valid: boolean, missing: string[], warnings: string[]}}
 */
function validateRequiredSecrets() {
  const secrets = getSecrets();
  const missing = [];
  const warnings = [];

  // Check required secrets
  for (const secretConfig of REQUIRED_SECRETS) {
    const secretName = secretConfig.name;
    if (!hasSecret(secretName)) {
      missing.push(secretName);
      continue;
    }

    const secretValue = secrets[secretName];
    if (!secretValue || typeof secretValue !== 'string') {
      missing.push(secretName);
      continue;
    }

    // Check minimum length
    if (secretConfig.minLength && secretValue.length < secretConfig.minLength) {
      warnings.push(
        `${secretName} is too short (${secretValue.length} chars, minimum ${secretConfig.minLength})`
      );
    }
  }

  // Check recommended secrets
  for (const secretConfig of RECOMMENDED_SECRETS) {
    if (!hasSecret(secretConfig.name)) {
      warnings.push(
        `Recommended secret ${secretConfig.name} is not set (${secretConfig.description})`
      );
    }
  }

  return {
    valid: missing.length === 0,
    missing,
    warnings,
  };
}

/**
 * Validate secrets and exit if invalid
 * Call this on server startup
 */
function validateSecretsOnStartup() {
  const validation = validateRequiredSecrets();

  if (!validation.valid) {
    logger.error('❌ Missing required secrets:', validation.missing);
    logger.error('Server cannot start without required secrets.');
    logger.error('Please set the following environment variables:');
    validation.missing.forEach((name) => {
      logger.error(`  - ${name}`);
    });
    process.exit(1);
  }

  if (validation.warnings.length > 0) {
    logger.warn('⚠️  Secret validation warnings:');
    validation.warnings.forEach((warning) => {
      logger.warn(`  - ${warning}`);
    });
  }

  logger.log('✓ All required secrets validated');
}

module.exports = {
  validateRequiredSecrets,
  validateSecretsOnStartup,
};

