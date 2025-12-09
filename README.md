# Warmthly API

Express.js API server for Warmthly, deployed on OCI Container Instances.

## API Endpoints

- `GET /health` - Health check endpoint
- `POST /api/create-checkout` - Create Yoco payment checkout
- `GET /api/i18n/languages` - Get available languages
- `GET /api/i18n/:language` - Get translations for a language
- `POST /api/i18n/:language/chunk` - Get translation chunk

## Deployment

### Production URL
- **HTTP:** `http://backend.warmthly.org` (port 80)
- **HTTPS:** `https://backend.warmthly.org` (port 443 - Let's Encrypt SSL)
- **Ports:** 80 (HTTP) and 443 (HTTPS) - both handled by Greenlock

### Environment Variables

Secrets are automatically injected via GitHub Secrets during deployment. The API reads from environment variables:

**Required:**
- `PORT` - Server port (default: 80, but Greenlock handles both 80 and 443)
- `LE_EMAIL` - Let's Encrypt email for certificate notifications (required for HTTPS)
- `LE_STAGING` - Set to `true` for testing Let's Encrypt, `false` for production (optional, defaults to `false`)

**Secrets (injected by GitHub Actions):**
- `HUGGINGFACE_API_KEY` - Hugging Face API key for NLLB translations
- `YOCO_SECRET_KEY` - Yoco payment gateway secret key
- `LIBRETRANSLATE_URL` - LibreTranslate instance URL (optional)
- `LIBRETRANSLATE_API_KEY` - LibreTranslate API key (optional)

**Note:** For local development, set these environment variables directly. See `.github/workflows/README-SETUP.md` for GitHub Secrets setup.

### Auto-Deployment
Pushing to `main` branch automatically deploys via GitHub Actions to OCI Container Registry and restarts the container instance.

## Local Development

```bash
npm install
npm start
```

Server runs on `http://localhost:80` (or port specified by `PORT` env var).

## Docker

```bash
docker build -t warmthly-api .
docker run -p 80:80 -p 443:443 -e YOCO_SECRET_KEY=your_key -e LE_EMAIL=your-email@example.com warmthly-api
```

## Oracle Cloud Configuration

**Important:** After deploying, ensure your OCI Container Instance has:

1. **Port 443 exposed:**
   - Go to Container Instance → Edit
   - Under Container Configuration → Ports
   - Ensure both port 80 and 443 are mapped

2. **Security List allows port 443:**
   - Networking → Virtual Cloud Networks → Your VCN
   - Security Lists → Ingress Rules
   - Add rule: Source 0.0.0.0/0, TCP, Port 443

3. **Environment Variables set:**
   - `LE_EMAIL` - Your email for Let's Encrypt
   - `LE_STAGING` - Set to `true` for testing, `false` for production
   - `YOCO_SECRET_KEY` - Your Yoco payment key
