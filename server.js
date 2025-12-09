const express = require('express');
const cors = require('cors');
const compression = require('compression');
const jwt = require('jsonwebtoken');
const { Resend } = require('resend');
const { getSecrets, getSecret, hasSecret } = require('./utils/secrets-service');
const { validateSecretsOnStartup } = require('./utils/validate-secrets');
const { withRateLimit, loginRateLimitOptions, emailRateLimitOptions, apiRateLimitOptions } = require('./utils/rate-limit');
const { constantTimeCompare } = require('./utils/crypto-utils');
const { getRedisClient } = require('./utils/redis-client');
const { verifyTOTP, isMFAEnabled, getTOTPSecret } = require('./utils/totp');
const { SecurityLogger } = require('./utils/security-monitor');
const logger = require('./utils/logger');
const { validateLanguageCode } = require('./utils/language-validator');
const { CACHE_CONFIG, API_TIMEOUT, AMOUNT_LIMITS, REQUEST_LIMITS, DATA_LIMITS } = require('./config/constants');
const { isDevelopment, getEnvironmentConfig } = require('./config/environment');

const app = express();

// Load secrets using service pattern (replaces global.secrets)
const secrets = getSecrets();
logger.log('✓ Secrets loaded from environment variables');

// Validate required secrets on startup (prevents broken state)
validateSecretsOnStartup();

// CORS configuration - configurable via environment variable
const defaultOrigins = [
  'https://www.warmthly.org',
  'https://mint.warmthly.org',
  'https://post.warmthly.org',
  'https://admin.warmthly.org'
];

// Allow CORS origins to be configured via environment variable
// Format: ALLOWED_ORIGINS=https://example.com,https://another.com
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(origin => origin.trim())
  : defaultOrigins;

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, curl, etc.)
    if (!origin) return callback(null, true);
    
    // Use exact match to prevent subdomain attacks (e.g., evil-warmthly.org)
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      // Reject unauthorized origins (security: don't default to allowed origin)
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Response compression (gzip/deflate) for better performance
app.use(compression({
  filter: (req, res) => {
    // Don't compress responses if client doesn't support it
    if (req.headers['x-no-compression']) {
      return false;
    }
    // Use compression for all other responses
    return compression.filter(req, res);
  },
  // Compression level: 4-6 is optimal for most cases (6 provides good balance)
  // Higher levels (7-9) provide minimal size reduction but significant CPU cost
  level: parseInt(process.env.COMPRESSION_LEVEL, 10) || 6,
  // Only compress responses larger than 1KB (default threshold)
  threshold: parseInt(process.env.COMPRESSION_THRESHOLD, 10) || 1024,
  // Enable Brotli compression if available (better than gzip)
  brotli: true,
}));

// Request size limit to prevent DoS attacks
app.use(express.json({ limit: REQUEST_LIMITS.JSON_MAX_SIZE }));

