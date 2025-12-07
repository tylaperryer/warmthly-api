interface Env {
  YOCO_SECRET_KEY: string;
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
  
  const mainSiteUrl = 'https://www.warmthly.org';
  const origin = request.headers.get('Origin') || '';
  const isAllowedOrigin = allowedOrigins.some(allowed => origin.includes(allowed));

  const corsHeaders = {
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Origin': isAllowedOrigin ? origin : allowedOrigins[0],
  };

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (request.method === 'POST') {
    if (!isAllowedOrigin) {
      return new Response('Forbidden: Invalid origin', { status: 403 });
    }
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

  return Response.redirect(mainSiteUrl, 302);
};
