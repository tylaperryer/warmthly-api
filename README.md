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
- **HTTPS:** `https://backend.warmthly.org`
- **Port:** 80 (internal), 443 (via Cloudflare)

### Environment Variables
- `PORT` - Server port (default: 80)
- `YOCO_SECRET_KEY` - Yoco payment gateway secret key

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
docker run -p 80:80 -e YOCO_SECRET_KEY=your_key warmthly-api
```
