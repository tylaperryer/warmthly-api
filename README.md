# Warmthly API

Simple Cloudflare Pages Functions API for Warmthly.

## API Endpoints

- `POST /api/login` - Admin authentication
- `POST /api/send-email` - Send email via Resend
- `GET /api/get-emails` - Get emails from Supabase (requires JWT auth)
- `POST /api/create-checkout` - Create Yoco payment checkout
- `GET /api/get-yoco-public-key` - Get Yoco public key
- `GET /api/convert-currency` - Convert currency
- `POST /api/reports` - Submit a report
- `GET /donations` - Get donations from Supabase
- `POST /donations` - Create a donation in Supabase

## Setup

1. Install dependencies:
```bash
npm install
```

2. Set environment variables in Cloudflare Pages:
   - `ADMIN_PASSWORD` - Admin login password
   - `JWT_SECRET` - JWT signing secret
   - `RESEND_API_KEY` - Resend API key for emails
   - `YOCO_SECRET_KEY` - Yoco payment gateway secret key
   - `YOCO_PUBLIC_KEY` - Yoco payment gateway public key
   - `EXCHANGE_RATE_API_KEY` - Exchange rate API key (optional, defaults to free tier)
   - `SUPABASE_URL` - Supabase project URL
   - `SUPABASE_ANON_KEY` - Supabase anonymous key (for donations)
   - `SUPABASE_SERVICE_KEY` - Supabase service key (for get-emails)
   - `ADMIN_EMAIL` - Admin email for report notifications (optional)

## Deployment

Deploy to Cloudflare Pages:

```bash
npm run deploy
```

Or connect your GitHub repository to Cloudflare Pages for automatic deployments.

## Local Development

```bash
npm run dev
```

This will start a local development server using Wrangler.
