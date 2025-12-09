/**
 * Secrets Service
 * Provides secure, centralized access to secrets
 * Replaces global.secrets anti-pattern with explicit service
 */

const { loadSecrets } = require('../vault-secrets');

// Load and freeze secrets once at module load
const secrets = Object.freeze(loadSecrets());

/**
 * Get secrets object (read-only)
 * @returns {Object} Frozen secrets object
 */
function getSecrets() {
  return secrets;
}

/**
 * Get a specific secret by name
 * @param {string} name - Secret name
 * @returns {string|undefined} Secret value or undefined if not found
 */
function getSecret(name) {
  return secrets[name];
}

/**
 * Check if a secret exists
 * @param {string} name - Secret name
 * @returns {boolean} True if secret exists
 */
function hasSecret(name) {
  return name in secrets && secrets[name] !== undefined && secrets[name] !== null;
}

module.exports = {
  getSecrets,
  getSecret,
  hasSecret,
};

