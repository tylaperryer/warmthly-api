const allowedOrigins = [
  'https://www.warmthly.org',
  'https://mint.warmthly.org',
  'https://post.warmthly.org',
  'https://admin.warmthly.org',
];

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

  const publicKey = env.YOCO_PUBLIC_KEY;

  if (!publicKey || typeof publicKey !== 'string') {
    console.error('[get-yoco-public-key] Yoco public key not configured');
    return new Response(
      JSON.stringify({ error: { message: 'Yoco public key not configured' } }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  return new Response(
    JSON.stringify({ publicKey }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