// Request ID middleware for error tracking
app.use((req, res, next) => {
  // Generate unique request ID for error tracking
  // SECURITY: Use .substring() instead of deprecated .substr()
  req.id = `req-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
  res.setHeader('X-Request-ID', req.id);
  next();
});

// Health check
app.get('/health', async (req, res) => {
  const health = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: process.env.npm_package_version || '1.0.0',
  };

  // Check Redis availability (non-blocking)
  try {
    const redisClient = await getRedisClient();
    if (redisClient && redisClient.isOpen) {
      health.redis = { status: 'connected' };
    } else {
      health.redis = { status: 'unavailable', warning: 'Rate limiting may be degraded' };
    }
  } catch (error) {
    health.redis = { status: 'error', message: error.message };
  }

  const statusCode = health.redis?.status === 'connected' ? 200 : 200; // Still return 200, but include warning
  res.status(statusCode).json(health);
});

// API: Create checkout (Yoco payment)
app.post('/api/create-checkout', async (req, res) => {
  // Allowed currencies (ISO 4217 codes)
  const ALLOWED_CURRENCIES = ['ZAR', 'USD', 'EUR', 'GBP'];

  const { amount, currency } = req.body;
  
  // Validate required fields
  if (amount === undefined || amount === null) {
    return res.status(400).json({ error: { message: 'Amount is required' } });
  }
  
  if (!currency || typeof currency !== 'string') {
    return res.status(400).json({ error: { message: 'Currency is required' } });
  }

  // Validate currency against whitelist (security)
  if (!ALLOWED_CURRENCIES.includes(currency.toUpperCase())) {
    return res.status(400).json({ 
      error: { message: `Invalid currency. Allowed currencies: ${ALLOWED_CURRENCIES.join(', ')}` } 
    });
  }

  // Validate amount type and range
  const amountNum = typeof amount === 'number' ? amount : parseFloat(amount);
  if (isNaN(amountNum) || !isFinite(amountNum)) {
    return res.status(400).json({ error: { message: 'Amount must be a valid number' } });
  }

  // Amount must be in cents (integer)
  const amountCents = Math.round(amountNum);
  if (amountCents < AMOUNT_LIMITS.MIN_CENTS || amountCents > AMOUNT_LIMITS.MAX_CENTS) {
    return res.status(400).json({ 
      error: { message: `Amount must be between ${AMOUNT_LIMITS.MIN_CENTS} and ${AMOUNT_LIMITS.MAX_CENTS} cents` } 
    });
  }

  if (!secrets.YOCO_SECRET_KEY) {
    logger.error('[create-checkout] YOCO_SECRET_KEY not configured');
    return res.status(500).json({ error: { message: 'Payment service not configured' } });
  }

  try {
    const yocoResponse = await fetch('https://online.yoco.com/v1/checkout/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${secrets.YOCO_SECRET_KEY}`
      },
      body: JSON.stringify({
        amount: amountCents,
        currency: currency.toUpperCase(),
        success_url: 'https://www.warmthly.org/payment-success',
        cancel_url: 'https://www.warmthly.org/payment-cancelled'
      })
    });

    if (!yocoResponse.ok) {
      const errorText = await yocoResponse.text();
      logger.error('[create-checkout] Yoco API error:', {
        status: yocoResponse.status,
        error: errorText
      });
      return res.status(yocoResponse.status).json({ 
        error: { message: 'Failed to create checkout. Please try again.' } 
      });
    }

    const data = await yocoResponse.json();
    
    // SECURITY: Store payment info for server-side verification
    const client = await getRedisClient();
    if (client && data.id) {
      const paymentKey = `payment:${data.id}`;
      const paymentData = {
        id: data.id,
        amount: amountCents,
        currency: currency.toUpperCase(),
        timestamp: new Date().toISOString(),
        verified: false
      };
      // Store for 7 days (payment verification window)
      await client.setEx(paymentKey, 86400 * 7, JSON.stringify(paymentData));
    }
    
    return res.status(200).json({ id: data.id });
  } catch (error) {
    logger.error('[create-checkout] Unexpected error:', {
      requestId: req.id,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      url: req.url,
      method: req.method
    });
    return res.status(500).json({ error: { message: 'Internal Server Error' } });
  }
});

// API: i18n - Get available languages
app.get('/api/i18n/languages', (req, res) => {
  // Basic implementation - you can expand this later
  res.json({ 
    languages: ['en', 'es', 'fr', 'de', 'it', 'pt', 'ru', 'ja', 'zh', 'ko', 'ar'] 
  });
});

// API: i18n - Get translations for a language
app.get('/api/i18n/:language', (req, res) => {
  const { language } = req.params;
  
  // Validate language code
  const validation = validateLanguageCode(language);
  if (!validation.valid) {
    return res.status(400).json({ 
      error: { message: validation.error || 'Invalid language code' } 
    });
  }
  
  const normalizedLanguage = validation.normalizedCode || language.toLowerCase();
  
  // Basic manual translations (expand later)
  const translations = {
    en: {
      common: {
        loading: "Loading...",
        error: "Error",
        success: "Success"
      },
      main: {
        title: "Rehumanize Our World.",
        subtitle: "Warmthly is a global movement to make empathy a measurable part of our systems."
      }
    }
  };

  const langTranslations = translations[normalizedLanguage] || translations.en;
  return res.status(200).json({ 
    translations: langTranslations,
    version: '1.0.0',
    language: normalizedLanguage
  });
});

// API: i18n - Get translation chunk
app.post('/api/i18n/:language/chunk', (req, res) => {
  const { language } = req.params;
  const { keys } = req.body;
  
  // Validate language code
  const validation = validateLanguageCode(language);
  if (!validation.valid) {
    return res.status(400).json({ 
      error: { message: validation.error || 'Invalid language code' } 
    });
  }
  
  // Validate keys array
  if (keys && !Array.isArray(keys)) {
    return res.status(400).json({ 
      error: { message: 'Keys must be an array' } 
    });
  }
  
  const normalizedLanguage = validation.normalizedCode || language.toLowerCase();
  
  // Basic implementation
  return res.status(200).json({
    translations: {},
    keys: keys || [],
    total: 0,
    language: normalizedLanguage
  });
});

