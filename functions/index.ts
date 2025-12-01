// This is the final, polished version of src/index.ts with redirection.

interface Env {
  YOCO_SECRET_KEY: string;
  // Add other secrets here as you need them, e.g., RESEND_API_KEY: string;
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env } = context;

  const allowedOrigin = 'https://www.warmthly.org';
  const mainSiteUrl = 'https://www.warmthly.org'; // The URL to redirect to.

  const corsHeaders = {
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Origin': allowedOrigin,
  };

  // --- RULE 1: Handle the browser's pre-flight security check ---
  if (request.method === 'OPTIONS' ) {
    return new Response(null, { headers: corsHeaders });
  }

  // --- RULE 2: Handle legitimate POST requests from your frontend ---
  if (request.method === 'POST') {
    // Check that the request is coming from your actual website.
    const origin = request.headers.get('Origin');
    if (origin !== allowedOrigin) {
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
          success_url: `${mainSiteUrl}/payment-success`,
          cancel_url: `${mainSiteUrl}/payment-cancelled`
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
  }

  // --- RULE 3: For ALL other requests (GET, PUT, etc.), redirect to the main site ---
  // This is the "bounce back" logic.
  return Response.redirect(mainSiteUrl, 302);
};
