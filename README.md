# Warmthly API

This directory contains Cloudflare Pages Functions that handle server-side API endpoints.

## Structure

```
warmthly-api/
├── functions/
│   ├── api/
│   │   ├── [[path]].ts          # Catch-all handler (currently handles checkout)
│   │   └── i18n/
│   │       └── [[path]].ts      # i18n API endpoint
│   ├── index.ts                  # Donations/checkout handler
│   └── og-image/
│       └── [[path]].ts          # OG image generation
└── README-i18n.md                # i18n API documentation
```

## Current Status

### ✅ Deployed Endpoints

- `/api/i18n/*` - Internationalization API (in `functions/api/i18n/[[path]].ts`)
- `/api/create-checkout` - Payment checkout (in `functions/api/[[path]].ts`)

### ⚠️ Endpoints Not Yet Deployed

The following endpoints exist in `warmthly/api/endpoints/` but are **not yet deployed** to Cloudflare Pages:

- `/api/airtable` - Airtable data fetching
- `/api/send-email` - Email sending via Resend
- `/api/inbound-email` - Inbound email handling
- `/api/reports` - User report submissions
- `/api/get-emails` - Email retrieval (admin)
- `/api/get-yoco-public-key` - Yoco public key
- `/api/convert-currency` - Currency conversion
- `/api/csp-report` - CSP violation reporting
- `/api/login` - Admin authentication (in `warmthly/api/auth/login.ts`)

## Migration Needed

The endpoints in `warmthly/api/endpoints/` use Node.js-style handlers (req/res pattern with `process.env`). To deploy them to Cloudflare Pages Functions, they need to be converted to the Cloudflare Pages Functions format:

**Current format (Node.js):**
```typescript
async function handler(req: Request, res: Response): Promise<Response> {
  const apiKey = process.env.API_KEY;
  // ...
  return res.status(200).json(data);
}
export default handler;
```

**Cloudflare Pages Functions format:**
```typescript
interface Env {
  API_KEY: string;
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const apiKey = env.API_KEY;
  // ...
  return new Response(JSON.stringify(data), {
    headers: { 'Content-Type': 'application/json' },
  });
};
```

## Shared Utilities

Server-side utilities are in `warmthly/api/` and need to be moved to `warmthly-api/functions/lib/`:

- `warmthly/api/middleware/` → `warmthly-api/functions/lib/middleware/`
- `warmthly/api/security/` → `warmthly-api/functions/lib/security/`
- `warmthly/api/utils/` → `warmthly-api/functions/lib/utils/`
- `warmthly/api/auth/` → `warmthly-api/functions/lib/auth/`

**Note:** Client-side validation utilities (like `input-validation.ts` used in forms) should remain in `warmthly/api/middleware/` for use in the frontend.

## Deployment

API functions are automatically copied to each site's build directory during deployment (see `warmthly/.github/workflows/deploy.yml`). Each site gets its own copy of the functions, so they're available at `/api/*` on each domain.

## Environment Variables

Set these in Cloudflare Pages Environment Variables for each site:

- `YOCO_SECRET_KEY` - Yoco payment secret key
- `YOCO_PUBLIC_KEY` - Yoco payment public key
- `AIRTABLE_API_KEY` - Airtable API key (when airtable endpoint is deployed)
- `RESEND_API_KEY` - Resend email API key (when email endpoints are deployed)
- `REDIS_URL` - Redis connection string (for caching/rate limiting)
- `JWT_SECRET` - JWT signing secret (for auth endpoints)
- `ADMIN_PASSWORD` - Admin password (for login endpoint)
- `LIBRETRANSLATE_URL` - LibreTranslate instance URL (for i18n)
- `HUGGINGFACE_API_KEY` - Hugging Face API key (for i18n)

## Next Steps

1. Convert endpoints from Node.js format to Cloudflare Pages Functions format
2. Move shared utilities to `warmthly-api/functions/lib/`
3. Create individual route files in `warmthly-api/functions/api/` for each endpoint
4. Update imports in converted endpoints to use `lib/` utilities
5. Test all endpoints after conversion