// API: Login (Admin Authentication)
app.post('/api/login', withRateLimit(async (req, res) => {
  const { password, totpCode, mfaStep } = req.body;
  const adminPassword = process.env.ADMIN_PASSWORD || secrets.ADMIN_PASSWORD;

  if (!adminPassword) {
    return res.status(500).json({ error: { message: 'Admin password not configured.' } });
  }

  const identifier = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 
                     req.headers['x-real-ip'] || 
                     req.connection?.remoteAddress || 
                     req.ip || 
                     'unknown';
  const mfaEnabled = await isMFAEnabled();

  // Handle TOTP verification step
  if (mfaStep === 'totp' && mfaEnabled) {
    if (!totpCode) {
      return res.status(400).json({ error: { message: 'TOTP code is required' } });
    }

    const secret = await getTOTPSecret();
    if (!secret) {
      logger.error('[login] MFA enabled but secret not found');
      return res.status(500).json({ error: { message: 'MFA configuration error' } });
    }

    if (!verifyTOTP(secret, totpCode)) {
      SecurityLogger.authenticationFailure(identifier, '/api/login');
      return res.status(401).json({ error: { message: 'Invalid TOTP code' } });
    }

    try {
      const jwtSecret = getSecret('JWT_SECRET') || process.env.JWT_SECRET;
      if (!jwtSecret) {
        logger.error('[login] JWT_SECRET not configured');
        throw new Error('JWT_SECRET not configured');
      }
      const token = jwt.sign({ user: 'admin' }, jwtSecret, { expiresIn: '8h' });
      logger.info('[login] Admin login successful with MFA');
      return res.status(200).json({ token });
    } catch (error) {
      logger.error('[login] Error generating JWT token:', {
        requestId: req.id,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      });
      return res.status(500).json({ error: { message: 'Authentication system not configured.' } });
    }
  }

  // Handle password verification step
  if (!mfaStep || mfaStep === 'password') {
    if (!constantTimeCompare(password || '', adminPassword)) {
      SecurityLogger.authenticationFailure(identifier, '/api/login');
      return res.status(401).json({ error: { message: 'Incorrect password' } });
    }

    if (!mfaEnabled) {
      try {
        const jwtSecret = getSecret('JWT_SECRET') || process.env.JWT_SECRET;
        if (!jwtSecret) {
          throw new Error('JWT_SECRET not configured');
        }
        const token = jwt.sign({ user: 'admin' }, jwtSecret, { expiresIn: '8h' });
        return res.status(200).json({ token });
      } catch (error) {
        return res.status(500).json({ error: { message: 'Authentication system not configured.' } });
      }
    }

    return res.status(200).json({
      mfaRequired: true,
      message: 'Password correct. Please provide TOTP code.',
      nextStep: 'totp',
    });
  }

  return res.status(400).json({ error: { message: 'Invalid login request' } });
}, loginRateLimitOptions));

// API: Send Email
app.post('/api/send-email', withRateLimit(async (req, res) => {
  const resendApiKey = process.env.RESEND_API_KEY || secrets.RESEND_API_KEY;
  
  if (!resendApiKey) {
    logger.error('[send-email] RESEND_API_KEY is not configured');
    return res.status(500).json({
      error: { message: 'Email service is not configured. Please contact the administrator.' },
    });
  }

  const resend = new Resend(resendApiKey);
  const { to, subject, html } = req.body;

  // Validate recipient email
  if (!to || typeof to !== 'string') {
    return res.status(400).json({ error: { message: 'Recipient email address is required.' } });
  }

  const emailRegex = /^[^\s@]+@[^\s@][^\s.@]*\.[^\s@]+$/;
  if (!emailRegex.test(to.trim())) {
    return res.status(400).json({ error: { message: 'Invalid email address format.' } });
  }

  // Validate subject
  if (!subject || typeof subject !== 'string' || !subject.trim()) {
    return res.status(400).json({ error: { message: 'Email subject is required.' } });
  }

  // Validate HTML body
  const trimmedHtml = html?.trim() || '';
  if (!trimmedHtml || trimmedHtml === '<p></p>' || trimmedHtml === '<p><br></p>') {
    return res.status(400).json({ error: { message: 'Email body cannot be empty.' } });
  }

  // Sanitize subject (limit length)
  const sanitizedSubject = subject.trim().substring(0, 200);

  try {
    const result = await resend.emails.send({
      from: 'The Warmthly Desk <desk@warmthly.org>',
      to: [to.trim()],
      subject: sanitizedSubject,
      html: html,
    });

    if (result.error) {
      logger.error('[send-email] Resend API error:', result.error);
      return res.status(400).json({
        error: {
          message: result.error.message || 'Failed to send email. Please try again.',
        },
      });
    }

    return res.status(200).json({ message: 'Email sent successfully!', data: result.data });
  } catch (error) {
    logger.error('[send-email] Unexpected error in send-email handler:', {
      requestId: req.id,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      url: req.url,
      method: req.method
    });
    return res.status(500).json({
      error: { message: 'Internal Server Error. Please try again later.' },
    });
  }
}, emailRateLimitOptions));

