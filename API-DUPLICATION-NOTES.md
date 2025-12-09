# API Code Duplication - Architecture Notes

## Overview

This document explains why there are two locations for API code and how they relate to each other.

## Two API Locations

### 1. `warmthly/api/` (TypeScript)
**Purpose:** Reference implementation, local development, and testing
- Used by frontend components for client-side validation
- Used by test files for integration testing
- TypeScript for type safety in development
- **Not deployed** - serves as documentation and test utilities

### 2. `warmthly-api/server.js` (JavaScript)
**Purpose:** Production deployment on OCI Container Instances
- Express.js server implementation
- **This is the source of truth** for deployed endpoints
- All endpoints are implemented here
- Used in production

## Why Both Exist

1. **Different Environments:**
   - TypeScript code: Frontend/tests (browser/node test environment)
   - JavaScript code: Production server (OCI Container Instance)

2. **Different Formats:**
   - TypeScript: Node.js-style handlers for testing
   - JavaScript: Express.js middleware for production

3. **Maintenance Strategy:**
   - TypeScript versions serve as **reference implementations**
   - JavaScript server.js is the **deployed implementation**
   - When updating endpoints, update **server.js first**, then sync TypeScript versions if needed for tests

## Current Status

All endpoints are implemented in `warmthly-api/server.js`:
- ✅ `/api/login`
- ✅ `/api/send-email`
- ✅ `/api/get-emails`
- ✅ `/api/airtable`
- ✅ `/api/reports`
- ✅ `/api/convert-currency`
- ✅ `/api/get-yoco-public-key`
- ✅ `/api/create-checkout`
- ✅ `/api/i18n/*`

## Utility Functions

Similar duplication exists for utilities:
- `warmthly/api/utils/logger.ts` - Used by frontend/tests
- `warmthly-api/utils/logger.js` - Used by production server

**Reason:** Different runtime environments require different implementations, but they follow the same interface pattern.

## Best Practices

1. **When adding a new endpoint:**
   - Implement in `warmthly-api/server.js` first
   - Add TypeScript version to `warmthly/api/endpoints/` if needed for tests
   - Update this document

2. **When updating an endpoint:**
   - Update `warmthly-api/server.js` (production)
   - Sync TypeScript version if tests depend on it
   - Keep implementations functionally equivalent

3. **When in doubt:**
   - `warmthly-api/server.js` is the source of truth
   - TypeScript versions are for development/testing convenience

---

**Last Updated:** January 2025  
**Maintained By:** Development Team

