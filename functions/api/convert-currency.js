const allowedOrigins = [
  'https://www.warmthly.org',
  'https://mint.warmthly.org',
  'https://post.warmthly.org',
  'https://admin.warmthly.org',
];

const ALLOWED_CURRENCIES = [
  'USD', 'EUR', 'GBP', 'JPY', 'AUD', 'CAD', 'CHF', 'CNY', 'SEK', 'NZD',
  'MXN', 'SGD', 'HKD', 'NOK', 'TRY', 'RUB', 'INR', 'BRL', 'ZAR', 'DKK',
  'PLN', 'TWD', 'THB', 'MYR', 'IDR', 'CZK', 'HUF', 'ILS', 'CLP', 'PHP',
  'AED', 'SAR', 'BGN', 'RON', 'HRK', 'ISK', 'KRW', 'VND', 'PKR', 'BDT',
];

const API_TIMEOUT = 10000;
const MAX_CONVERSION = 100000000;

export async function onRequest(context) {
  const { request, env } = context;

  const origin = request.headers.get('Origin') || '';
  const isAllowedOrigin = allowedOrigins.includes(origin);

  const corsHeaders = {
    'Access-Control-Allow-Origin': isAllowedOrigin ? origin : allowedOrigins[0],
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (request.method !== 'GET') {
    return new Response('Method Not Allowed', { status: 405, headers: corsHeaders });
  }

  try {
    const url = new URL(request.url);
    const { amount, from = 'USD', to = 'ZAR' } = Object.fromEntries(url.searchParams);

    // Validate currency codes against whitelist
    if (!ALLOWED_CURRENCIES.includes(from.toUpperCase())) {
      return new Response(
        JSON.stringify({ error: { message: `Invalid source currency: ${from}` } }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    if (!ALLOWED_CURRENCIES.includes(to.toUpperCase())) {
      return new Response(
        JSON.stringify({ error: { message: `Invalid target currency: ${to}` } }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate amount type and range
    if (!amount || isNaN(Number(amount))) {
      return new Response(
        JSON.stringify({ error: { message: 'Amount must be a valid number' } }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const amountNum = parseFloat(amount);
    if (amountNum <= 0 || amountNum > MAX_CONVERSION) {
      return new Response(
        JSON.stringify({ error: { message: `Amount must be between 0 and ${MAX_CONVERSION}` } }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Same currency - no conversion needed
    if (from.toUpperCase() === to.toUpperCase()) {
      return new Response(
        JSON.stringify({
          originalAmount: amountNum,
          convertedAmount: amountNum,
          from: from.toUpperCase(),
          to: to.toUpperCase(),
          rate: 1,
          formattedOriginal: from.toUpperCase() === 'JPY' ? amountNum.toFixed(0) : (amountNum / 100).toFixed(2),
          formattedConverted: from.toUpperCase() === 'JPY' ? amountNum.toFixed(0) : (amountNum / 100).toFixed(2),
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Build API URL
    const apiKey = env.EXCHANGE_RATE_API_KEY || 'free';
    const apiUrl = apiKey === 'free'
      ? `https://api.exchangerate-api.com/v4/latest/${encodeURIComponent(from.toUpperCase())}`
      : `https://v6.exchangerate-api.com/v6/${apiKey}/latest/${encodeURIComponent(from.toUpperCase())}`;

    // Fetch with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT);

    let response;
    try {
      response = await fetch(apiUrl, {
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
    } catch (fetchError) {
      clearTimeout(timeoutId);
      if (fetchError.name === 'AbortError') {
        console.error('[convert-currency] Request timeout');
        return new Response(
          JSON.stringify({ error: { message: 'Exchange rate API request timed out. Please try again.' } }),
          { status: 504, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      throw fetchError;
    }

    if (!response.ok) {
      throw new Error(`Exchange rate API returned ${response.status}`);
    }

    // Parse response
    const data = await response.json();

    // Validate response structure
    if (!data.rates || typeof data.rates !== 'object') {
      throw new Error('Invalid response from exchange rate API');
    }

    // Get conversion rate
    const rate = data.rates[to.toUpperCase()];
    if (!rate || typeof rate !== 'number') {
      throw new Error(`Conversion rate not found for ${to}`);
    }

    // Perform conversion
    let amountInZARCents;
    const originalAmount = amountNum;

    // Special handling for JPY (no decimal places)
    if (from.toUpperCase() === 'JPY') {
      amountInZARCents = Math.round(originalAmount * rate * 100);
    } else {
      amountInZARCents = Math.round(originalAmount * rate);
    }

    // Format amounts
    const formattedOriginal = from.toUpperCase() === 'JPY' 
      ? originalAmount.toFixed(0) 
      : (originalAmount / 100).toFixed(2);

    return new Response(
      JSON.stringify({
        originalAmount: amountNum,
        convertedAmount: amountInZARCents,
        from: from.toUpperCase(),
        to: to.toUpperCase(),
        rate,
        formattedOriginal,
        formattedConverted: (amountInZARCents / 100).toFixed(2),
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[convert-currency] Error converting currency:', error);
    return new Response(
      JSON.stringify({ error: { message: 'Failed to convert currency' } }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}