// API: Get Emails (requires JWT authentication)
app.get('/api/get-emails', withRateLimit(async (req, res) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: { message: 'Authentication required.' } });
  }

  const token = authHeader.split(' ')[1];
  const jwtSecret = getSecret('JWT_SECRET') || process.env.JWT_SECRET;

  if (!jwtSecret) {
    logger.error('[get-emails] JWT_SECRET is not configured', {
      requestId: req.id,
      url: req.url,
      method: req.method
    });
    return res.status(500).json({ error: { message: 'Authentication system not configured.' } });
  }

  try {
    jwt.verify(token, jwtSecret, { algorithms: ['HS256'] });
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      logger.error('[get-emails] JWT verification error:', {
        requestId: req.id,
        error: error.message,
        url: req.url,
        method: req.method
      });
      return res.status(401).json({ error: { message: 'Invalid token.' } });
    }
    if (error instanceof jwt.TokenExpiredError) {
      logger.error('[get-emails] JWT expired:', {
        requestId: req.id,
        error: error.message,
        url: req.url,
        method: req.method
      });
      return res.status(401).json({ error: { message: 'Token expired. Please log in again.' } });
    }
    throw error;
  }

  try {
    const client = await getRedisClient();

    if (!client) {
      return res.status(200).json([]);
    }

    let emails = [];
    try {
      emails = await client.lRange('emails', 0, DATA_LIMITS.MAX_EMAILS - 1);
    } catch (kvError) {
      if (kvError.message && (kvError.message.includes('WRONGTYPE') || kvError.message.includes('no such key'))) {
        // Expected case: key doesn't exist or wrong type, treat as empty list
        logger.debug('[get-emails] Redis key not found or wrong type, returning empty list:', {
          requestId: req.id,
          error: kvError.message
        });
        emails = [];
      } else {
        throw kvError;
      }
    }

    const parsedEmails = emails
      .map((email, index) => {
        try {
          return JSON.parse(email);
        } catch (e) {
          logger.error(`[get-emails] Error parsing email at index ${index}:`, e.message);
          return null;
        }
      })
      .filter(email => email !== null);

    // Return emails in reverse order (newest first)
    return res.status(200).json(parsedEmails.reverse());
  } catch (error) {
    logger.error('[get-emails] Unexpected error:', {
      requestId: req.id,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      url: req.url,
      method: req.method
    });
    return res.status(500).json({
      error: {
        message: 'Failed to fetch emails.',
        details: isDevelopment() && error instanceof Error ? error.message : undefined,
      },
    });
  }
}, apiRateLimitOptions));

