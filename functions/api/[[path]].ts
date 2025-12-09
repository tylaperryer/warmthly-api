interface Env {
  YOCO_SECRET_KEY: string;
  // Rate limiting using Cloudflare KV (optional)
  RATE_LIMIT_KV?: KVNamespace;
}

/**
 * Rate limiting configuration
 * Phase 3 Issue 3.6: Missing Rate Limiting in Cloudflare Functions
 */
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const RATE_LIMIT_MAX = 100; // 100 requests per window
const RATE_LIMIT_KEY_PREFIX = 'ratelimit:';

/**
 * Get client identifier from request
 */
function getClientIdentifier(request: Request): string {
  // Try to get IP from Cloudflare headers
  const cfConnectingIp = request.headers.get('CF-Connecting-IP');
  if (cfConnectingIp) {
    return cfConnectingIp;
  }

  // Fallback to X-Forwarded-For
  const forwardedFor = request.headers.get('X-Forwarded-For');
  if (forwardedFor) {
    return forwardedFor.split(',')[0]?.trim() || 'unknown';
  }

  return 'unknown';
}

/**
 * Check rate limit using Cloudflare KV
 * Falls back to in-memory if KV is not available
 */
async function checkRateLimit(
  identifier: string,
  path: string,
  env: Env
): Promise<{ allowed: boolean; remaining: number; resetTime: number }> {
  const key = `${RATE_LIMIT_KEY_PREFIX}${identifier}:${path}`;
  const now = Date.now();
  const resetTime = now + RATE_LIMIT_WINDOW_MS;

  // Try to use KV if available
  if (env.RATE_LIMIT_KV) {
    try {
      const stored = await env.RATE_LIMIT_KV.get(key, { type: 'json' });
      const data = stored as { count: number; resetTime: number } | null;

      if (!data || now > data.resetTime) {
        // New window or expired
        await env.RATE_LIMIT_KV.put(key, JSON.stringify({ count: 1, resetTime }), {
          expirationTtl: Math.ceil(RATE_LIMIT_WINDOW_MS / 1000),
        });
        return { allowed: true, remaining: RATE_LIMIT_MAX - 1, resetTime };
      }

      if (data.count >= RATE_LIMIT_MAX) {
        // Rate limit exceeded
        return { allowed: false, remaining: 0, resetTime: data.resetTime };
      }

      // Increment count
      const newCount = data.count + 1;
      await env.RATE_LIMIT_KV.put(key, JSON.stringify({ count: newCount, resetTime: data.resetTime }), {
        expirationTtl: Math.ceil((data.resetTime - now) / 1000),
      });
      return { allowed: true, remaining: RATE_LIMIT_MAX - newCount, resetTime: data.resetTime };
    } catch (error) {
      // KV error - fall through to in-memory fallback
      // Note: Using console.error in Cloudflare Functions as logger utility not available
      console.error('[rate-limit] KV error:', error);
    }
  }

  // In-memory fallback (per-worker, not distributed)
  // In production, KV should be configured for proper distributed rate limiting
  const memoryStore = (globalThis as { rateLimitStore?: Map<string, { count: number; resetTime: number }> })
    .rateLimitStore ?? new Map();

  if (!(globalThis as { rateLimitStore?: Map<string, { count: number; resetTime: number }> }).rateLimitStore) {
    (globalThis as { rateLimitStore?: Map<string, { count: number; resetTime: number }> }).rateLimitStore =
      memoryStore;
  }

  const memoryEntry = memoryStore.get(key);

  if (!memoryEntry || now > memoryEntry.resetTime) {
    // New window
    memoryStore.set(key, { count: 1, resetTime });
    return { allowed: true, remaining: RATE_LIMIT_MAX - 1, resetTime };
  }

  if (memoryEntry.count >= RATE_LIMIT_MAX) {
    // Rate limit exceeded
    return { allowed: false, remaining: 0, resetTime: memoryEntry.resetTime };
  }

  // Increment count
  memoryEntry.count++;
  return { allowed: true, remaining: RATE_LIMIT_MAX - memoryEntry.count, resetTime: memoryEntry.resetTime };
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env } = context;

  // Allow requests from all Warmthly sites
  const allowedOrigins = [
    'https://www.warmthly.org',
    'https://mint.warmthly.org',
    'https://post.warmthly.org',
    'https://admin.warmthly.org',
  ];
  
  // SECURITY: Use exact origin matching to prevent subdomain attacks
  // Previous implementation used .includes() which could be bypassed
  const origin = request.headers.get('Origin') || '';
  const isAllowedOrigin = allowedOrigins.includes(origin);

  const corsHeaders = {
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Origin': isAllowedOrigin ? origin : allowedOrigins[0],
  };

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (request.method !== 'POST') {
    return new Response('Not Found', { status: 404 });
  }

  if (!isAllowedOrigin) {
    return new Response('Forbidden: Invalid origin', { status: 403 });
  }

  // Phase 3 Issue 3.6: Add rate limiting
  const identifier = getClientIdentifier(request);
  const url = new URL(request.url);
  const rateLimitResult = await checkRateLimit(identifier, url.pathname, env);

  // Set rate limit headers
  const headers = {
    ...corsHeaders,
    'X-RateLimit-Limit': RATE_LIMIT_MAX.toString(),
    'X-RateLimit-Remaining': rateLimitResult.remaining.toString(),
    'X-RateLimit-Reset': new Date(rateLimitResult.resetTime).toISOString(),
  };

  if (!rateLimitResult.allowed) {
    return new Response(
      JSON.stringify({ error: { message: 'Too many requests, please try again later.' } }),
      {
        status: 429,
        headers: {
          ...headers,
          'Content-Type': 'application/json',
          'Retry-After': Math.ceil((rateLimitResult.resetTime - Date.now()) / 1000).toString(),
        },
      }
    );
  }
  try {
    const body = await request.json<{ amount?: number; currency?: string }>();
    const { amount, currency } = body;

    // SECURITY: Comprehensive input validation matching TypeScript API
    // Validate amount exists and is a number
    if (typeof amount !== 'number' || isNaN(amount)) {
      return new Response('Invalid request: Amount must be a number', { status: 400, headers: corsHeaders });
    }

    // Validate amount is positive and within valid range
    const MIN_AMOUNT = 100; // R1.00 in cents
    const MAX_AMOUNT = 100000000; // R1,000,000.00 in cents
    if (amount < MIN_AMOUNT || amount > MAX_AMOUNT) {
      return new Response(`Invalid request: Amount must be between R1 and R1,000,000`, { status: 400, headers: corsHeaders });
    }

    // Validate currency exists and is a string
    if (typeof currency !== 'string' || !currency) {
      return new Response('Invalid request: Currency is required', { status: 400, headers: corsHeaders });
    }

    // Validate currency is in allowed list
    const ALLOWED_CURRENCIES = ['USD', 'EUR', 'GBP', 'JPY', 'AUD', 'CAD', 'CHF', 'CNY', 'SEK', 'NZD', 'MXN', 'SGD', 'HKD', 'NOK', 'TRY', 'RUB', 'INR', 'BRL', 'ZAR', 'DKK', 'PLN', 'TWD', 'THB', 'MYR', 'IDR', 'CZK', 'HUF', 'ILS', 'CLP', 'PHP', 'AED', 'SAR', 'BGN', 'RON', 'HRK', 'ISK', 'KRW', 'VND', 'PKR', 'BDT'];
    const normalizedCurrency = currency.toUpperCase().trim();
    if (!ALLOWED_CURRENCIES.includes(normalizedCurrency)) {
      return new Response('Invalid request: Currency not supported', { status: 400, headers: corsHeaders });
    }

    // Securely talk to Yoco's API
    const yocoResponse = await fetch('https://online.yoco.com/v1/checkout/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${env.YOCO_SECRET_KEY}`
      },
      body: JSON.stringify({
        amount: amount,
        currency: currency,
        success_url: 'https://www.warmthly.org/payment-success',
        cancel_url: 'https://www.warmthly.org/payment-cancelled'
      } ),
    });

    if (!yocoResponse.ok) {
      // SECURITY: Don't leak Yoco API error details to client
      // Log detailed error server-side only
      // Note: Using console.error in Cloudflare Functions as logger utility not available
      const errorBody = await yocoResponse.text();
      console.error('[create-checkout] Yoco API error:', {
        status: yocoResponse.status,
        statusText: yocoResponse.statusText,
        body: errorBody,
      });
      // Return generic error message to client
      return new Response('Payment processing failed. Please try again or contact support.', { 
        status: 500, 
        headers: { ...headers, 'Content-Type': 'text/plain' }
      });
    }

    const yocoData = await yocoResponse.json();
    const responseData = JSON.stringify({ id: yocoData.id });

    return new Response(responseData, {
      status: 200,
      headers: { ...headers, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    // Note: Using console.error in Cloudflare Functions as logger utility not available
    console.error('[create-checkout] Error creating checkout:', error);
    return new Response('Internal Server Error', { 
      status: 500, 
      headers: { ...headers, 'Content-Type': 'text/plain' }
    });
  }
};
