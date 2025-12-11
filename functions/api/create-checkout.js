const allowedOrigins = [
  'https://www.warmthly.org',
  'https://mint.warmthly.org',
  'https://post.warmthly.org',
  'https://admin.warmthly.org',
];

const ALLOWED_CURRENCIES = ['ZAR', 'USD', 'EUR', 'GBP'];
const MIN_AMOUNT = 100; // R1.00 in cents
const MAX_AMOUNT = 100000000; // R1,000,000.00 in cents

export async function onRequest(context) {
  const { request, env } = context;

  const origin = request.headers.get('Origin') || '';
  const isAllowedOrigin = allowedOrigins.includes(origin);

  const corsHeaders = {
    'Access-Control-Allow-Origin': isAllowedOrigin ? origin : allowedOrigins[0],
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405, headers: corsHeaders });
  }

  if (!isAllowedOrigin) {
    return new Response('Forbidden: Invalid origin', { status: 403 });
  }

  try {
    const body = await request.json();
    const { amount, currency } = body;

    // Validate required fields
    if (amount === undefined || amount === null) {
      return new Response(
        JSON.stringify({ error: { message: 'Amount is required' } }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!currency || typeof currency !== 'string') {
      return new Response(
        JSON.stringify({ error: { message: 'Currency is required' } }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate currency against whitelist
    const normalizedCurrency = currency.toUpperCase();
    if (!ALLOWED_CURRENCIES.includes(normalizedCurrency)) {
      return new Response(
        JSON.stringify({ error: { message: `Invalid currency. Allowed currencies: ${ALLOWED_CURRENCIES.join(', ')}` } }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate amount type and range
    const amountNum = typeof amount === 'number' ? amount : parseFloat(String(amount));
    if (isNaN(amountNum) || !isFinite(amountNum)) {
      return new Response(
        JSON.stringify({ error: { message: 'Amount must be a valid number' } }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Amount must be in cents (integer)
    const amountCents = Math.round(amountNum);
    if (amountCents < MIN_AMOUNT || amountCents > MAX_AMOUNT) {
      return new Response(
        JSON.stringify({ error: { message: `Amount must be between ${MIN_AMOUNT} and ${MAX_AMOUNT} cents` } }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!env.YOCO_SECRET_KEY) {
      console.error('[create-checkout] YOCO_SECRET_KEY not configured');
      return new Response(
        JSON.stringify({ error: { message: 'Payment service not configured' } }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const yocoResponse = await fetch('https://online.yoco.com/v1/checkout/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${env.YOCO_SECRET_KEY}`
      },
      body: JSON.stringify({
        amount: amountCents,
        currency: normalizedCurrency,
        success_url: 'https://www.warmthly.org/payment-success',
        cancel_url: 'https://www.warmthly.org/payment-cancelled'
      })
    });

    if (!yocoResponse.ok) {
      const errorText = await yocoResponse.text();
      console.error('[create-checkout] Yoco API error:', {
        status: yocoResponse.status,
        error: errorText
      });
      return new Response(
        JSON.stringify({ error: { message: 'Failed to create checkout. Please try again.' } }),
        { status: yocoResponse.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await yocoResponse.json();
    
    return new Response(
      JSON.stringify({ id: data.id }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[create-checkout] Unexpected error:', error);
    return new Response(
      JSON.stringify({ error: { message: 'Internal Server Error' } }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}