// API: Airtable Proxy
app.get('/api/airtable', withRateLimit(async (req, res) => {
  const airtableApiKey = process.env.AIRTABLE_API_KEY || secrets.AIRTABLE_API_KEY;
  
  if (!airtableApiKey) {
    logger.error('[airtable] AIRTABLE_API_KEY is not configured');
    return res.status(500).json({
      error: {
        message: 'Airtable API is not configured on the server.',
        code: 'NOT_CONFIGURED',
      },
    });
  }

  const { baseId, tableName, viewId, page } = req.query;

  if (!baseId || !tableName) {
    return res.status(400).json({
      error: { message: 'baseId and tableName are required query parameters.' },
    });
  }

  // Generate cache key
  const cacheKey = `airtable:${baseId}:${tableName}:${viewId || 'default'}:${page || '1'}`;

  // Try to get from cache
  try {
    const client = await getRedisClient();
    if (client) {
      const cached = await client.get(cacheKey);
      if (cached) {
        res.setHeader('X-Cache', 'HIT');
        return res.status(200).json(JSON.parse(cached));
      }
    }
  } catch (cacheError) {
    logger.error('[airtable] Cache read error:', {
      requestId: req.id,
      error: cacheError.message,
      url: req.url,
      method: req.method
    });
  }

  // Build Airtable API URL
  let url = `https://api.airtable.com/v0/${encodeURIComponent(baseId)}/${encodeURIComponent(tableName)}`;
  const params = new URLSearchParams();

  if (viewId) {
    params.append('view', viewId);
  }

    params.append('maxRecords', String(DATA_LIMITS.MAX_AIRTABLE_RECORDS));

  if (page) {
    params.append('pageSize', '100');
  }

  if (params.toString()) {
    url += `?${params.toString()}`;
  }

  // Fetch from Airtable with timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, API_TIMEOUT.AIRTABLE_MS);

  let response;
  try {
    response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${airtableApiKey}`,
        'Content-Type': 'application/json',
      },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
  } catch (fetchError) {
    clearTimeout(timeoutId);
    if (fetchError.name === 'AbortError') {
      logger.error('[airtable] Request timeout', {
        requestId: req.id,
        url: req.url,
        method: req.method
      });
      return res.status(504).json({
        error: {
          message: 'Request to Airtable API timed out. Please try again.',
          code: 'TIMEOUT',
        },
      });
    }
    throw fetchError;
  }

  if (!response.ok) {
    let errorData = {};
    try {
      errorData = await response.json();
    } catch (parseError) {
      // Log JSON parse errors for debugging
      logger.warn('[airtable] Failed to parse error response:', {
        requestId: req.id,
        error: parseError.message,
        url: req.url,
        method: req.method
      });
    }

    logger.error('[airtable] Airtable API error:', {
      requestId: req.id,
      status: response.status,
      statusText: response.statusText,
      error: errorData,
      url: req.url,
      method: req.method
    });

    return res.status(response.status).json({
      error: {
        message: errorData.error?.message || `Airtable API error: ${response.status} ${response.statusText}`,
        code: errorData.error?.type || 'AIRTABLE_API_ERROR',
      },
    });
  }

  // Parse response
  const data = await response.json();

  // Cache the response
  try {
    const client = await getRedisClient();
    if (client) {
      await client.setEx(cacheKey, CACHE_CONFIG.TTL_SECONDS, JSON.stringify(data));
    }
  } catch (cacheError) {
    logger.error('[airtable] Cache write error:', {
      requestId: req.id,
      error: cacheError.message,
      url: req.url,
      method: req.method
    });
  }

  // Return response
  res.setHeader('X-Cache', 'MISS');
  return res.status(200).json(data);
}, apiRateLimitOptions));

// API: Oracle Database - Donations/Coins
const oracleDb = require('./utils/oracle-db');

// Initialize Oracle DB pool on startup
if (oracleDb.isConfigured()) {
  oracleDb.initializePool().catch(err => {
    logger.error('[oracle-db] Failed to initialize pool on startup:', err.message);
  });
}

app.get('/api/donations', withRateLimit(async (req, res) => {
  if (!oracleDb.isConfigured()) {
    return res.status(500).json({
      error: {
        message: 'Oracle database is not configured on the server.',
        code: 'NOT_CONFIGURED',
      },
    });
  }

  try {
    const { limit, offset, category } = req.query;
    
    const options = {
      limit: limit ? parseInt(limit, 10) : 1000,
      offset: offset ? parseInt(offset, 10) : 0,
      category: category || undefined,
    };

    // Validate limits
    if (options.limit > 1000) {
      options.limit = 1000;
    }
    if (options.limit < 1) {
      options.limit = 100;
    }
    if (options.offset < 0) {
      options.offset = 0;
    }

    const donations = await oracleDb.getDonations(options);

    // Format response to match Airtable format for compatibility
    const records = donations.map(donation => ({
      id: donation.transactionId,
      fields: {
        Amount: donation.amount,
        Currency: donation.currency,
        Donor: donation.donor,
        Purpose: donation.purpose,
        Category: donation.category,
        Date: donation.date,
        'Transaction ID': donation.transactionId,
      },
      createdTime: donation.createdAt || donation.date,
    }));

    return res.status(200).json({
      records: records,
      offset: options.offset,
    });
  } catch (error) {
    logger.error('[donations] Error fetching donations:', {
      requestId: req.id,
      error: error.message,
      url: req.url,
      method: req.method,
    });

    return res.status(500).json({
      error: {
        message: 'Failed to fetch donations from database.',
        code: 'DATABASE_ERROR',
      },
    });
  }
}, apiRateLimitOptions));

app.post('/api/donations', withRateLimit(async (req, res) => {
  if (!oracleDb.isConfigured()) {
    return res.status(500).json({
      error: {
        message: 'Oracle database is not configured on the server.',
        code: 'NOT_CONFIGURED',
      },
    });
  }

  try {
    const { transactionId, amount, currency, donor, purpose, category, date } = req.body;

    if (!transactionId || !amount) {
      return res.status(400).json({
        error: {
          message: 'transactionId and amount are required.',
          code: 'VALIDATION_ERROR',
        },
      });
    }

    const donation = await oracleDb.createDonation({
      transactionId,
      amount: parseFloat(amount),
      currency: currency || 'ZAR',
      donor: donor || 'Anonymous',
      purpose: purpose || 'N/A',
      category: category || 'General',
      donationDate: date ? new Date(date) : new Date(),
    });

    return res.status(201).json({
      id: donation.transactionId,
      fields: {
        Amount: donation.amount,
        Currency: donation.currency,
        Donor: donation.donor,
        Purpose: donation.purpose,
        Category: donation.category,
        Date: donation.date,
        'Transaction ID': donation.transactionId,
      },
      createdTime: donation.createdAt || donation.date,
    });
  } catch (error) {
    logger.error('[donations] Error creating donation:', {
      requestId: req.id,
      error: error.message,
      url: req.url,
      method: req.method,
    });

    if (error.message.includes('already exists')) {
      return res.status(409).json({
        error: {
          message: 'Donation with this transaction ID already exists.',
          code: 'DUPLICATE',
        },
      });
    }

    return res.status(500).json({
      error: {
        message: 'Failed to create donation in database.',
        code: 'DATABASE_ERROR',
      },
    });
  }
}, apiRateLimitOptions));

// API: Reports Submission
app.post('/api/reports', withRateLimit(async (req, res) => {
  const { name, email, type, message } = req.body;
  const VALID_REPORT_TYPES = ['media', 'concern', 'admin', 'other'];
  const MAX_MESSAGE_LENGTH = 5000;
  const MAX_NAME_LENGTH = 200;

  // Validate name
  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: { message: 'Name is required.' } });
  }

  const sanitizedName = name.trim().substring(0, MAX_NAME_LENGTH);
  if (sanitizedName.length === 0) {
    return res.status(400).json({ error: { message: 'Name cannot be empty.' } });
  }

  // Validate email
  if (!email || typeof email !== 'string') {
    return res.status(400).json({ error: { message: 'Email address is required.' } });
  }

  const emailRegex = /^[^\s@]+@[^\s@][^\s.@]*\.[^\s@]+$/;
  if (!emailRegex.test(email.trim())) {
    return res.status(400).json({ error: { message: 'Invalid email address format.' } });
  }

  // Validate report type
  if (!type || typeof type !== 'string' || !VALID_REPORT_TYPES.includes(type)) {
    return res.status(400).json({
      error: { message: `Invalid report type. Must be one of: ${VALID_REPORT_TYPES.join(', ')}.` },
    });
  }

  // Validate message
  if (!message || typeof message !== 'string' || !message.trim()) {
    return res.status(400).json({ error: { message: 'Message is required.' } });
  }

  const sanitizedMessage = message.trim().substring(0, MAX_MESSAGE_LENGTH);
  if (sanitizedMessage.length === 0) {
    return res.status(400).json({ error: { message: 'Message cannot be empty.' } });
  }

  // Get client identifier for logging
  const identifier = req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
                     req.headers['x-real-ip'] ||
                     req.connection?.remoteAddress ||
                     req.ip ||
                     'unknown';

  // Log report submission
  logger.log('[reports] Report submitted', {
    identifier,
    type,
    email: email.trim(),
    nameLength: sanitizedName.length,
    messageLength: sanitizedMessage.length,
  });

  // Store report in Redis for tracking (optional, non-blocking)
  try {
    const client = await getRedisClient();
    if (client) {
      const reportData = {
        name: sanitizedName,
        email: email.trim(),
        type,
        message: sanitizedMessage,
        timestamp: new Date().toISOString(),
        identifier,
      };
      await client.lPush('reports', JSON.stringify(reportData));
      // Keep only last N reports
      await client.lTrim('reports', 0, DATA_LIMITS.MAX_REPORTS - 1);
    }
  } catch (redisError) {
    logger.warn('[reports] Failed to store report in Redis:', {
      requestId: req.id,
      error: redisError instanceof Error ? redisError.message : String(redisError),
      url: req.url,
      method: req.method
    });
  }

  // Send email notification if Resend is configured
  const adminEmail = process.env.ADMIN_EMAIL || 'desk@warmthly.org';
  const resendApiKey = process.env.RESEND_API_KEY || secrets.RESEND_API_KEY;
  
  if (resendApiKey) {
    try {
      const resend = new Resend(resendApiKey);
      const reportTypeLabels = {
        media: 'Media Inquiry',
        concern: 'Concern or Complaint',
        admin: 'Administrative Issue',
        other: 'Other',
      };
      const reportTypeLabel = reportTypeLabels[type] || type;
      const emailSubject = `[Warmthly Report] ${reportTypeLabel} from ${sanitizedName}`;
      const emailHtml = `
        <h2>New Report Submitted</h2>
        <p><strong>Type:</strong> ${reportTypeLabel}</p>
        <p><strong>From:</strong> ${sanitizedName} (${email.trim()})</p>
        <p><strong>Submitted:</strong> ${new Date().toLocaleString()}</p>
        <hr>
        <h3>Message:</h3>
        <p style="white-space: pre-wrap;">${sanitizedMessage.replace(/\n/g, '<br>')}</p>
        <hr>
        <p><small>Report ID: ${identifier} - ${new Date().toISOString()}</small></p>
      `;

      const result = await resend.emails.send({
        from: 'The Warmthly Desk <desk@warmthly.org>',
        to: [adminEmail],
        subject: emailSubject,
        html: emailHtml,
        replyTo: email.trim(),
      });

      if (result.error) {
        logger.error('[reports] Failed to send email notification:', result.error);
      } else {
        logger.log('[reports] Email notification sent successfully');
      }
    } catch (emailError) {
      logger.error('[reports] Error sending email notification:', {
        requestId: req.id,
        error: emailError instanceof Error ? emailError.message : String(emailError),
        stack: emailError instanceof Error ? emailError.stack : undefined,
        url: req.url,
        method: req.method
      });
    }
  } else {
    logger.warn('[reports] RESEND_API_KEY not configured - email notification skipped');
  }

  return res.status(200).json({
    message: 'Report submitted successfully. We will review it promptly.',
  });
}, apiRateLimitOptions));

// API: Convert Currency
app.get('/api/convert-currency', withRateLimit(async (req, res) => {
  const ALLOWED_CURRENCIES = [
    'USD', 'EUR', 'GBP', 'JPY', 'AUD', 'CAD', 'CHF', 'CNY', 'SEK', 'NZD',
    'MXN', 'SGD', 'HKD', 'NOK', 'TRY', 'RUB', 'INR', 'BRL', 'ZAR', 'DKK',
    'PLN', 'TWD', 'THB', 'MYR', 'IDR', 'CZK', 'HUF', 'ILS', 'CLP', 'PHP',
    'AED', 'SAR', 'BGN', 'RON', 'HRK', 'ISK', 'KRW', 'VND', 'PKR', 'BDT',
  ];

  try {
    const { amount, from = 'USD', to = 'ZAR' } = req.query;

    // Validate currency codes against whitelist (security)
    if (!ALLOWED_CURRENCIES.includes(from)) {
      return res.status(400).json({ error: { message: `Invalid source currency: ${from}` } });
    }
    if (!ALLOWED_CURRENCIES.includes(to)) {
      return res.status(400).json({ error: { message: `Invalid target currency: ${to}` } });
    }

    // Validate amount type and range
    if (!amount || isNaN(Number(amount))) {
      return res.status(400).json({ error: { message: 'Amount must be a valid number' } });
    }

    const amountNum = parseFloat(amount);
    if (amountNum <= 0 || amountNum > AMOUNT_LIMITS.MAX_CONVERSION) {
      return res.status(400).json({ 
        error: { message: `Amount must be between 0 and ${AMOUNT_LIMITS.MAX_CONVERSION}` } 
      });
    }

    // Same currency - no conversion needed
    if (from === to) {
      return res.status(200).json({
        originalAmount: amountNum,
        convertedAmount: amountNum,
        from,
        to,
        rate: 1,
        formattedOriginal: from === 'JPY' ? amountNum.toFixed(0) : (amountNum / 100).toFixed(2),
        formattedConverted: from === 'JPY' ? amountNum.toFixed(0) : (amountNum / 100).toFixed(2),
      });
    }

    // Build API URL
    const apiKey = process.env.EXCHANGE_RATE_API_KEY || secrets.EXCHANGE_RATE_API_KEY || 'free';
    const apiUrl =
      apiKey === 'free'
        ? `https://api.exchangerate-api.com/v4/latest/${encodeURIComponent(from)}`
        : `https://v6.exchangerate-api.com/v6/${apiKey}/latest/${encodeURIComponent(from)}`;

    // Fetch with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, API_TIMEOUT.EXCHANGE_RATE_MS);

    let response;
    try {
      response = await fetch(apiUrl, {
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
    } catch (fetchError) {
      clearTimeout(timeoutId);
      if (fetchError.name === 'AbortError') {
        logger.error('[convert-currency] Request timeout', {
          requestId: req.id,
          url: req.url,
          method: req.method
        });
        return res.status(504).json({
          error: { message: 'Exchange rate API request timed out. Please try again.' }
        });
      }
      throw fetchError;
    }

    if (!response.ok) {
      throw new Error(`Exchange rate API returned ${response.status}`);
    }

    // Parse response
    const data = await response.json();

    // Validate response structure (security)
    if (!data.rates || typeof data.rates !== 'object') {
      throw new Error('Invalid response from exchange rate API');
    }

    // Get conversion rate (safe - validated currency code)
    const rate = data.rates[to];
    if (!rate || typeof rate !== 'number') {
      throw new Error(`Conversion rate not found for ${to}`);
    }

    // Perform conversion
    let amountInZARCents;

    // Special handling for JPY (no decimal places)
    if (from === 'JPY') {
      amountInZARCents = Math.round(originalAmount * rate * 100);
    } else {
      amountInZARCents = Math.round(originalAmount * rate);
    }

    // Format amounts
    const formattedOriginal =
      from === 'JPY' ? originalAmount.toFixed(0) : (originalAmount / 100).toFixed(2);

    return res.status(200).json({
      originalAmount: amountNum,
      convertedAmount: amountInZARCents,
      from,
      to,
      rate,
      formattedOriginal,
      formattedConverted: (amountInZARCents / 100).toFixed(2),
    });
  } catch (error) {
    logger.error('[convert-currency] Error converting currency:', {
      requestId: req.id,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      url: req.url,
      method: req.method
    });
    return res.status(500).json({
      error: { message: 'Failed to convert currency' }
    });
  }
}, apiRateLimitOptions));

// API: Get Yoco Public Key
app.get('/api/get-yoco-public-key', (req, res) => {
  const publicKey = process.env.YOCO_PUBLIC_KEY || secrets.YOCO_PUBLIC_KEY;

  if (!publicKey || typeof publicKey !== 'string') {
    logger.error('[get-yoco-public-key] Yoco public key not configured');
    return res.status(500).json({ error: { message: 'Yoco public key not configured' } });
  }

  // Return public key (safe to expose to clients)
  return res.status(200).json({ publicKey });
});

// API: Verify Payment Success (server-side verification)
app.get('/api/verify-payment', withRateLimit(async (req, res) => {
  const { id: paymentId, amount } = req.query;

  if (!paymentId || !amount) {
    return res.status(400).json({
      error: { message: 'Payment ID and amount are required' },
      verified: false
    });
  }

  try {
    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      return res.status(400).json({
        error: { message: 'Invalid amount' },
        verified: false
      });
    }

    // SECURITY: Verify payment with Yoco API
    // In production, this should query Yoco's API to verify the payment
    // For now, we'll store successful payments in Redis and verify against that
    const client = await getRedisClient();
    if (client) {
      const paymentKey = `payment:${paymentId}`;
      const storedPayment = await client.get(paymentKey);
      
      if (storedPayment) {
        const paymentData = JSON.parse(storedPayment);
        // Verify amount matches
        if (Math.abs(paymentData.amount - amountNum) < 0.01) {
          return res.status(200).json({ verified: true, paymentId });
        }
      }
    }

    // Payment not found or amount mismatch
    logger.warn('[verify-payment] Payment verification failed:', {
      requestId: req.id,
      paymentId,
      amount: amountNum,
      ip: req.ip || req.headers['x-forwarded-for'] || 'unknown'
    });

    return res.status(200).json({ verified: false });
  } catch (error) {
    logger.error('[verify-payment] Error verifying payment:', {
      requestId: req.id,
      error: error instanceof Error ? error.message : String(error),
      paymentId,
      amount
    });
    return res.status(500).json({
      error: { message: 'Failed to verify payment' },
      verified: false
    });
  }
}, apiRateLimitOptions));

// API: Audit Payment Events (comprehensive audit trail)
app.post('/api/audit-payment', withRateLimit(async (req, res) => {
  try {
    const auditEvent = req.body;

    // Validate required fields
    if (!auditEvent.eventType || !auditEvent.timestamp) {
      return res.status(400).json({
        error: { message: 'eventType and timestamp are required' }
      });
    }

    // Store audit event in Redis (non-blocking)
    const client = await getRedisClient();
    if (client) {
      const auditKey = `audit:payment:${auditEvent.sessionId || 'unknown'}:${Date.now()}`;
      await client.setEx(auditKey, 86400 * 90, JSON.stringify(auditEvent)); // Store for 90 days
      
      // Also add to a list for easy querying
      await client.lPush('audit:payment:events', JSON.stringify(auditEvent));
      await client.lTrim('audit:payment:events', 0, 10000); // Keep last 10k events
    }

    // Log to security monitor
    SecurityLogger.logSecurityEvent({
      type: 'payment_audit',
      severity: 'info',
      message: `Payment audit event: ${auditEvent.eventType}`,
      metadata: {
        eventType: auditEvent.eventType,
        amount: auditEvent.amount,
        currency: auditEvent.currency,
        sessionId: auditEvent.sessionId
      }
    });

    // Return success (non-blocking, don't wait for storage)
    return res.status(200).json({ success: true });
  } catch (error) {
    // Audit logging should never fail the request
    logger.error('[audit-payment] Error logging audit event:', {
      requestId: req.id,
      error: error instanceof Error ? error.message : String(error)
    });
    // Still return success to not block user experience
    return res.status(200).json({ success: true });
  }
}, apiRateLimitOptions));

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: { message: 'Not Found' } });
});

