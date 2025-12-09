# Secrets Management Architecture

This document explains the secrets management systems used in the Warmthly project and when to use each one.

## Overview

Warmthly uses **different secrets management systems** for different parts of the codebase, each optimized for its specific use case:

1. **Backend API (OCI Server)** - `warmthly-api/vault-secrets.js`
2. **Frontend API (TypeScript)** - `warmthly/api/utils/advanced-secrets.ts` + `secrets-management.ts`
3. **Secrets Service** - `warmthly-api/utils/secrets-service.js` (replaces global.secrets)

## System 1: Backend API - `vault-secrets.js`

**Location:** `warmthly-api/vault-secrets.js`  
**Used by:** `warmthly-api/server.js` (Express.js backend)  
**Purpose:** Simple environment variable wrapper for OCI Container Instance deployment

### Features:
- Reads from `process.env` (injected by GitHub Actions)
- Simple caching mechanism
- Lightweight, no external dependencies
- Optimized for server-side Node.js

### Usage:
```javascript
const { loadSecrets } = require('./vault-secrets');
const secrets = loadSecrets();
const apiKey = secrets.YOCO_SECRET_KEY;
```

### When to Use:
- ✅ Backend Express.js server (`warmthly-api/server.js`)
- ✅ OCI Container Instance deployment
- ✅ Server-side only code

### When NOT to Use:
- ❌ Frontend code
- ❌ TypeScript code
- ❌ Client-side code

---

## System 2: Frontend API - `advanced-secrets.ts` + `secrets-management.ts`

**Location:** 
- `warmthly/api/utils/advanced-secrets.ts` - Multi-provider support
- `warmthly/api/utils/secrets-management.ts` - Validation and rotation

**Used by:** 
- Frontend TypeScript code
- Test files
- Client-side validation

### Features:
- **Multi-provider support:** AWS Secrets Manager, HashiCorp Vault, Azure Key Vault, ENV
- **Runtime secret fetching** with caching
- **Secret rotation support**
- **Validation and rotation tracking**
- TypeScript type safety

### Usage:
```typescript
import { getSecret } from '@api/utils/advanced-secrets';
const apiKey = await getSecret('YOCO_SECRET_KEY');
```

### When to Use:
- ✅ Frontend TypeScript code
- ✅ Test files
- ✅ Client-side validation
- ✅ When you need multi-provider support

### When NOT to Use:
- ❌ Backend Express.js server (use `vault-secrets.js` instead)

---

## System 3: Secrets Service - `secrets-service.js`

**Location:** `warmthly-api/utils/secrets-service.js`  
**Used by:** `warmthly-api/server.js`  
**Purpose:** Replaces `global.secrets` anti-pattern with explicit service

### Features:
- Explicit getter functions
- No global namespace pollution
- Better security (explicit access)
- Easier to test and mock

### Usage:
```javascript
const { getSecret, hasSecret } = require('./utils/secrets-service');

// Get a specific secret
const apiKey = getSecret('YOCO_SECRET_KEY');

// Check if secret exists
if (hasSecret('YOCO_SECRET_KEY')) {
  // Use secret
}
```

### When to Use:
- ✅ Backend Express.js server (preferred over direct `vault-secrets.js`)
- ✅ Any code that needs explicit secret access
- ✅ When you want to avoid global variables

---

## Migration Guide

### From `global.secrets` to `secrets-service.js`

**Old (Anti-pattern):**
```javascript
// ❌ Don't use
const apiKey = global.secrets.YOCO_SECRET_KEY;
```

**New (Service Pattern):**
```javascript
// ✅ Use service
const { getSecret } = require('./utils/secrets-service');
const apiKey = getSecret('YOCO_SECRET_KEY');
```

---

## Best Practices

1. **Backend Code:** Use `secrets-service.js` (which wraps `vault-secrets.js`)
2. **Frontend Code:** Use `advanced-secrets.ts` for TypeScript, or environment variables for client-side
3. **Never:** Use `global.secrets` directly
4. **Always:** Validate secrets exist before use
5. **Testing:** Use dependency injection or mocks for secrets in tests

---

## Security Considerations

- ✅ Secrets are frozen (immutable) after loading
- ✅ No global namespace pollution (service pattern)
- ✅ Explicit access control (getter functions)
- ✅ Secrets never logged or exposed
- ✅ Environment variables injected securely via GitHub Actions

---

## Future Enhancements

- [ ] Add OCI Vault integration (see `README-VAULT.md`)
- [ ] Add secret rotation automation
- [ ] Add secret expiration tracking
- [ ] Add audit logging for secret access

---

## Related Documentation

- `warmthly-api/README-VAULT.md` - OCI Vault integration guide
- `warmthly-api/.github/workflows/README-SETUP.md` - GitHub Secrets setup
- `warmthly/api/utils/secrets-management.ts` - Secret validation and rotation

