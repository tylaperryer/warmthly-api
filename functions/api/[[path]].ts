// This is the secure, headless version of src/index.ts

interface Env {
  YOCO_SECRET_KEY: string;
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env } = context;

  // Define the only domain that is allowed to talk to this API
  const allowedOrigin = 'https://www.warmthly.org';

  const corsHeaders = {
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Origin': allowedOrigin,
  };

  // --- RULE 1: Handle the browser's pre-flight security check ---
  if (request.method === 'OPTIONS' ) {
    return new Response(null, { headers: corsHeaders });
  }

  // --- RULE 2: Only allow POST requests from here on ---
  if (request.method !== 'POST') {
    // This is what a visitor typing the URL in their browser will see.
    // It's a generic "not found" error, revealing nothing.
    return new Response('Not Found', { status: 404 });
  }

  // --- RULE 3: Check that the request is coming from your actual website ---
  const origin = request.headers.get('Origin');
  if (origin !== allowedOrigin) {
    // This blocks other websites or tools from trying to use your API.
    return new Response('Forbidden: Invalid origin', { status: 403 });
  }

  // --- If all rules pass, proceed with the payment logic ---
  try {
    const body = await request.json<{ amount?: number; currency?: string }>();
    const { amount, currency } = body;

    if (!amount || !currency) {
      return new Response('Invalid request body: Missing amount or currency', { status: 400, headers: corsHeaders });
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
      const errorBody = await yocoResponse.text();
      return new Response(`Yoco API error: ${errorBody}`, { status: yocoResponse.status, headers: corsHeaders });
    }

    const yocoData = await yocoResponse.json();
    const responseData = JSON.stringify({ id: yocoData.id });

    return new Response(responseData, {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error creating checkout:', error);
    return new Response('Internal Server Error', { status: 500, headers: corsHeaders });
  }
};