// Error handler
app.use((err, req, res, next) => {
  logger.error('[server] Unhandled error:', {
    requestId: req.id || 'unknown',
    error: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    ip: req.ip || req.headers['x-forwarded-for'] || 'unknown',
    headers: {
      'user-agent': req.headers['user-agent'],
      'content-type': req.headers['content-type']
    }
  });
  
  // Standardized error response format
  res.status(500).json({ error: { message: 'Internal Server Error' } });
});

// Initialize server
// Note: Greenlock SSL is optional - only use if SSL termination is not handled by OCI Load Balancer
// For OCI Container Instances, SSL is typically handled at the load balancer level
const useGreenlock = process.env.USE_GREENLOCK === 'true';
const port = process.env.PORT || 80;

if (useGreenlock) {
  // Initialize Greenlock for Let's Encrypt SSL
  // This handles both HTTP (port 80) and HTTPS (port 443) automatically
  logger.log('[server] Initializing Greenlock SSL (Let\'s Encrypt)');
  
  if (!process.env.LE_EMAIL) {
    logger.error('[server] LE_EMAIL is required when USE_GREENLOCK=true');
    process.exit(1);
  }

  require('greenlock-express')
    .init({
      packageRoot: __dirname,
      configDir: './greenlock.d',
      
      // Contact for security and renewal notices
      maintainerEmail: process.env.LE_EMAIL,
      
      // Use staging for testing, production when ready
      // Set LE_STAGING=true for testing, false for production
      staging: process.env.LE_STAGING === 'true' || false,
      
      cluster: false
    })
    .serve(app);
  
  logger.log('[server] Greenlock SSL enabled - handling ports 80 and 443');
} else {
  // Standard Express server (SSL handled by load balancer)
  app.listen(port, () => {
    logger.log(`[server] Warmthly API server running on port ${port}`);
    logger.log('[server] SSL should be handled by OCI Load Balancer or reverse proxy');
  });
}

// Export app for testing
if (require.main !== module || process.env.NODE_ENV === 'test') {
  module.exports = { app };
}

